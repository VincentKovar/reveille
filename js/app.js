/* ----------------------------------------------------
 * APP STATE & UI WIRING
 * ---------------------------------------------------- */
let currentFilter = 'narrative';
let currentPoemIndex = 0;
let audioContext = null;
let snoozeTimeoutId = null;

window.onload = function () {
    loadPersistedSettings();
    initClock();
    renderPoemPreview();
    renderVaultList();
    renderJournalHistory();
    renderSupportLink();
    setupAlarmChecker();
    maybePrefetchOraclePoem();
    registerServiceWorker();
};

/* ---------------- PERSISTENCE ---------------- */
function loadPersistedSettings() {
    const alarmTime = loadSetting(STORAGE_KEYS.alarmTime, "07:30");
    const alarmEnabled = loadSetting(STORAGE_KEYS.alarmEnabled, true);
    currentFilter = loadSetting(STORAGE_KEYS.poemFilter, "narrative");
    const season = loadSetting(STORAGE_KEYS.season, "autumn");
    const voiceName = loadSetting(STORAGE_KEYS.voiceName, "Puck");
    const voicePersona = loadSetting(STORAGE_KEYS.voicePersona, "Read gently and poetically, as if softly waking a creative thinker at sunrise.");
    const bgSound = loadSetting(STORAGE_KEYS.bgSound, "bowl");
    const apiKey = getGeminiApiKey();

    document.getElementById('alarmTimeInput').value = alarmTime;
    document.getElementById('alarmToggle').checked = alarmEnabled;
    document.getElementById('seasonSelect').value = season;
    document.getElementById('voiceSelect').value = voiceName;
    document.getElementById('voicePersonaPrompt').value = voicePersona;
    document.getElementById('bgSoundSelect').value = bgSound;
    document.getElementById('geminiKeyInput').value = apiKey;

    setPoemFilter(currentFilter, /* skipSave */ true);
    updateSeasonTone();
    updateVoiceStatusLabel();
    updateNextAlarmLabel();

    // Persist-on-change wiring
    document.getElementById('alarmTimeInput').addEventListener('change', e => {
        saveSetting(STORAGE_KEYS.alarmTime, e.target.value);
        updateNextAlarmLabel();
    });
    document.getElementById('alarmToggle').addEventListener('change', e => {
        saveSetting(STORAGE_KEYS.alarmEnabled, e.target.checked);
        updateNextAlarmLabel();
    });
    document.getElementById('seasonSelect').addEventListener('change', () => {
        saveSetting(STORAGE_KEYS.season, document.getElementById('seasonSelect').value);
    });
    document.getElementById('voiceSelect').addEventListener('change', () => {
        saveSetting(STORAGE_KEYS.voiceName, document.getElementById('voiceSelect').value);
    });
    document.getElementById('voicePersonaPrompt').addEventListener('change', () => {
        saveSetting(STORAGE_KEYS.voicePersona, document.getElementById('voicePersonaPrompt').value);
    });
    document.getElementById('bgSoundSelect').addEventListener('change', () => {
        saveSetting(STORAGE_KEYS.bgSound, document.getElementById('bgSoundSelect').value);
    });
    document.getElementById('geminiKeyInput').addEventListener('change', () => {
        setGeminiApiKey(document.getElementById('geminiKeyInput').value);
        updateVoiceStatusLabel();
    });
}

/* ---------------- CLOCK ---------------- */
function initClock() {
    const updateTime = () => {
        const now = new Date();
        const hours = String(now.getHours() % 12 || 12).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = now.getHours() >= 12 ? 'PM' : 'AM';

        document.getElementById('currentTime').innerHTML = `${hours}:${minutes}<span class="text-2xl text-slate-500 font-sans ml-1">${ampm}</span>`;
        document.getElementById('alarmClockTime').innerText = `${hours}:${minutes} ${ampm}`;

        const options = { weekday: 'long', month: 'short', day: 'numeric' };
        document.getElementById('currentDate').innerText = now.toLocaleDateString('en-US', options);
    };
    updateTime();
    setInterval(updateTime, 1000);
}

function updateNextAlarmLabel() {
    const time = document.getElementById('alarmTimeInput').value;
    const enabled = document.getElementById('alarmToggle').checked;
    const label = document.getElementById('nextAlarmCountdown');
    if (!enabled) {
        label.innerText = "Alarm off";
        return;
    }
    const [h, m] = time.split(':');
    const hour12 = ((parseInt(h, 10) % 12) || 12);
    const ampm = parseInt(h, 10) >= 12 ? 'PM' : 'AM';
    label.innerText = `Alarm set for ${String(hour12).padStart(2, '0')}:${m} ${ampm}`;
}

