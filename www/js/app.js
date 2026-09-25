/* ----------------------------------------------------
 * APP
 * Screens, alarms, the wake-up sequence, and background poem prep.
 * ---------------------------------------------------- */
import * as cfg from './config.js';
import * as store from './storage.js';
import { LIBRARY_POEMS, pickPoem } from './poems.js';
import { nextRing, describeDays, describeCountdown, formatTime, newAlarmId, WEEKDAYS, WEEKEND, EVERY_DAY } from './schedule.js';
import { fetchPoem, synthesizeSpeech, recitationScript, wavDurationSeconds, checkApiKey, explainGeminiError } from './gemini.js';
import { platform } from './platform.js';
import { unlockAudio } from './sound.js';
import { runSetup } from './setup.js';

const $ = (id) => document.getElementById(id);

const state = {
    info: { edition: "portfolio", version: "web" },
    alarms: [],
    snooze: null,
    ring: null,          // { poem, alarmId, test, at, highlightTimer }
    lastDismissed: null, // { poem, at } for the journal prompt
    previewing: null,    // poem id currently being previewed
};

/* ================= UTIL ================= */
export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer;
export function toast(message, isError = false) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("is-error", isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3200);
}

function use24h() { return store.getSetting("use24h"); }

function timeParts(date) {
    return formatTime(date.getHours(), date.getMinutes(), use24h());
}

function ringLabel(at) {
    const d = new Date(at);
    const { time, period } = timeParts(d);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    let day;
    if (d.toDateString() === today.toDateString()) day = "Today";
    else if (d.toDateString() === tomorrow.toDateString()) day = "Tomorrow";
    else day = d.toLocaleDateString(undefined, { weekday: "long" });
    return `${day} at ${time}${period ? " " + period : ""}`;
}

function allPoems() {
    return [...store.getDiscoveredPoems(), ...LIBRARY_POEMS];
}

/* ================= STARTUP ================= */
async function init() {
    state.info = await platform.info().catch(() => state.info);
    state.alarms = store.getAlarms();
    state.snooze = store.getSnooze();

    applyEdition();
    bindNavigation();
    bindAlarmEditor();
    bindPoems();
    bindJournal();
    bindSettings();
    bindRinging();
    bindNightstand();
    document.addEventListener("pointerdown", unlockAudio, { passive: true });

    if (!platform.isNative) {
        $("webNotice").hidden = false;
        $("webLimitSection").hidden = false;
        registerServiceWorker();
    }

    await adoptNativeState();
    syncNative().catch(err => console.warn("Initial alarm sync failed:", err));
    renderAlarms();
    renderNextPoem();
    renderPoemList();
    renderJournal();
    tick();
    setInterval(tick, 1000);

    platform.onRingStart((e) => startRing({ alarmId: e.alarmId, at: e.at }));
    platform.onRingStop((e) => finishRing(e.reason === "dismiss" ? "dismiss" : "snooze", { fromNative: true }));
    document.addEventListener("visibilitychange", onVisible);

    if (!store.isOnboarded()) {
        await runSetup(setupApi);
    } else {
        refreshPermissions();
    }

    const ringing = await platform.ringState().catch(() => null);
    if (ringing?.ringing) startRing({ alarmId: ringing.alarmId, at: ringing.at });

    maybeFetchDailyPoem();
    schedulePrefetch(4000);
}

/** On Android the native side is the source of truth for alarms: it switches off one-time alarms after they ring. */
async function adoptNativeState() {
    if (!platform.isNative) return;
    const native = await platform.ringState().catch(() => null);
    if (!native) return;
    if (Array.isArray(native.alarms)) {
        state.alarms = native.alarms;
        store.saveAlarms(state.alarms);
    }
    state.snooze = native.snooze ?? null;
    store.setSnooze(state.snooze);
    // An alarm was dismissed from the notification without opening the app: that poem has been used.
    if (native.lastDismissedAt && native.lastDismissedAt > store.getLastFired()) {
        store.setLastFired(native.lastDismissedAt);
        consumeUpcomingPoem();
    }
}

async function onVisible() {
    if (document.visibilityState !== "visible") {
        // Leaving the app is a good moment to get tomorrow's audio ready.
        schedulePrefetch(0);
        return;
    }
    await adoptNativeState();
    renderAlarms();
    renderNextPoem();
    refreshPermissions();
    const ringing = await platform.ringState().catch(() => null);
    if (ringing?.ringing) startRing({ alarmId: ringing.alarmId, at: ringing.at });
}

