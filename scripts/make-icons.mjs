// Draws the Reveille icon (a sun half-risen over a horizon) at every size the
// web app and Android app need. Pure Node, no dependencies: `node scripts/make-icons.mjs`
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const NIGHT = hex('#0E1020'), DUSK = hex('#262A4A'), EMBER = hex('#E8B07A'), GOLD = hex('#F8D3A2'), ROSE = hex('#E38E84');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// Colour at (x, y) in 0..1 space. `inset` shrinks the artwork (for Android adaptive-icon safe zone).
function shade(x, y, { transparentBg = false, inset = 0 } = {}) {
    const s = 1 - 2 * inset;
    const u = (x - inset) / s, v = (y - inset) / s;
    const horizon = 0.64, cx = 0.5, r = 0.23;
    let bg = mix(DUSK, NIGHT, clamp(Math.hypot(u - 0.5, v - 0.75) / 0.8));
    let alpha = transparentBg ? 0 : 1;
    let col = bg;
    const d = Math.hypot(u - cx, v - horizon);
    // Glow above the horizon
    if (v < horizon) {
        const glow = Math.exp(-((d - r) ** 2) / 0.012) * 0.55 * (d > r ? 1 : 0);
        col = mix(col, ROSE, glow * 0.8);
        if (transparentBg) alpha = Math.max(alpha, glow * 0.9);
    }
    // Sun disc, clipped at the horizon
    const edge = 1 - smooth(r - 0.004, r + 0.004, d);
    const above = 1 - smooth(horizon - 0.003, horizon + 0.003, v);
    const sun = edge * above;
    if (sun > 0) {
        const sunCol = mix(GOLD, EMBER, clamp((v - (horizon - r)) / r));
        col = mix(col, sunCol, sun);
        alpha = Math.max(alpha, sun);
    }
    // Horizon line, brightest in the middle
    const line = (1 - smooth(0.004, 0.009, Math.abs(v - horizon))) * clamp(1 - Math.abs(u - 0.5) / 0.36);
    if (line > 0) { col = mix(col, EMBER, line); alpha = Math.max(alpha, line); }
    return [...col, alpha * 255];
}

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function png(size, opts = {}) {
    const ss = 3; // supersampling for smooth edges
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0;
        for (let x = 0; x < size; x++) {
            const acc = [0, 0, 0, 0];
            for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
                const p = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, opts);
                acc[0] += p[0] * p[3]; acc[1] += p[1] * p[3]; acc[2] += p[2] * p[3]; acc[3] += p[3];
            }
            const a = acc[3] / (ss * ss);
            const o = y * (size * 4 + 1) + 1 + x * 4;
            raw[o] = acc[3] ? acc[0] / acc[3] : 0;
            raw[o + 1] = acc[3] ? acc[1] / acc[3] : 0;
            raw[o + 2] = acc[3] ? acc[2] / acc[3] : 0;
            raw[o + 3] = a;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function write(path, buf) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, buf); console.log('wrote', path); }

// Web / iPhone
write('www/icons/icon-192.png', png(192));
write('www/icons/icon-512.png', png(512));
write('www/icons/apple-touch-icon.png', png(180));
write('www/icons/icon-maskable-512.png', png(512, { inset: 0.1 }));

// Android launcher icons (only once the android/ project exists)
const res = 'android/app/src/main/res';
if (existsSync(res)) {
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, k] of Object.entries(densities)) {
        write(`${res}/mipmap-${d}/ic_launcher.png`, png(48 * k));
        write(`${res}/mipmap-${d}/ic_launcher_round.png`, png(48 * k));
        // Adaptive icon foreground: 108dp canvas, artwork inside the 66dp safe zone.
        write(`${res}/mipmap-${d}/ic_launcher_foreground.png`, png(108 * k, { transparentBg: true, inset: 0.19 }));
    }
}