/* ---------------- NAVIGATION TABS ---------------- */
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('text-aurora-accent'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.add('text-slate-500'));

    if (tabName === 'alarm') {
        document.getElementById('tabAlarm').classList.remove('hidden');
        document.getElementById('navAlarm').classList.add('text-aurora-accent');
    } else if (tabName === 'vault') {
        document.getElementById('tabVault').classList.remove('hidden');
        document.getElementById('navVault').classList.add('text-aurora-accent');
    } else if (tabName === 'journal') {
        document.getElementById('tabJournal').classList.remove('hidden');
        document.getElementById('navJournal').classList.add('text-aurora-accent');
        renderJournalHistory();
    } else if (tabName === 'settings') {
        document.getElementById('tabSettings').classList.remove('hidden');
        document.getElementById('navSettings').classList.add('text-aurora-accent');
    }
}

/* ---------------- POEM FILTER & SELECTION ---------------- */
function setPoemFilter(filterType, skipSave) {
    currentFilter = filterType;
    if (!skipSave) saveSetting(STORAGE_KEYS.poemFilter, filterType);

    document.querySelectorAll('.poem-filter-btn').forEach(btn => {
        btn.classList.remove('border-aurora-accent', 'bg-aurora-accent/10', 'text-white');
        btn.classList.add('border-white/10', 'bg-white/5', 'text-slate-300');
    });

    if (filterType === 'narrative') {
        document.getElementById('filterNarrative').classList.add('border-aurora-accent', 'bg-aurora-accent/10', 'text-white');
    } else {
        document.getElementById('filterSurprising').classList.add('border-aurora-accent', 'bg-aurora-accent/10', 'text-white');
    }

    renderPoemPreview();
}

function getCurrentFilteredPoems() {
    return PUBLIC_DOMAIN_POEMS.filter(p => p.archetype === currentFilter || currentFilter === 'all');
}

function rotatePoemSelection() {
    const filtered = getCurrentFilteredPoems();
    currentPoemIndex = (currentPoemIndex + 1) % filtered.length;
    renderPoemPreview();
}

/**
 * Chooses tomorrow's poem: the cached oracle poem if it's fresh and unused,
 * otherwise a local-library pick excluding recently used poems.
 */
function selectUpcomingPoem() {
    const cached = getCachedOraclePoem();
    if (cached) {
        const recentIds = getRecentlyUsedIdentifiers(POEM_HISTORY_WINDOW_DAYS);
        if (!recentIds.includes(cached.id)) {
            return cached;
        }
    }
    const recentIds = getRecentlyUsedIdentifiers(POEM_HISTORY_WINDOW_DAYS);
    return pickLocalPoem(currentFilter, recentIds);
}

function renderPoemPreview() {
    const poem = selectUpcomingPoem();
    document.getElementById('previewTitle').innerText = poem.title;
    document.getElementById('previewAuthor').innerText = `by ${poem.author}`;
    document.getElementById('previewSnippet').innerText = `"${poem.lines[0]} ${poem.lines[1] || ''}..."`;
}

function updateSeasonTone() {
    const season = document.getElementById('seasonSelect').value;
    const glow = document.getElementById('ambientGlow');
    if (season === 'autumn') {
        glow.style.background = 'radial-gradient(circle, rgba(226, 177, 123, 0.15) 0%, rgba(59, 54, 84, 0.2) 40%, rgba(13, 14, 21, 0) 70%)';
    } else if (season === 'rain') {
        glow.style.background = 'radial-gradient(circle, rgba(112, 148, 184, 0.18) 0%, rgba(30, 41, 59, 0.3) 40%, rgba(13, 14, 21, 0) 70%)';
    } else if (season === 'winter') {
        glow.style.background = 'radial-gradient(circle, rgba(203, 213, 225, 0.15) 0%, rgba(30, 58, 138, 0.2) 40%, rgba(13, 14, 21, 0) 70%)';
    } else {
        glow.style.background = 'radial-gradient(circle, rgba(243, 201, 139, 0.2) 0%, rgba(88, 28, 135, 0.2) 40%, rgba(13, 14, 21, 0) 70%)';
    }
}

