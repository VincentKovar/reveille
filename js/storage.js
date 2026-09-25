/* ----------------------------------------------------
 * LOCALSTORAGE HELPERS
 * All persistence lives here. Nothing here is ever sent
 * anywhere except the direct Gemini API calls in gemini.js
 * that read the API key back out.
 * ---------------------------------------------------- */

const STORAGE_KEYS = {
    geminiApiKey: "reveille_gemini_key",
    alarmTime: "reveille_alarm_time",
    alarmEnabled: "reveille_alarm_enabled",
    poemFilter: "reveille_poem_filter",
    season: "reveille_season",
    voiceName: "reveille_voice_name",
    voicePersona: "reveille_voice_persona",
    bgSound: "reveille_bg_sound",
    journalEntries: "reveille_journal_entries",
    poemHistory: "reveille_poem_history",
    cachedOraclePoem: "reveille_cached_oracle_poem",
    lastOracleFetch: "reveille_last_oracle_fetch",
};

function loadSetting(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        console.warn("loadSetting failed for", key, e);
        return fallback;
    }
}

function saveSetting(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("saveSetting failed for", key, e);
    }
}

function getGeminiApiKey() {
    return loadSetting(STORAGE_KEYS.geminiApiKey, "");
}

function setGeminiApiKey(key) {
    saveSetting(STORAGE_KEYS.geminiApiKey, key.trim());
}

/* POEM HISTORY: array of { id, title, dateUsed (ISO string) } */
function getPoemHistory() {
    return loadSetting(STORAGE_KEYS.poemHistory, []);
}

function addPoemToHistory(poem) {
    const history = getPoemHistory();
    history.push({ id: poem.id, title: poem.title, dateUsed: new Date().toISOString() });
    saveSetting(STORAGE_KEYS.poemHistory, history);
}

function getRecentlyUsedIdentifiers(windowDays) {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return getPoemHistory()
        .filter(entry => new Date(entry.dateUsed).getTime() >= cutoff)
        .map(entry => entry.id || entry.title);
}

function getRecentlyUsedTitles(windowDays) {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return getPoemHistory()
        .filter(entry => new Date(entry.dateUsed).getTime() >= cutoff)
        .map(entry => entry.title);
}

/* CACHED ORACLE POEM (the daily prefetched poem) */
function getCachedOraclePoem() {
    return loadSetting(STORAGE_KEYS.cachedOraclePoem, null);
}

function setCachedOraclePoem(poem) {
    saveSetting(STORAGE_KEYS.cachedOraclePoem, poem);
}

function clearCachedOraclePoem() {
    localStorage.removeItem(STORAGE_KEYS.cachedOraclePoem);
}

function getLastOracleFetchTime() {
    return loadSetting(STORAGE_KEYS.lastOracleFetch, 0);
}

function setLastOracleFetchTime(timestamp) {
    saveSetting(STORAGE_KEYS.lastOracleFetch, timestamp);
}

/* JOURNAL */
function getJournalEntries() {
    return loadSetting(STORAGE_KEYS.journalEntries, []);
}

function addJournalEntry(text) {
    const entries = getJournalEntries();
    entries.unshift({ text, date: new Date().toISOString() });
    saveSetting(STORAGE_KEYS.journalEntries, entries);
}
