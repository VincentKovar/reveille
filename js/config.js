/* ----------------------------------------------------
 * APP CONFIG
 * Edit these constants to customize your own fork.
 * ---------------------------------------------------- */

// Buy Me a Coffee (or similar) link. Leave empty to hide the support button entirely.
// Example: "https://www.buymeacoffee.com/yourname"
const SUPPORT_LINK = "";

// How many hours must pass before the app auto-fetches a new poem from Gemini.
const ORACLE_PREFETCH_INTERVAL_HOURS = 20;

// How many days a poem stays "recently used" and excluded from re-selection.
const POEM_HISTORY_WINDOW_DAYS = 30;

// Gemini model names (kept in one place in case Google renames/retires a preview model).
const GEMINI_TEXT_MODEL = "gemini-3-flash-preview";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
