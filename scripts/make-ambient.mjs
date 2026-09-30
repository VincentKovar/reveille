// Synthesises the "under the voice" sounds used by the Android app: a singing bowl, a
// phrase of soft bells, and looping rain. They match playAmbient() in www/js/sound.js,
// but live as WAV files so the alarm service can play them on the alarm volume channel
// (the web version can't: it plays on media volume and is frozen when the phone locks).
// Loudness is set at play time (AlarmAudio.startAmbient), so the files are just normalised.
// Run: node scripts/make-ambient.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'android/app/src/main/res/raw';
mkdirSync(OUT, { recursive: true });

function saveWav(name, rate, samples, peak) {
    const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    const pcm = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(Math.round((samples[i] / max) * peak * 32767), i * 2);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    writeFileSync(`${OUT}/${name}.wav`, Buffer.concat([h, pcm]));
    console.log(`wrote ${OUT}/${name}.wav (${(samples.length / rate).toFixed(1)} s, ${((44 + pcm.length) / 1024).toFixed(0)} KB)`);
}

// Fixed seed so regenerating gives the same file.
function rng(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Web Audio's exponentialRampToValueAtTime, sampled.
const expRamp = (from, to, frac) => from * Math.pow(to / from, frac);

/* ---- Singing bowl: a low swell over 3 s with a slowly beating pair of tones, gone by 14 s ---- */
{
    const rate = 11025, seconds = 14, out = new Float32Array(rate * seconds);
    [[196, 0.06], [197.2, 0.06], [392.5, 0.02]].forEach(([freq, amp]) => {
        for (let i = 0; i < out.length; i++) {
            const t = i / rate;
            const env = t < 3 ? expRamp(0.0001, amp, t / 3) : expRamp(amp, 0.0001, (t - 3) / 11);
            out[i] += Math.sin(2 * Math.PI * freq * t) * env;
        }
    });
    saveWav('ambient_bowl', rate, out, 0.9);
}

/* ---- Bells: nine soft strikes, scattered over about eleven seconds ---- */
{
    const rate = 22050, seconds = 16, out = new Float32Array(rate * seconds), rand = rng(7);
    const notes = [659.3, 784, 880, 987.8, 1174.7];
    const partials = [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]];
    for (let b = 0; b < 9; b++) {
        const start = 0.4 + b * 1.3 + rand() * 0.5;
        const freq = notes[Math.floor(rand() * notes.length)];
        const length = 4;
        for (const [ratio, amp] of partials) {
            const peak = 0.05 * amp, decay = length / Math.sqrt(ratio);
            for (let i = 0; i < rate * length; i++) {
                const t = i / rate;
                const env = t < 0.02 ? expRamp(0.0001, peak, t / 0.02) : expRamp(peak, 0.0001, Math.min(1, (t - 0.02) / (decay - 0.02)));
                const idx = Math.floor((start + t) * rate);
                if (idx < out.length) out[idx] += Math.sin(2 * Math.PI * freq * ratio * t) * env;
            }
        }
    }
    saveWav('ambient_chimes', rate, out, 0.9);
}

/* ---- Rain: soft filtered noise, six seconds, loops with a short crossfade ---- */
{
    const rate = 16000, loop = rate * 6, fade = Math.floor(rate * 0.75), rand = rng(11);
    const raw = new Float32Array(loop + fade);
    let last = 0, low = 0;
    const alpha = 1 - Math.exp(-2 * Math.PI * 1400 / rate); // one-pole low-pass at 1.4 kHz
    for (let i = -4000; i < raw.length; i++) { // the first 4000 samples just warm the filters up
        last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
        low += alpha * (last * 3.5 - low);
        if (i >= 0) raw[i] = low;
    }
    const out = raw.slice(0, loop);
    for (let i = 0; i < fade; i++) { // blend the extra tail into the start so the loop point is seamless
        const w = i / fade;
        out[i] = raw[i] * Math.sin(w * Math.PI / 2) + raw[loop + i] * Math.cos(w * Math.PI / 2);
    }
    saveWav('ambient_rain', rate, out, 0.5);
}