/* ---------------- VAULT LIST ---------------- */
function renderVaultList() {
    const container = document.getElementById('poemList');
    container.innerHTML = PUBLIC_DOMAIN_POEMS.map(p => `
        <div class="glass-card rounded-2xl p-4 transition-all hover:border-aurora-accent/40">
            <div class="flex items-center justify-between mb-1">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-aurora-accent">${p.season} • ${p.archetype}</span>
                <button onclick="previewPoemSpeech('${p.id}')" class="text-xs text-slate-300 hover:text-white bg-white/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <i class="fa-solid fa-volume-high text-[10px]"></i> Listen
                </button>
            </div>
            <h4 class="serif-font text-lg font-bold text-white">${p.title}</h4>
            <p class="text-xs text-slate-400 italic mb-2">by ${p.author}</p>
            <div class="serif-font text-xs text-slate-300 italic space-y-0.5 border-l-2 border-aurora-accent/30 pl-3 py-1">
                ${p.lines.slice(0, 3).map(l => `<p>${l || '&nbsp;'}</p>`).join('')}
            </div>
        </div>
    `).join('');
}

/* ---------------- ORACLE (MANUAL + AUTO PREFETCH) ---------------- */
async function fetchGeminiOraclePoem() {
    const prompt = document.getElementById('oraclePromptInput').value.trim() || "Rainy morning, unexpected journey";
    const btn = document.getElementById('oracleBtn');
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Finding...`;

    const recentTitles = getRecentlyUsedTitles(POEM_HISTORY_WINDOW_DAYS);
    const newPoem = await fetchOraclePoem(prompt, recentTitles);

    if (newPoem) {
        PUBLIC_DOMAIN_POEMS.unshift(newPoem);
        setCachedOraclePoem(newPoem);
        setLastOracleFetchTime(Date.now());
        renderVaultList();
        currentFilter = 'all';
        renderPoemPreview();
        alert(`Discovered: "${newPoem.title}" by ${newPoem.author}`);
    } else {
        alert("Couldn't reach Gemini (check your API key in Settings) — using local micro-vault poems instead.");
    }
    btn.innerHTML = `Consult`;
}

/**
 * Auto-runs on app open. If it's been long enough since the last fetch,
 * pulls a fresh poem in the background so the alarm has something new
 * cached and ready, without depending on a live network call at wake time.
 */
async function maybePrefetchOraclePoem() {
    if (!getGeminiApiKey()) return;

    const hoursSinceLastFetch = (Date.now() - getLastOracleFetchTime()) / (1000 * 60 * 60);
    if (hoursSinceLastFetch < ORACLE_PREFETCH_INTERVAL_HOURS) return;

    const season = document.getElementById('seasonSelect').value;
    const recentTitles = getRecentlyUsedTitles(POEM_HISTORY_WINDOW_DAYS);
    const newPoem = await fetchOraclePoem(`A ${season} morning, ${currentFilter} in tone`, recentTitles);

    if (newPoem) {
        setCachedOraclePoem(newPoem);
        setLastOracleFetchTime(Date.now());
        renderPoemPreview();
    }
}

/* ---------------- VOICE / AUDIO ---------------- */
function updateVoiceStatusLabel() {
    const label = document.getElementById('voiceStatusLabel');
    if (!label) return;
    if (getGeminiApiKey()) {
        label.innerText = "Gemini TTS voice active";
        label.className = "text-[10px] text-aurora-accent";
    } else {
        label.innerText = "Fallback voice (browser default) — add a Gemini key above for your selected voice";
        label.className = "text-[10px] text-aurora-rose";
    }
}

function speakCurrent(text, onComplete) {
    const voiceName = document.getElementById('voiceSelect').value || 'Puck';
    const persona = document.getElementById('voicePersonaPrompt').value || 'Read softly and poetically.';
    return speakPoemGeminiTTS(text, voiceName, persona, onComplete, (path) => {
        const indicator = document.getElementById('activeVoicePathIndicator');
        if (indicator) {
            indicator.innerText = path === 'gemini' ? 'Gemini voice' : 'Fallback voice';
        }
    });
}

function playAmbientSound() {
    const type = document.getElementById('bgSoundSelect').value;
    if (type === 'none') return;

    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!audioContext) audioContext = new AudioCtx();

        if (type === 'bowl' || type === 'chimes') {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(432, audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(216, audioContext.currentTime + 6);

            gain.gain.setValueAtTime(0.01, audioContext.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 2);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 8);

            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.start();
            osc.stop(audioContext.currentTime + 8);
        }
    } catch (e) {
        console.log("AudioContext ambient play error", e);
    }
}

/* ---------------- ALARM TRIGGER ---------------- */
function setupAlarmChecker() {
    setInterval(() => {
        const toggle = document.getElementById('alarmToggle');
        if (!toggle.checked) return;

        const setTime = document.getElementById('alarmTimeInput').value;
        const now = new Date();
        const currentStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        if (setTime === currentStr && now.getSeconds() === 0) {
            triggerAlarmSequence();
        }
    }, 1000);
}

function triggerAlarmSequence() {
    const poem = selectUpcomingPoem();

    document.getElementById('activePoemTitle').innerText = poem.title;
    document.getElementById('activePoemAuthor').innerText = poem.author;

    const bodyContainer = document.getElementById('activePoemBody');
    bodyContainer.innerHTML = poem.lines.map((line, idx) => `
        <p id="line-${idx}" class="transition-all duration-500 opacity-60">${line || '&nbsp;'}</p>
    `).join('');

    document.getElementById('alarmOverlay').classList.remove('hidden');
    playAmbientSound();

    const textToRecite = `${poem.title}, by ${poem.author}. ${poem.lines.filter(l => l.trim().length > 0).join('. ')}`;
    speakCurrent(textToRecite, () => console.log("Poem recitation completed."));

    addPoemToHistory(poem);
    if (getCachedOraclePoem()?.id === poem.id) clearCachedOraclePoem();
}

function previewPoemSpeech(poemId) {
    const poem = PUBLIC_DOMAIN_POEMS.find(p => p.id === poemId);
    if (!poem) return;

    const text = `${poem.title}, by ${poem.author}. ${poem.lines.join(' ')}`;
    playAmbientSound();
    speakCurrent(text);
}

function testSelectedVoice() {
    playAmbientSound();
    speakCurrent("Good morning. Here is your micro-dose of poetry to wake your creative mind.");
}

function dismissAlarm() {
    if (snoozeTimeoutId) { clearTimeout(snoozeTimeoutId); snoozeTimeoutId = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.getElementById('alarmOverlay').classList.add('hidden');
    switchTab('journal');
}

function snoozeAlarm() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.getElementById('alarmOverlay').classList.add('hidden');
    if (snoozeTimeoutId) clearTimeout(snoozeTimeoutId);
    snoozeTimeoutId = setTimeout(() => {
        snoozeTimeoutId = null;
        triggerAlarmSequence();
    }, 5 * 60 * 1000);
}

/* ---------------- JOURNAL ---------------- */
function saveJournalEntry() {
    const input = document.getElementById('journalInput');
    const text = input.value.trim();
    if (!text) return;

    addJournalEntry(text);
    input.value = '';
    renderJournalHistory();
    alert("Reflection saved to your creative log.");
}

function renderJournalHistory() {
    const container = document.getElementById('journalHistory');
    const entries = getJournalEntries();

    if (!entries.length) {
        container.innerHTML = `
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Past Morning Logs</h3>
            <div class="text-center py-6 text-slate-500 text-xs italic">No reflections saved yet. Wake up with a poem tomorrow!</div>
        `;
        return;
    }

    container.innerHTML = `<h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Past Morning Logs</h3>` +
        entries.map(e => `
            <div class="glass-card rounded-2xl p-3 border-l-2 border-aurora-accent">
                <div class="text-[10px] text-slate-400 mb-1">${new Date(e.date).toLocaleDateString()} • Morning Reflection</div>
                <p class="text-xs text-slate-200 italic">"${e.text}"</p>
            </div>
        `).join('');
}

/* ---------------- SUPPORT LINK (BUY ME A COFFEE, FUTURE) ---------------- */
function renderSupportLink() {
    const container = document.getElementById('supportLinkContainer');
    if (!container) return;
    if (!SUPPORT_LINK) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = `
        <a href="${SUPPORT_LINK}" target="_blank" rel="noopener noreferrer"
           class="w-full py-2.5 glass-btn rounded-xl text-xs font-semibold text-aurora-accent flex items-center justify-center gap-2">
            <span>☕</span> Support this project
        </a>
    `;
}

/* ---------------- PWA SERVICE WORKER ---------------- */
function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.warn("Service worker registration failed:", err);
        });
    }
}