function applyEdition() {
    const personal = state.info.edition === "personal";
    const first = cfg.AUTHOR_NAME.split(" ")[0];
    const tag = $("editionTag");
    tag.hidden = !personal;
    tag.textContent = `${first}'s edition`;

    const credit = $("credit");
    const name = cfg.AUTHOR_URL
        ? `<a href="${escapeHtml(cfg.AUTHOR_URL)}" target="_blank" rel="noopener">${escapeHtml(cfg.AUTHOR_NAME)}</a>`
        : escapeHtml(cfg.AUTHOR_NAME);
    credit.innerHTML = personal
        ? `Reveille ${escapeHtml(state.info.version)}. Made for and by ${name}.`
        : `Reveille ${escapeHtml(state.info.version)}. Made by ${name}. Free and open source (MIT).`;

    if (cfg.SUPPORT_LINK && !personal) {
        $("supportLink").innerHTML = `<a class="btn btn-quiet" href="${escapeHtml(cfg.SUPPORT_LINK)}" target="_blank" rel="noopener">Support this project</a>`;
    }
}

function registerServiceWorker() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
        navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker failed:", err));
    }
}

/* ================= NAVIGATION ================= */
function bindNavigation() {
    document.addEventListener("click", (e) => {
        const target = e.target.closest("[data-goto]");
        if (target) showTab(target.dataset.goto);
    });
}

export function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => { t.hidden = t.dataset.tab !== name; });
    document.querySelectorAll(".tabbar button").forEach(b => {
        if (b.dataset.goto === name) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
    });
    if (name === "journal") renderJournal();
    if (name === "settings") refreshPermissions();
    window.scrollTo({ top: 0 });
}

/* ================= CLOCK & WEB RINGING ================= */
function tick() {
    const now = new Date();
    const { time, period } = timeParts(now);
    $("clockTime").textContent = time;
    $("clockPeriod").textContent = period;
    $("today").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    $("ringClock").textContent = `${time}${period ? " " + period : ""}`;
    $("nsClock").textContent = time;

    const next = nextRing(state.alarms, state.snooze, now.getTime());
    renderNextLabel(next, now.getTime());

    if (!platform.isNative) checkWebRing(now.getTime());
}

function renderNextLabel(next, now) {
    const label = $("nextAlarm");
    const sun = $("sun");
    if (!next) {
        label.textContent = state.alarms.length ? "All alarms are off" : "No alarm set";
        $("nsNext").textContent = "No alarm set";
        sun.style.setProperty("--rise", "0");
        return;
    }
    const what = next.isSnooze ? "Snoozed until" : "Next alarm";
    label.innerHTML = `${what} <strong>${escapeHtml(ringLabel(next.at))}</strong>, ${describeCountdown(next.at, now)}`;
    $("nsNext").textContent = `${ringLabel(next.at)}`;
    // Sun climbs over the last 9 hours before the alarm.
    const rise = Math.max(0, Math.min(1, 1 - (next.at - now) / (9 * 3600000)));
    sun.style.setProperty("--rise", rise.toFixed(3));
}

/** Browser only: ring when the clock passes the next alarm (up to 15 min late, e.g. after the tab was asleep). */
function checkWebRing(now) {
    if (state.ring) return;
    const lastFired = store.getLastFired();
    const due = nextRing(state.alarms, state.snooze, Math.max(lastFired, now - 15 * 60000));
    if (!due || due.at > now || due.at <= lastFired) return;
    store.setLastFired(due.at);
    if (due.isSnooze) {
        state.snooze = null;
        store.setSnooze(null);
    } else {
        disableIfOnce(due.alarmId);
    }
    startRing({ alarmId: due.alarmId, at: due.at });
}

function disableIfOnce(alarmId) {
    const alarm = state.alarms.find(a => a.id === alarmId);
    if (alarm && alarm.days.length === 0) {
        alarm.enabled = false;
        saveAlarms();
    }
}

/* ================= ALARMS ================= */
function saveAlarms() {
    state.alarms.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    store.saveAlarms(state.alarms);
    syncNative().catch(err => {
        console.error(err);
        toast("Couldn't schedule the alarm with Android. Check alarm permissions in Settings.", true);
    });
    renderAlarms();
    tick();
    schedulePrefetch(8000);
}

function syncNative() {
    const poem = ensureUpcomingPoem();
    return platform.syncAlarms(state.alarms, state.snooze, {
        snoozeMinutes: Number(store.getSetting("snoozeMinutes")),
        upcomingAudioKey: audioKey(poem),
    });
}

