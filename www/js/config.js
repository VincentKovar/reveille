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

// Days a poem stays "recently used" and won't be picked again.
export const POEM_HISTORY_WINDOW_DAYS = 30;

// Gemini models, kept in one place because Google renames and retires them.
// Check https://ai.google.dev/gemini-api/docs/models if poems or the voice stop working.
export const GEMINI_TEXT_MODEL = "gemini-3.8-flash";
export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";

// Fail-safe: if the poem voice hasn't started this many seconds after the alarm
// fires, a backup chime starts and slowly gets louder.
export const FAILSAFE_START_SECONDS = 30;

// After the poem finishes, the backup chime starts if you haven't tapped
// "I'm up" or "Snooze" within this many seconds.
export const FAILSAFE_AFTER_POEM_SECONDS = 90;

// How long the poem voice takes to fade up from quiet to full volume.
export const VOLUME_RAMP_SECONDS = 20;

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
