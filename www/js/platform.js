/* ----------------------------------------------------
 * PLATFORM BRIDGE
 * One interface, two implementations:
 *   - Android app: the native ReveilleAlarm plugin owns scheduling, the
 *     lock-screen alarm, audio on the alarm volume channel, and the fail-safe.
 *   - Browser / iPhone home-screen app: timers, Web Audio and the Wake Lock
 *     API. Only rings while the app is open on screen.
 * ---------------------------------------------------- */
import * as sound from './sound.js';

const Cap = window.Capacitor;
const isNative = !!Cap?.isNativePlatform?.() && Cap.getPlatform() === "android";
const plugin = isNative ? (Cap.registerPlugin?.("ReveilleAlarm") ?? Cap.Plugins?.ReveilleAlarm) : null;

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/* ================= ANDROID ================= */
const android = {
    isNative: true,
    canRingWhenLocked: true,

    async info() {
        return plugin.getInfo(); // { edition: "personal" | "portfolio", version }
    },

    /** extras: { snoozeMinutes, upcomingAudioKey } */
    async syncAlarms(alarms, snooze, extras = {}) {
        await plugin.sync({ alarms, snooze: snooze ?? null, ...extras });
    },

    /** Hand the pre-recorded poem to Android so the alarm can play it before the app even opens. */
    async cacheAudio(key, blob) {
        await plugin.cacheAudio({ key, base64: await blobToBase64(blob) });
    },

    /** { ringing, alarmId, at, alarms, snooze, lastDismissedAt, audioPlaying, audioElapsed, audioDuration } */
    async ringState() {
        return plugin.getState();
    },

    onRingStart(cb) { plugin.addListener("ringStarted", cb); },
    onRingStop(cb) { plugin.addListener("ringStopped", cb); },

    /** Android started the poem itself; call back when it finishes. */
    async onceVoiceEnded(cb) {
        const handle = await plugin.addListener("playbackEnded", () => { handle.remove(); cb(); });
    },

    async acknowledge() { await plugin.acknowledge(); },
    async armFailsafe(seconds) { await plugin.armFailsafe({ seconds }); },

    /** Plays on the alarm volume channel (so it works with media volume at zero). */
    async playWav(blob, rampSeconds, onEnded) {
        const handle = await plugin.addListener("playbackEnded", () => { handle.remove(); onEnded?.(); });
        const { duration } = await plugin.playAudio({ base64: await blobToBase64(blob), rampSeconds });
        return duration;
    },

    /** The phone's built-in text-to-speech, used when there's no key or no internet. */
    async speak(text, onEnded) {
        const handle = await plugin.addListener("speechEnded", () => { handle.remove(); onEnded?.(); });
        await plugin.speak({ text });
    },

    async stopAudio() { await plugin.stopAudio(); },
    playAmbient: sound.playAmbient,
    stopAmbient: sound.stopAmbient,

    async dismiss() { await plugin.dismiss(); },
    async snooze(minutes) { return plugin.snooze({ minutes }); },

    /** { notifications, fullScreen, exactAlarm } — each "granted" | "denied" | "prompt" */
    async permissions() { return plugin.getPermissionStatus(); },
    async requestNotifications() { return plugin.requestNotificationPermission(); },
    async openSystemSetting(which) { await plugin.openSetting({ which }); },

    keepScreenOn() {},
    releaseScreen() {},
};

/* ================= BROWSER ================= */
let failsafeTimer = null;
let wakeLock = null;

const browser = {
    isNative: false,
    canRingWhenLocked: false,

    async info() { return { edition: "portfolio", version: "web" }; },
    async syncAlarms() {},
    async cacheAudio() {},
    async ringState() { return { ringing: false }; },
    async onceVoiceEnded() {},
    onRingStart() {},
    onRingStop() {},

    async acknowledge() {
        clearTimeout(failsafeTimer);
        sound.stopFailsafeChime();
    },
    async armFailsafe(seconds) {
        clearTimeout(failsafeTimer);
        failsafeTimer = setTimeout(sound.startFailsafeChime, seconds * 1000);
    },

    async playWav(blob, rampSeconds, onEnded) {
        return sound.playWav(blob, rampSeconds, onEnded);
    },

    async speak(text, onEnded) {
        if (!("speechSynthesis" in window)) throw new Error("No speech synthesis");
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.85;
        u.onend = () => onEnded?.();
        u.onerror = () => onEnded?.();
        speechSynthesis.speak(u);
    },

    async stopAudio() {
        sound.stopWav();
        sound.stopAmbient();
        if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    playAmbient: sound.playAmbient,
    stopAmbient: sound.stopAmbient,

    async dismiss() {
        clearTimeout(failsafeTimer);
        sound.stopFailsafeChime();
        await this.stopAudio();
    },
    async snooze() {
        clearTimeout(failsafeTimer);
        sound.stopFailsafeChime();
        await this.stopAudio();
    },

    async permissions() { return {}; },
    async requestNotifications() {},
    async openSystemSetting() {},

    /** Nightstand mode: stop the screen from sleeping so the alarm can ring. */
    async keepScreenOn() {
        try {
            wakeLock = await navigator.wakeLock?.request("screen");
            // The lock drops when the tab is hidden; take it back when we return.
            document.addEventListener("visibilitychange", reacquireWakeLock);
            return !!wakeLock;
        } catch {
            return false;
        }
    },
    releaseScreen() {
        document.removeEventListener("visibilitychange", reacquireWakeLock);
        wakeLock?.release?.();
        wakeLock = null;
    },
};

async function reacquireWakeLock() {
    if (document.visibilityState === "visible" && wakeLock?.released !== false) {
        try { wakeLock = await navigator.wakeLock.request("screen"); } catch { /* not allowed now */ }
    }
}

export const platform = isNative && plugin ? android : browser;