function renderAlarms() {
    const list = $("alarmList");
    if (!state.alarms.length) {
        list.innerHTML = `<li class="empty">No alarms yet. Add one with the + button.</li>`;
        return;
    }
    list.innerHTML = state.alarms.map(a => {
        const { time, period } = formatTime(a.hour, a.minute, use24h());
        const meta = [describeDays(a.days), a.label].filter(Boolean).join(", ");
        return `<li class="alarm ${a.enabled ? "" : "is-off"}">
            <button class="alarm-open" type="button" data-edit="${a.id}" aria-label="Edit ${escapeHtml(time + " " + period)} alarm">
                <span class="alarm-time">${time}<small>${period}</small></span>
                <span class="alarm-meta">${escapeHtml(meta)}</span>
            </button>
            <input type="checkbox" class="switch" data-toggle="${a.id}" ${a.enabled ? "checked" : ""} aria-label="Alarm on">
        </li>`;
    }).join("");
}

let editingId = null;
let editingDays = [];

function renderDayChips() {
    const letters = [["M", 1, "Monday"], ["T", 2, "Tuesday"], ["W", 3, "Wednesday"], ["T", 4, "Thursday"], ["F", 5, "Friday"], ["S", 6, "Saturday"], ["S", 0, "Sunday"]];
    $("dayChips").innerHTML = letters.map(([l, d, name]) =>
        `<button type="button" data-day="${d}" aria-pressed="${editingDays.includes(d)}" aria-label="${name}">${l}</button>`
    ).join("");
}

export function openAlarmEditor(alarm) {
    editingId = alarm?.id ?? null;
    editingDays = alarm ? [...alarm.days] : [...WEEKDAYS];
    $("sheetTitle").textContent = alarm ? "Edit alarm" : "New alarm";
    const h = alarm?.hour ?? 6, m = alarm?.minute ?? 45;
    $("alarmTime").value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    $("alarmLabel").value = alarm?.label ?? "";
    $("deleteAlarmBtn").hidden = !alarm;
    renderDayChips();
    $("alarmSheet").showModal();
}

function bindAlarmEditor() {
    $("addAlarmBtn").addEventListener("click", () => openAlarmEditor(null));

    $("alarmList").addEventListener("click", (e) => {
        const edit = e.target.closest("[data-edit]");
        if (edit) openAlarmEditor(state.alarms.find(a => a.id === edit.dataset.edit));
    });
    $("alarmList").addEventListener("change", (e) => {
        const id = e.target.dataset.toggle;
        if (!id) return;
        const alarm = state.alarms.find(a => a.id === id);
        alarm.enabled = e.target.checked;
        saveAlarms();
        if (alarm.enabled) announceNext();
    });

    $("dayChips").addEventListener("click", (e) => {
        const d = e.target.closest("[data-day]");
        if (!d) return;
        const day = Number(d.dataset.day);
        editingDays = editingDays.includes(day) ? editingDays.filter(x => x !== day) : [...editingDays, day];
        renderDayChips();
    });
    document.querySelector(".presets").addEventListener("click", (e) => {
        const p = e.target.closest("[data-preset]")?.dataset.preset;
        if (!p) return;
        editingDays = { once: [], weekdays: [...WEEKDAYS], weekends: [...WEEKEND], daily: [...EVERY_DAY] }[p];
        renderDayChips();
    });

    $("alarmForm").addEventListener("submit", (e) => {
        if (e.submitter?.value !== "save") return;
        const [hour, minute] = $("alarmTime").value.split(":").map(Number);
        if (Number.isNaN(hour)) { e.preventDefault(); return; }
        const fields = { hour, minute, days: [...editingDays], label: $("alarmLabel").value.trim(), enabled: true };
        if (editingId) Object.assign(state.alarms.find(a => a.id === editingId), fields);
        else state.alarms.push({ id: newAlarmId(), ...fields });
        saveAlarms();
        announceNext();
    });

    $("deleteAlarmBtn").addEventListener("click", () => {
        state.alarms = state.alarms.filter(a => a.id !== editingId);
        if (state.snooze?.alarmId === editingId) { state.snooze = null; store.setSnooze(null); }
        $("alarmSheet").close();
        saveAlarms();
        toast("Alarm deleted");
    });
}

function announceNext() {
    const next = nextRing(state.alarms, state.snooze);
    if (next) toast(`Alarm set for ${ringLabel(next.at).replace(/^./, c => c.toLowerCase())}, ${describeCountdown(next.at)}`);
}

/** Used by setup to create the first alarm. */
export function addAlarm(hour, minute, days) {
    state.alarms.push({ id: newAlarmId(), hour, minute, days, label: "", enabled: true });
    saveAlarms();
}

/* ================= UPCOMING POEM ================= */
function ensureUpcomingPoem() {
    let poem = store.getUpcomingPoem();
    if (!poem) {
        const recent = store.getRecentlyUsed(cfg.POEM_HISTORY_WINDOW_DAYS).map(e => e.id);
        poem = pickPoem(allPoems(), store.getSetting("poemFilter"), store.getSetting("season"), recent);
        store.setUpcomingPoem(poem);
    }
    return poem;
}

