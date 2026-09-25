/* ----------------------------------------------------
 * STORAGE
 * Settings, alarms and journal live in localStorage. Pre-generated poem
 * audio is too big for that, so it goes in IndexedDB. Nothing here is
 * ever sent anywhere; gemini.js reads the API key back out and sends it
 * only to Google.
 * ---------------------------------------------------- */
import { newAlarmId, WEEKDAYS } from './schedule.js';

const KEYS = {
    geminiApiKey: "reveille_gemini_key",
    alarms: "reveille_alarms",
    snooze: "reveille_snooze",
    lastFired: "reveille_last_fired",
    onboarded: "reveille_onboarded",
    poemFilter: "reveille_poem_filter",
    season: "reveille_season",
    voiceName: "reveille_voice_name",
    voicePersona: "reveille_voice_persona",
    bgSound: "reveille_bg_sound",
    snoozeMinutes: "reveille_snooze_minutes",
    use24h: "reveille_use_24h",
    journalEntries: "reveille_journal_entries",
    poemHistory: "reveille_poem_history",
    upcomingPoem: "reveille_upcoming_poem",
    discoveredPoems: "reveille_discovered_poems",
    lastOracleFetch: "reveille_last_oracle_fetch",
    // Pre-2.0 single-alarm keys, read once for migration.
    legacyAlarmTime: "reveille_alarm_time",
    legacyAlarmEnabled: "reveille_alarm_enabled",
    legacyCachedOracle: "reveille_cached_oracle_poem",
};

function load(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("Couldn't save", key, e);
    }
}

function remove(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

/* ---------------- SETTINGS ---------------- */
const SETTING_DEFAULTS = {
    poemFilter: "narrative",
    season: "autumn",
    voiceName: "Sulafat",
    voicePersona: null, // filled from config at read time
    bgSound: "bowl",
    snoozeMinutes: 9,
    use24h: false,
};

export function getSetting(name) {
    return load(KEYS[name], SETTING_DEFAULTS[name]);
}

export function setSetting(name, value) {
    save(KEYS[name], value);
}

export function getGeminiApiKey() {
    return load(KEYS.geminiApiKey, "");
}

export function setGeminiApiKey(key) {
    save(KEYS.geminiApiKey, key.trim());
}

export function isOnboarded() {
    return load(KEYS.onboarded, false);
}

export function setOnboarded() {
    save(KEYS.onboarded, true);
}

/* ---------------- ALARMS ---------------- */
export function getAlarms() {
    const alarms = load(KEYS.alarms, null);
    if (alarms) return alarms;

    // First run on 2.0: carry over the old single alarm if there was one.
    const legacyTime = load(KEYS.legacyAlarmTime, null);
    if (legacyTime) {
        const [hour, minute] = legacyTime.split(':').map(Number);
        const migrated = [{
            id: newAlarmId(), hour, minute, days: [...WEEKDAYS],
            enabled: load(KEYS.legacyAlarmEnabled, true), label: "",
        }];
        saveAlarms(migrated);
        remove(KEYS.legacyAlarmTime);
        remove(KEYS.legacyAlarmEnabled);
        // Anyone upgrading has already been through setup.
        setOnboarded();
        return migrated;
    }
    return [];
}

export function saveAlarms(alarms) {
    save(KEYS.alarms, alarms);
}

export function getSnooze() {
    return load(KEYS.snooze, null);
}

export function setSnooze(snooze) {
    if (snooze) save(KEYS.snooze, snooze); else remove(KEYS.snooze);
}

/** The ring time most recently handled, so a ring is never started twice. */
export function getLastFired() {
    return load(KEYS.lastFired, 0);
}

export function setLastFired(at) {
    save(KEYS.lastFired, at);
}

/* ---------------- POEMS ---------------- */
/** History: [{ id, title, dateUsed }] */
export function getPoemHistory() {
    return load(KEYS.poemHistory, []);
}

export function addPoemToHistory(poem) {
    const history = getPoemHistory();
    history.push({ id: poem.id, title: poem.title, dateUsed: new Date().toISOString() });
    // Keep the log from growing forever; a year is plenty.
    save(KEYS.poemHistory, history.slice(-365));
}

export function getRecentlyUsed(windowDays) {
    const cutoff = Date.now() - windowDays * 86400000;
    return getPoemHistory().filter(e => new Date(e.dateUsed).getTime() >= cutoff);
}

/** The poem that will be read at the next alarm, chosen ahead of time so the preview matches. */
export function getUpcomingPoem() {
    const upcoming = load(KEYS.upcomingPoem, null);
    if (upcoming) return upcoming;
    const legacy = load(KEYS.legacyCachedOracle, null);
    if (legacy) {
        remove(KEYS.legacyCachedOracle);
        save(KEYS.upcomingPoem, legacy);
        return legacy;
    }
    return null;
}

export function setUpcomingPoem(poem) {
    if (poem) save(KEYS.upcomingPoem, poem); else remove(KEYS.upcomingPoem);
}

/** Poems Gemini has found for you, kept so they stay in your library. */
export function getDiscoveredPoems() {
    return load(KEYS.discoveredPoems, []);
}

export function addDiscoveredPoem(poem) {
    const poems = getDiscoveredPoems().filter(p => p.id !== poem.id);
    poems.unshift(poem);
    save(KEYS.discoveredPoems, poems.slice(0, 60));
}

export function removeDiscoveredPoem(id) {
    save(KEYS.discoveredPoems, getDiscoveredPoems().filter(p => p.id !== id));
}

export function getLastOracleFetchTime() {
    return load(KEYS.lastOracleFetch, 0);
}

export function setLastOracleFetchTime(ts) {
    save(KEYS.lastOracleFetch, ts);
}

/* ---------------- JOURNAL ---------------- */
/** Entries: [{ text, date, poemTitle?, poemAuthor? }] */
export function getJournalEntries() {
    return load(KEYS.journalEntries, []);
}

export function addJournalEntry(entry) {
    const entries = getJournalEntries();
    entries.unshift({ ...entry, date: new Date().toISOString() });
    save(KEYS.journalEntries, entries);
}

export function deleteJournalEntry(date) {
    save(KEYS.journalEntries, getJournalEntries().filter(e => e.date !== date));
}

/* ---------------- AUDIO CACHE (IndexedDB) ----------------
 * One slot: the pre-generated voice recording for the upcoming poem,
 * so the alarm doesn't depend on the internet at wake-up time. */
const DB_NAME = "reveille";
const STORE = "audio";

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function audioTx(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(req?.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Stored as { key, wav: Blob } where key identifies poem + voice + delivery style. */
export async function getCachedAudio(key) {
    try {
        const entry = await audioTx("readonly", s => s.get("upcoming"));
        return entry && entry.key === key ? entry.wav : null;
    } catch {
        return null;
    }
}

export async function setCachedAudio(key, wav) {
    try {
        await audioTx("readwrite", s => s.put({ key, wav }, "upcoming"));
    } catch (e) {
        console.warn("Couldn't cache poem audio", e);
    }
}
