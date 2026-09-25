// Synthesises the fail-safe chime (three rising bells, 3 s, loops seamlessly)
// used by the Android app. Matches startFailsafeChime() in www/js/sound.js.
// Run: node scripts/make-chime.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const rate = 22050, seconds = 3, n = rate * seconds;
const out = new Float32Array(n);
const partials = [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]];

function bell(start, freq, peak, length) {
    for (const [ratio, amp] of partials) {
        const decay = length / Math.sqrt(ratio);
        for (let i = 0; i < rate * length; i++) {
            const t = i / rate;
            const idx = Math.floor((start + t) * rate) % n; // wrap so the loop point is seamless
            const attack = Math.min(1, t / 0.02);
            out[idx] += Math.sin(2 * Math.PI * freq * ratio * t) * peak * amp * attack * Math.exp(-5 * t / decay);
        }
    }
}
bell(0.05, 880, 0.35, 2.5);
bell(0.50, 1108.7, 0.35, 2.5);
bell(0.95, 1318.5, 0.4, 3);

const max = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const pcm = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round((out[i] / max) * 0.85 * 32767), i * 2);

const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(pcm.length, 40);

mkdirSync('android/app/src/main/res/raw', { recursive: true });
writeFileSync('android/app/src/main/res/raw/failsafe_chime.wav', Buffer.concat([h, pcm]));
console.log('wrote android/app/src/main/res/raw/failsafe_chime.wav');