function consumeUpcomingPoem() {
    const poem = store.getUpcomingPoem();
    if (poem) {
        store.addPoemToHistory(poem);
        state.lastDismissed = { poem, at: Date.now() };
    }
    store.setUpcomingPoem(null);
    ensureUpcomingPoem();
    renderNextPoem();
    schedulePrefetch(3000);
}

function verseHtml(lines, count) {
    return lines.slice(0, count).map(l => l.trim() ? `<p>${escapeHtml(l)}</p>` : "").join("");
}

function renderNextPoem() {
    const poem = ensureUpcomingPoem();
    const source = poem.source === "gemini" ? `<p class="source">Found by Gemini, so double-check the wording before quoting it.</p>` : "";
    $("nextPoem").innerHTML = `
        <h3>${escapeHtml(poem.title)}</h3>
        <p class="by">${escapeHtml(poem.author)}</p>
        <div class="verse">${verseHtml(poem.lines.filter(l => l.trim()), 3)}</div>
        ${source}`;
}

function chooseAnotherPoem() {
    const current = store.getUpcomingPoem();
    const recent = store.getRecentlyUsed(cfg.POEM_HISTORY_WINDOW_DAYS).map(e => e.id);
    const pool = allPoems().filter(p => p.id !== current?.id);
    store.setUpcomingPoem(pickPoem(pool.length ? pool : allPoems(), store.getSetting("poemFilter"), store.getSetting("season"), recent));
    renderNextPoem();
    schedulePrefetch(8000);
}

/* ---------- Background prep: fresh daily poem + pre-recorded voice ---------- */
async function maybeFetchDailyPoem() {
    if (!store.getGeminiApiKey()) return;
    const hours = (Date.now() - store.getLastOracleFetchTime()) / 3600000;
    if (hours < cfg.ORACLE_PREFETCH_INTERVAL_HOURS) return;
    store.setLastOracleFetchTime(Date.now()); // Don't retry on every open if Google is down.
    try {
        const filter = store.getSetting("poemFilter");
        const season = store.getSetting("season");
        const recent = store.getRecentlyUsed(cfg.POEM_HISTORY_WINDOW_DAYS).map(e => e.title);
        const poem = await fetchPoem(`a ${season === "rain" ? "rainy" : season} morning`, filter, recent);
        store.addDiscoveredPoem(poem);
        store.setUpcomingPoem(poem);
        renderNextPoem();
        renderPoemList();
        schedulePrefetch(1000);
    } catch (err) {
        console.warn("Daily poem lookup failed:", err);
    }
}

function audioKey(poem) {
    return [cfg.GEMINI_TTS_MODEL, poem.id, store.getSetting("voiceName"), persona()].join("|");
}

function persona() {
    return store.getSetting("voicePersona") || cfg.DEFAULT_PERSONA;
}

let prefetchTimer = null;
let prefetching = false;
let nativeCachedKey = null;
function schedulePrefetch(delayMs) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(prefetchVoice, delayMs);
}

/** Record tomorrow's poem ahead of time, so waking up doesn't depend on the internet. */
async function prefetchVoice() {
    if (prefetching || state.ring || !store.getGeminiApiKey()) return;
    if (!nextRing(state.alarms, state.snooze)) return;
    const poem = ensureUpcomingPoem();
    const key = audioKey(poem);
    prefetching = true;
    try {
        await syncNative();
        let wav = await store.getCachedAudio(key);
        if (!wav) {
            wav = await synthesizeSpeech(recitationScript(poem), store.getSetting("voiceName"), persona());
            await store.setCachedAudio(key, wav);
        }
        if (platform.isNative && nativeCachedKey !== key) {
            await platform.cacheAudio(key, wav);
            nativeCachedKey = key;
        }
    } catch (err) {
        console.warn("Voice prefetch failed (will try again at wake-up):", err);
    } finally {
        prefetching = false;
    }
}

/* ================= THE WAKE-UP ================= */
function voiceNote(kind) {
    const voice = store.getSetting("voiceName");
    return {
        gemini: `Read by ${voice}`,
        device: store.getGeminiApiKey()
            ? "Gemini couldn't be reached, so your phone's voice is reading instead"
            : "Read by your phone's voice. Add a Gemini key in Settings for a better one",
        failed: "The voice couldn't start, so a backup chime will ring",
    }[kind];
}

