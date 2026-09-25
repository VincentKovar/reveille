/* ----------------------------------------------------
 * SOUND (browser side)
 * Ambient wake-up textures and the fail-safe chime, synthesised with
 * Web Audio so there are no sound files to load. Browsers only allow
 * audio after a tap, so unlockAudio() is called from every button tap.
 * ---------------------------------------------------- */

let ctx = null;

export function audioContext() {
    if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
    }
    return ctx;
}

export function unlockAudio() {
    // iPhone: play through the Ring/Silent switch, like an alarm should (Safari 16.4+).
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* unsupported */ }
    const c = audioContext();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    // iOS also needs a (silent) sound played inside the tap itself.
    if (c && !unlockAudio.done) {
        const src = c.createBufferSource();
        src.buffer = c.createBuffer(1, 1, 22050);
        src.connect(c.destination);
        src.start(0);
        unlockAudio.done = true;
    }
}

/** A struck bell: a few inharmonic partials that decay at different rates. */
function bell(c, out, when, freq, peak, length) {
    [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]].forEach(([ratio, amp]) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * ratio;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(peak * amp, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + length / ratio ** 0.5);
        osc.connect(g).connect(out);
        osc.start(when);
        osc.stop(when + length);
    });
}

/* ---------------- AMBIENT BED UNDER THE POEM ---------------- */
let ambientStop = null;

export function playAmbient(type) {
    stopAmbient();
    const c = audioContext();
    if (!c || type === "none") return;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, c.currentTime + 4);
    out.connect(c.destination);
    const t = c.currentTime;
    const nodes = [];

    if (type === "bowl") {
        // A singing bowl: a low swell with a slow beating pair of tones.
        [196, 197.2, 392.5].forEach((f, i) => {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(i === 2 ? 0.02 : 0.06, t + 3);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 14);
            osc.connect(g).connect(out);
            osc.start(t);
            osc.stop(t + 14);
            nodes.push(osc);
        });
    } else if (type === "chimes") {
        const notes = [659.3, 784, 880, 987.8, 1174.7];
        for (let i = 0; i < 9; i++) {
            bell(c, out, t + 0.4 + i * 1.3 + Math.random() * 0.5, notes[Math.floor(Math.random() * notes.length)], 0.05, 4);
        }
    } else if (type === "rain") {
        // Filtered noise: soft rain that fades in and keeps going until the poem ends.
        const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
            last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
            data[i] = last * 3.5;
        }
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1400;
        const g = c.createGain();
        g.gain.value = 0.35;
        src.connect(filter).connect(g).connect(out);
        src.start(t);
        nodes.push(src);
    }

    ambientStop = () => {
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 1.5);
        setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); out.disconnect(); }, 1600);
    };
}

export function stopAmbient() {
    if (ambientStop) { ambientStop(); ambientStop = null; }
}

/* ---------------- FAIL-SAFE CHIME ----------------
 * A repeating three-bell phrase that starts quiet and climbs to full
 * volume over a minute. Keeps going until stopped. */
let failsafe = null;

export function startFailsafeChime() {
    if (failsafe) return;
    const c = audioContext();
    if (!c) return;
    c.resume().catch(() => {});
    const out = c.createGain();
    out.gain.setValueAtTime(0.15, c.currentTime);
    out.gain.linearRampToValueAtTime(1, c.currentTime + 60);
    out.connect(c.destination);
    const phrase = () => {
        const t = c.currentTime + 0.05;
        bell(c, out, t, 880, 0.35, 2.5);
        bell(c, out, t + 0.45, 1108.7, 0.35, 2.5);
        bell(c, out, t + 0.9, 1318.5, 0.4, 3);
    };
    phrase();
    const interval = setInterval(phrase, 3000);
    failsafe = { interval, out };
}

export function stopFailsafeChime() {
    if (!failsafe) return;
    clearInterval(failsafe.interval);
    failsafe.out.disconnect();
    failsafe = null;
}

/* ---------------- POEM PLAYBACK ----------------
 * Plays a WAV through Web Audio (so the volume can ramp on iPhone,
 * where <audio>.volume is read-only). */
let poemSource = null;

export async function playWav(blob, rampSeconds, onEnded) {
    stopWav();
    const c = audioContext();
    if (!c) throw new Error("Web Audio unavailable");
    await c.resume();
    const buffer = await c.decodeAudioData(await blob.arrayBuffer());
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buffer;
    g.gain.setValueAtTime(0.25, c.currentTime);
    g.gain.linearRampToValueAtTime(1, c.currentTime + Math.max(rampSeconds, 0.1));
    src.connect(g).connect(c.destination);
    src.onended = () => { if (poemSource === src) { poemSource = null; onEnded?.(); } };
    src.start();
    poemSource = src;
    return buffer.duration;
}

export function stopWav() {
    if (poemSource) {
        const src = poemSource;
        poemSource = null;
        try { src.stop(); } catch { /* not started */ }
    }
}
