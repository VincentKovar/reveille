/* ----------------------------------------------------
 * APP CONFIG
 * The handful of things you might want to change in your own copy.
 * ---------------------------------------------------- */

// Who made this. Shown as a small credit in Settings and on the welcome screen.
export const AUTHOR_NAME = "Vincent Kovar";

// Your website. Leave empty to show the credit without a link.
export const AUTHOR_URL = "";

// Buy Me a Coffee (or similar) link. Leave empty to hide the support button entirely.
export const SUPPORT_LINK = "";

// Hours that must pass before the app looks up a fresh poem from Gemini.
export const ORACLE_PREFETCH_INTERVAL_HOURS = 20;

// Poem discovery. The words of every discovered poem come from PoetryDB (public-domain texts);
// Gemini only judges which ones fit and never supplies text. The app keeps about this many
// discovered poems that haven't been used yet, topping up on the schedule above.
export const POETRYDB_URL = "https://poetrydb.org";
export const DISCOVERY_POOL_SIZE = 10;

// Discovered poems must have this many lines (blank stanza-break lines don't count).
export const DISCOVERY_MIN_LINES = 4;
export const DISCOVERY_MAX_LINES = 30;

// Days a poem stays "recently used" and won't be picked again.
export const POEM_HISTORY_WINDOW_DAYS = 30;

// Gemini models, kept in one place because Google renames and retires them.
// Check https://ai.google.dev/gemini-api/docs/models if poems or the voice stop working.
export const GEMINI_TEXT_MODEL = "gemini-3.8-flash";
export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";

// If recording tomorrow's voice fails for a passing reason (no signal, Google hiccup), the app
// tries again after each of these delays (minutes) while it stays open, then gives up until the
// next time it's opened or an alarm is dismissed.
export const VOICE_RETRY_MINUTES = [2, 10, 30];

// After Google says the free limit is used up (429), the app stops asking for this many hours.
export const VOICE_QUOTA_PAUSE_HOURS = 1;

// Fail-safe: if the poem voice hasn't started this many seconds after the alarm
// fires, a backup chime starts and slowly gets louder.
export const FAILSAFE_START_SECONDS = 30;

// After the poem finishes, the backup chime starts if you haven't tapped
// "I'm up" or "Snooze" within this many seconds.
export const FAILSAFE_AFTER_POEM_SECONDS = 90;

// Android: if Gemini's voice isn't playing 10 s after the alarm fires (FALLBACK_AFTER_SECONDS in
// AlarmService.java), a bundled recording reads this built-in poem instead. Record it with
// scripts/make-fallback-poem.mjs; the voice is Sulafat with DEFAULT_PERSONA.
export const FALLBACK_POEM_ID = "crane-desert";

// How long the poem voice takes to fade up from quiet to full volume.
export const VOLUME_RAMP_SECONDS = 20;

// Gemini doesn't always generate speech at full volume, so quiet recordings can
// sound weak even with the phone's alarm volume maxed out. Recordings are
// boosted toward this fraction of full scale (0-1) before being played or
// cached — never turned down, only raised, and capped by SPEECH_MAX_BOOST so
// a near-silent clip doesn't get amplified into noise.
export const SPEECH_TARGET_PEAK = 0.92;
export const SPEECH_MAX_BOOST = 6;

// Gemini voices offered in Settings — a subset of Google's 30 that suit reading verse.
export const VOICES = [
    { id: "Sulafat", note: "Warm" },
    { id: "Achernar", note: "Soft" },
    { id: "Vindemiatrix", note: "Gentle" },
    { id: "Enceladus", note: "Breathy" },
    { id: "Aoede", note: "Breezy" },
    { id: "Callirrhoe", note: "Easy-going" },
    { id: "Algieba", note: "Smooth" },
    { id: "Gacrux", note: "Mature" },
    { id: "Algenib", note: "Gravelly" },
    { id: "Charon", note: "Informative" },
    { id: "Puck", note: "Upbeat" },
    { id: "Kore", note: "Firm" },
];

export const DEFAULT_PERSONA = "Read slowly and gently, like someone softly waking a friend at sunrise. Let each line breathe.";