export async function startRing({ alarmId = null, at = Date.now(), test = false } = {}) {
    if (state.ring) return;
    const poem = ensureUpcomingPoem();
    state.ring = { poem, alarmId, test, at, highlightTimer: null };

    $("ringTitle").textContent = poem.title;
    $("ringAuthor").textContent = poem.author;
    $("ringLines").innerHTML = poem.lines.map((l, i) =>
        l.trim() ? `<p data-line="${i}">${escapeHtml(l)}</p>` : `<p class="gap"></p>`).join("");
    $("ringStatus").textContent = "";
    $("ringGreeting").textContent = greeting();
    $("snoozeBtn").textContent = `Snooze ${store.getSetting("snoozeMinutes")} min`;
    $("snoozeBtn").hidden = test;
    const dawn = document.querySelector(".dawn");
    dawn.style.animation = "none";
    void dawn.offsetWidth; // restart the sunrise
    dawn.style.animation = "";
    $("ringing").hidden = false;
    $("nightstand").hidden = true;
    platform.keepScreenOn();

    // If nothing is audible within 30 s, the chime takes over.
    await platform.armFailsafe(cfg.FAILSAFE_START_SECONDS).catch(() => {});
    platform.playAmbient(store.getSetting("bgSound"));

    const ring = state.ring;
    const onEnded = () => {
        if (state.ring !== ring) return;
        highlightAll();
        platform.armFailsafe(cfg.FAILSAFE_AFTER_POEM_SECONDS).catch(() => {});
    };

    // Android may already be playing the pre-recorded poem: just follow along on screen.
    const native = platform.isNative && !test ? await platform.ringState().catch(() => null) : null;
    if (native?.audioPlaying) {
        platform.onceVoiceEnded(onEnded);
        startHighlight(poem, native.audioDuration, native.audioElapsed);
        $("ringStatus").textContent = voiceNote("gemini");
        return;
    }

    const wav = await getPoemAudio(poem);
    if (state.ring !== ring) return; // dismissed while loading
    try {
        if (wav) {
            const duration = (await platform.playWav(wav, cfg.VOLUME_RAMP_SECONDS, onEnded)) || await wavDurationSeconds(wav);
            startHighlight(poem, duration);
            $("ringStatus").textContent = voiceNote("gemini");
        } else {
            await platform.speak(recitationScript(poem), onEnded);
            startHighlight(poem, estimateSpeechSeconds(poem));
            $("ringStatus").textContent = voiceNote("device");
        }
        await platform.acknowledge();
    } catch (err) {
        console.error("Couldn't play the poem:", err);
        $("ringStatus").textContent = voiceNote("failed");
    }
}

async function getPoemAudio(poem) {
    if (!store.getGeminiApiKey()) return null;
    const key = audioKey(poem);
    const cached = await store.getCachedAudio(key);
    if (cached) return cached;
    try {
        $("ringStatus").textContent = "Preparing the voice…";
        const wav = await synthesizeSpeech(recitationScript(poem), store.getSetting("voiceName"), persona(), 20000);
        store.setCachedAudio(key, wav);
        return wav;
    } catch (err) {
        console.warn("Live voice failed, using the phone's voice:", err);
        return null;
    }
}

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Still dark out";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
}

function estimateSpeechSeconds(poem) {
    const words = recitationScript(poem).split(/\s+/).length;
    return words / 2.1 + poem.lines.length * 0.35;
}

/** Light up each line as it's likely being read, pacing by line length. */
function startHighlight(poem, durationSec, alreadyElapsedSec = 0) {
    const ring = state.ring;
    const intro = poem.title.length + poem.author.length + 22;
    const weights = poem.lines.map(l => (l.trim() ? l.length + 10 : 6));
    const total = intro + weights.reduce((a, b) => a + b, 0);
    const started = performance.now() - alreadyElapsedSec * 1000;
    const lines = [...$("ringLines").querySelectorAll("p")];
    let lastIndex = -1;

    clearInterval(ring.highlightTimer);
    ring.highlightTimer = setInterval(() => {
        const progress = ((performance.now() - started) / 1000 / durationSec) * total - intro;
        let acc = 0, index = -1;
        for (let i = 0; i < weights.length; i++) {
            if (progress >= acc) index = i;
            acc += weights[i];
        }
        if (index === lastIndex) return;
        lastIndex = index;
        lines.forEach((p, i) => {
            p.classList.toggle("current", i === index);
            p.classList.toggle("spoken", i < index);
        });
        lines[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        if (progress > total) clearInterval(ring.highlightTimer);
    }, 200);
}

function highlightAll() {
    if (state.ring) clearInterval(state.ring.highlightTimer);
    $("ringLines").querySelectorAll("p").forEach(p => { p.classList.remove("current"); p.classList.add("spoken"); });
}

async function finishRing(outcome, { fromNative = false } = {}) {
    const ring = state.ring;
    if (!ring) return;
    state.ring = null;
    clearInterval(ring.highlightTimer);
    $("ringing").hidden = true;
    platform.releaseScreen();

    if (outcome === "snooze") {
        const minutes = Number(store.getSetting("snoozeMinutes"));
        if (!fromNative) {
            const result = await platform.snooze(minutes).catch(() => null);
            state.snooze = { at: result?.at ?? Date.now() + minutes * 60000, alarmId: ring.alarmId };
        } else {
            const native = await platform.ringState().catch(() => null);
            state.snooze = native?.snooze ?? { at: Date.now() + minutes * 60000, alarmId: ring.alarmId };
        }
        store.setSnooze(state.snooze);
        tick();
        toast(`Snoozed. Ringing again at ${ringLabel(state.snooze.at).replace(/^(Today|Tomorrow) at /, "")}`);
        return;
    }

    if (!fromNative) await platform.dismiss().catch(() => {});
    if (state.snooze) { state.snooze = null; store.setSnooze(null); }
    if (!ring.test) {
        // Mark as handled up to *now*, so the catch-up check in adoptNativeState()
        // doesn't see Android's dismiss time as a second, unhandled wake-up.
        store.setLastFired(Math.max(store.getLastFired(), ring.at, Date.now()));
        consumeUpcomingPoem();
        await adoptNativeState();
        renderAlarms();
        showTab("journal");
    } else {
        toast("That's how your mornings will sound.");
    }
    tick();
}

function bindRinging() {
    $("awakeBtn").addEventListener("click", () => finishRing("dismiss"));
    $("snoozeBtn").addEventListener("click", () => finishRing("snooze"));
    $("testAlarmBtn").addEventListener("click", () => { unlockAudio(); startRing({ test: true }); });
    $("shuffleBtn").addEventListener("click", chooseAnotherPoem);
}

/* ================= NIGHTSTAND (browser) ================= */
function bindNightstand() {
    $("nightstandBtn").addEventListener("click", async () => {
        unlockAudio();
        if (!nextRing(state.alarms, state.snooze)) {
            toast("Add an alarm first", true);
            return;
        }
        $("nightstand").hidden = false;
        const held = await platform.keepScreenOn();
        if (!held) toast("This browser may still let the screen sleep. Set auto-lock to Never tonight.", true);
    });
    let lastTap = 0;
    $("nightstand").addEventListener("click", () => {
        const now = Date.now();
        if (now - lastTap < 400) {
            $("nightstand").hidden = true;
            platform.releaseScreen();
        }
        lastTap = now;
    });
}

/* ================= POEMS TAB ================= */
function bindPoems() {
    const setFilter = (filter) => {
        document.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.filter === filter)));
    };
    setFilter(store.getSetting("poemFilter"));
    document.querySelector(".segmented").addEventListener("click", (e) => {
        const b = e.target.closest("[data-filter]");
        if (!b) return;
        store.setSetting("poemFilter", b.dataset.filter);
        setFilter(b.dataset.filter);
        chooseAnotherPoem();
    });

    $("seasonSelect").value = store.getSetting("season");
    $("seasonSelect").addEventListener("change", (e) => store.setSetting("season", e.target.value));

    $("oracleForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = $("oracleBtn");
        const mood = $("oracleMood").value.trim() || "a quiet morning";
        if (!store.getGeminiApiKey()) { toast("Add your Gemini API key in Settings first", true); return; }
        btn.disabled = true;
        btn.textContent = "Finding…";
        try {
            const recent = store.getRecentlyUsed(cfg.POEM_HISTORY_WINDOW_DAYS).map(e => e.title);
            const poem = await fetchPoem(mood, store.getSetting("poemFilter"), recent);
            store.addDiscoveredPoem(poem);
            store.setUpcomingPoem(poem);
            renderPoemList();
            renderNextPoem();
            schedulePrefetch(3000);
            $("oracleMood").value = "";
            toast(`Found “${poem.title}”. It's your next poem.`);
        } catch (err) {
            toast(explainGeminiError(err), true);
        } finally {
            btn.disabled = false;
            btn.textContent = "Find";
        }
    });

    $("poemList").addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-action]");
        if (!b) return;
        const poem = allPoems().find(p => p.id === b.dataset.id);
        if (!poem) return;
        if (b.dataset.action === "use") {
            store.setUpcomingPoem(poem);
            renderNextPoem();
            schedulePrefetch(5000);
            toast(`“${poem.title}” will wake you next`);
        } else if (b.dataset.action === "listen") {
            previewPoem(poem, b);
        } else if (b.dataset.action === "remove") {
            store.removeDiscoveredPoem(poem.id);
            if (store.getUpcomingPoem()?.id === poem.id) { store.setUpcomingPoem(null); renderNextPoem(); }
            renderPoemList();
        }
    });
}

function renderPoemList() {
    $("poemList").innerHTML = allPoems().map(p => {
        const tags = [p.archetype === "surprising" ? "Strange image" : "A scene", p.source === "gemini" ? "found by Gemini" : p.season].join(", ");
        return `<li class="poem-item">
            <p class="tags">${escapeHtml(tags)}</p>
            <h3>${escapeHtml(p.title)}</h3>
            <p class="by">${escapeHtml(p.author)}</p>
            <div class="verse">${verseHtml(p.lines.filter(l => l.trim()), 2)}</div>
            <div class="poem-actions">
                <button class="text-btn" type="button" data-action="listen" data-id="${escapeHtml(p.id)}"><svg><use href="#i-play"/></svg>Listen</button>
                <button class="text-btn" type="button" data-action="use" data-id="${escapeHtml(p.id)}"><svg><use href="#i-alarm"/></svg>Wake to this</button>
                ${p.source === "gemini" ? `<button class="text-btn" type="button" data-action="remove" data-id="${escapeHtml(p.id)}">Remove</button>` : ""}
            </div>
        </li>`;
    }).join("");
}

async function previewPoem(poem, button) {
    unlockAudio();
    await platform.stopAudio();
    const label = button.innerHTML;
    if (state.previewing === poem.id) { state.previewing = null; return; }
    state.previewing = poem.id;
    const reset = () => { if (state.previewing === poem.id) state.previewing = null; button.innerHTML = label; };
    button.textContent = "Loading…";
    try {
        const wav = store.getGeminiApiKey()
            ? await synthesizeSpeech(recitationScript(poem), store.getSetting("voiceName"), persona()).catch(err => { toast(explainGeminiError(err), true); return null; })
            : null;
        if (state.previewing !== poem.id) return;
        button.textContent = "Stop";
        if (wav) await platform.playWav(wav, 0, reset);
        else await platform.speak(recitationScript(poem), reset);
    } catch {
        reset();
        toast("Couldn't play audio on this device", true);
    }
}

/* ================= JOURNAL ================= */
function bindJournal() {
    $("saveJournalBtn").addEventListener("click", () => {
        const text = $("journalInput").value.trim();
        if (!text) { $("journalInput").focus(); return; }
        const poem = state.lastDismissed?.poem;
        store.addJournalEntry({ text, poemTitle: poem?.title, poemAuthor: poem?.author });
        $("journalInput").value = "";
        renderJournal();
        toast("Entry saved");
    });
    $("journalList").addEventListener("click", (e) => {
        const b = e.target.closest("[data-delete]");
        if (b && confirm("Delete this entry?")) {
            store.deleteJournalEntry(b.dataset.delete);
            renderJournal();
        }
    });
}

function renderJournal() {
    const recent = state.lastDismissed && Date.now() - state.lastDismissed.at < 12 * 3600000 ? state.lastDismissed.poem : null;
    $("journalPrompt").textContent = recent
        ? `What from “${recent.title}” is still with you?`
        : "What image or thought is with you this morning?";

    const entries = store.getJournalEntries();
    $("journalList").innerHTML = entries.length
        ? entries.map(e => `<li class="journal-entry">
            <p class="when"><span>${new Date(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
               <button class="text-btn" type="button" data-delete="${escapeHtml(e.date)}">Delete</button></p>
            ${e.poemTitle ? `<p class="after">after ${escapeHtml(e.poemTitle)}</p>` : ""}
            <p class="text">${escapeHtml(e.text)}</p>
          </li>`).join("")
        : `<li class="empty">Your entries will appear here. The best time to write is right after the alarm.</li>`;
}

/* ================= SETTINGS ================= */
function bindSettings() {
    const keyInput = $("keyInput");
    keyInput.value = store.getGeminiApiKey();
    keyInput.addEventListener("change", () => {
        store.setGeminiApiKey(keyInput.value);
        updateKeyStatus();
        schedulePrefetch(3000);
    });
    $("checkKeyBtn").addEventListener("click", async () => {
        store.setGeminiApiKey(keyInput.value);
        await verifyKey($("keyStatus"));
    });
    updateKeyStatus();

    const voice = $("voiceSelect");
    voice.innerHTML = cfg.VOICES.map(v => `<option value="${v.id}">${v.id} (${v.note.toLowerCase()})</option>`).join("");
    voice.value = store.getSetting("voiceName");
    if (!voice.value) voice.value = cfg.VOICES[0].id;
    voice.addEventListener("change", () => { store.setSetting("voiceName", voice.value); schedulePrefetch(8000); });

    $("personaInput").value = persona();
    $("personaInput").addEventListener("change", (e) => {
        store.setSetting("voicePersona", e.target.value.trim() || cfg.DEFAULT_PERSONA);
        schedulePrefetch(8000);
    });

    $("bgSoundSelect").value = store.getSetting("bgSound");
    $("bgSoundSelect").addEventListener("change", (e) => store.setSetting("bgSound", e.target.value));

    $("snoozeSelect").value = String(store.getSetting("snoozeMinutes"));
    $("snoozeSelect").addEventListener("change", (e) => { store.setSetting("snoozeMinutes", Number(e.target.value)); syncNative().catch(() => {}); });

    $("use24hToggle").checked = use24h();
    $("use24hToggle").addEventListener("change", (e) => { store.setSetting("use24h", e.target.checked); renderAlarms(); tick(); });

    $("testVoiceBtn").addEventListener("click", testVoice);
    $("rerunSetupBtn").addEventListener("click", () => runSetup(setupApi));

    $("permList").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-fix]");
        if (!b) return;
        await fixPermission(b.dataset.fix);
    });
}

function updateKeyStatus() {
    const has = !!store.getGeminiApiKey();
    $("voiceStatus").textContent = has ? "" : "Without a key, your phone's built-in voice reads the poem.";
    if (!has) $("keyStatus").textContent = "";
}

export async function verifyKey(statusEl) {
    if (!store.getGeminiApiKey()) {
        statusEl.textContent = "Paste a key first.";
        return false;
    }
    statusEl.textContent = "Checking with Google…";
    try {
        await checkApiKey();
        statusEl.textContent = "Key works. Gemini will read your poems.";
        schedulePrefetch(2000);
        maybeFetchDailyPoem();
        return true;
    } catch (err) {
        statusEl.textContent = explainGeminiError(err);
        return false;
    }
}

export async function testVoice() {
    unlockAudio();
    await platform.stopAudio();
    const line = "Good morning. The fog comes on little cat feet.";
    if (store.getGeminiApiKey()) {
        try {
            const wav = await synthesizeSpeech(line, store.getSetting("voiceName"), persona(), 20000);
            await platform.playWav(wav, 0);
            return;
        } catch (err) {
            toast(explainGeminiError(err), true);
        }
    }
    await platform.speak(line).catch(() => toast("This device has no built-in voice available", true));
}

/* ---------- Android permissions ---------- */
const PERMISSIONS = {
    notifications: { title: "Notifications", why: "Shows the alarm and its Snooze button" },
    fullScreen: { title: "Full-screen alarm", why: "Opens the poem over the lock screen" },
    exactAlarm: { title: "Alarms and reminders", why: "Rings at the exact minute" },
};

export async function getPermissions() {
    if (!platform.isNative) return null;
    return platform.permissions().catch(() => null);
}

export async function fixPermission(which) {
    if (which === "notifications") {
        const result = await platform.requestNotifications().catch(() => null);
        if (result?.notifications !== "granted") await platform.openSystemSetting("notifications");
    } else {
        await platform.openSystemSetting(which);
    }
    setTimeout(refreshPermissions, 800);
}

export function permissionRowsHtml(perms) {
    return Object.entries(PERMISSIONS).map(([key, p]) => {
        const ok = perms[key] === "granted";
        return `<li class="perm ${ok ? "ok" : ""}">
            <svg><use href="#i-${ok ? "check" : "alert"}"/></svg>
            <span class="perm-text">${p.title}<small>${p.why}</small></span>
            ${ok ? "" : `<button class="btn btn-quiet" type="button" data-fix="${key}">Allow</button>`}
        </li>`;
    }).join("");
}

async function refreshPermissions() {
    const perms = await getPermissions();
    if (!perms) return;
    $("permSection").hidden = false;
    $("permList").innerHTML = permissionRowsHtml(perms);
    const missing = Object.keys(PERMISSIONS).filter(k => perms[k] !== "granted");
    $("permNotice").hidden = missing.length === 0;
    if (missing.length) {
        $("permNoticeText").textContent = `${missing.map(k => PERMISSIONS[k].title).join(" and ")} ${missing.length > 1 ? "are" : "is"} off, so alarms may not ring.`;
    }
}

/* Everything setup.js needs, passed in to avoid a circular import. */
const setupApi = {
    get isNative() { return platform.isNative; },
    toast, escapeHtml, verifyKey, testVoice, addAlarm, getPermissions, fixPermission, permissionRowsHtml,
    setKey: store.setGeminiApiKey,
    getKey: store.getGeminiApiKey,
    hasAlarms: () => state.alarms.length > 0,
    startTestRing: () => { unlockAudio(); return startRing({ test: true }); },
    finish: () => {
        store.setOnboarded();
        $("keyInput").value = store.getGeminiApiKey();
        updateKeyStatus();
        refreshPermissions();
        showTab("alarms");
    },
};

init();
