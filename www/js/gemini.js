/* ----------------------------------------------------
 * GEMINI API
 * Calls go straight from this device to Google using the key the person
 * pasted in Settings. Each call tries Google's current Interactions API
 * first, then the older generateContent API, so the app keeps working
 * across Google's API changes.
 * ---------------------------------------------------- */
import { GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, SPEECH_TARGET_PEAK, SPEECH_MAX_BOOST } from './config.js';
import { getGeminiApiKey } from './storage.js';

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

/** Plain-language explanation of a failed call, for showing to the person. */
export function explainGeminiError(err) {
    if (!getGeminiApiKey()) return "Add your Gemini API key in Settings to use this.";
    if (err?.name === "AbortError") return "Google took too long to answer. Check your internet connection and try again.";
    switch (err?.status) {
        case 400:
        case 401:
        case 403: return "Google didn't accept the API key. Open Settings and paste it again. It usually starts with \"AIza\".";
        case 404: return "Google has retired the model this app uses. Update the model names in js/config.js.";
        case 429: return "You've hit today's free Gemini limit. It resets within a day.";
        default: return navigator.onLine === false
            ? "You're offline. Built-in poems and the phone's own voice still work."
            : "Couldn't reach Gemini right now. Try again in a minute.";
    }
}

/** Whether the same call might work if tried again soon: a dropped connection, a timeout or a Google
 * hiccup, yes; a rejected key, retired model or used-up quota, no (those need the person, or a new day). */
export function isTransientGeminiError(err) {
    const status = err?.status;
    if (status === undefined) return true;
    return status === 408 || status >= 500;
}

async function post(path, body, timeoutMs) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new GeminiError("No API key", 0);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${BASE}/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new GeminiError(`Gemini HTTP ${res.status}: ${detail.slice(0, 300)}`, res.status);
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

/** Every content item the model produced, across both API response shapes. */
function outputItems(data) {
    const items = [];
    for (const step of data?.steps ?? []) {
        if (step.type && step.type !== "model_output") continue;
        items.push(...(step.content ?? []));
    }
    for (const item of data?.outputs ?? []) items.push(item);
    for (const part of data?.candidates?.[0]?.content?.parts ?? []) {
        if (part.text !== undefined) items.push({ type: "text", text: part.text });
        if (part.inlineData) items.push({ type: "audio", data: part.inlineData.data, mime_type: part.inlineData.mimeType });
    }
    return items;
}

function extractText(data) {
    if (typeof data?.outputText === "string") return data.outputText;
    if (typeof data?.output_text === "string") return data.output_text;
    return outputItems(data).filter(i => i.type === "text" && i.text).map(i => i.text).join("");
}

function extractAudio(data) {
    const audio = outputItems(data).filter(i => i.type === "audio" && i.data).pop();
    return audio ? { base64: audio.data, mimeType: audio.mime_type || audio.mimeType || "" } : null;
}

/** Try the Interactions API; if that endpoint or shape isn't accepted, use generateContent. */
async function withFallback(primary, legacy) {
    try {
        return await primary();
    } catch (err) {
        if (err.status === 404 || err.status === 400) {
            try {
                return await legacy();
            } catch (legacyErr) {
                // Report whichever error says more about what the person should fix.
                throw legacyErr.status === 404 ? err : legacyErr;
            }
        }
        throw err;
    }
}

/* ---------------- KEY CHECK ---------------- */
/** Cheapest possible call, used by setup to confirm a pasted key works. */
export async function checkApiKey() {
    const prompt = "Reply with the single word: ready";
    const data = await withFallback(
        () => post("interactions", {
            model: GEMINI_TEXT_MODEL, store: false,
            input: [{ type: "user_input", content: [{ type: "text", text: prompt }] }],
        }, 15000),
        () => post(`models/${GEMINI_TEXT_MODEL}:generateContent`, {
            contents: [{ parts: [{ text: prompt }] }],
        }, 15000),
    );
    return extractText(data).length > 0;
}

/* ---------------- POEM LOOKUP ---------------- */
const POEM_SCHEMA = {
    type: "object",
    properties: {
        title: { type: "string" },
        author: { type: "string" },
        lines: { type: "array", items: { type: "string" } },
    },
    required: ["title", "author", "lines"],
};

/**
 * Ask Gemini for a real public-domain poem matching a mood.
 * Returns { id, title, author, archetype, season, lines, source } — throws GeminiError on failure.
 */
export async function fetchPoem(mood, archetype, recentTitles) {
    const avoid = recentTitles.length
        ? `\nDo not choose any of these recently used poems: ${recentTitles.join("; ")}.`
        : "";
    const style = archetype === "surprising"
        ? "built on a fresh, surprising central image or metaphor"
        : "narrative or quasi-narrative: a scene unfolds or something happens";
    const system = `You are a poetry scholar specialising in public-domain poetry.
Choose one real, published poem that is in the public domain in the United States (first published before 1930), by a real poet, quoted exactly — never invent or paraphrase lines.
The poem must be:
1. Under 20 lines.
2. ${style}.
3. Open-ended: the central idea is left unresolved at the final line.
Represent stanza breaks as an empty string in "lines".${avoid}`;
    const userText = `Find a public-domain poem for this morning's mood: ${mood}`;

    const data = await withFallback(
        () => post("interactions", {
            model: GEMINI_TEXT_MODEL, store: false,
            system_instruction: system,
            input: [{ type: "user_input", content: [{ type: "text", text: userText }] }],
            response_format: { type: "text", mime_type: "application/json", schema: POEM_SCHEMA },
        }, 30000),
        () => post(`models/${GEMINI_TEXT_MODEL}:generateContent`, {
            contents: [{ parts: [{ text: userText }] }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: { responseMimeType: "application/json", responseJsonSchema: POEM_SCHEMA },
        }, 30000),
    );

    const text = extractText(data).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    let poem;
    try {
        poem = JSON.parse(text);
    } catch {
        throw new GeminiError("Gemini returned something that wasn't a poem.", 500);
    }
    if (!poem?.title || !Array.isArray(poem.lines) || poem.lines.filter(l => l.trim()).length < 2) {
        throw new GeminiError("Gemini returned an incomplete poem.", 500);
    }
    return {
        id: "gemini-" + Date.now(),
        title: String(poem.title),
        author: String(poem.author || "Unknown"),
        lines: poem.lines.map(String).slice(0, 40),
        archetype,
        season: "gemini",
        source: "gemini",
    };
}

/* ---------------- VOICE ---------------- */
/** The words read aloud: title, poet, then the poem, with stanza breaks as pauses. */
export function recitationScript(poem) {
    const body = poem.lines.map(l => l.trim()).join("\n");
    return `${poem.title}.\nBy ${poem.author}.\n\n${body}`;
}

/**
 * Generate the spoken poem. Returns a WAV Blob — throws GeminiError on failure.
 * Google returns either a finished WAV or raw 16-bit PCM depending on API version;
 * both are handled.
 */
export async function synthesizeSpeech(text, voiceName, persona, timeoutMs = 45000) {
    const data = await withFallback(
        () => post("interactions", {
            model: GEMINI_TTS_MODEL, store: false,
            input: [{
                type: "user_input",
                content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: persona }] }],
            }],
            response_format: { type: "audio", mime_type: "audio/wav", sample_rate: 24000 },
            generation_config: { speech_config: [{ voice: voiceName }] },
        }, timeoutMs),
        () => post(`models/${GEMINI_TTS_MODEL}:generateContent`, {
            contents: [{ parts: [{ text: `${persona}\n\n${text}` }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
        }, timeoutMs),
    );

    const audio = extractAudio(data);
    if (!audio) throw new GeminiError("Gemini didn't return any audio.", 500);
    const bytes = base64ToBytes(audio.base64);

    let sampleRate, pcmBytes;
    if (isWav(bytes)) {
        ({ sampleRate, pcmBytes } = parseWav(bytes));
    } else {
        pcmBytes = bytes;
        sampleRate = Number(audio.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
    }
    return pcmToWav(boostQuietSpeech(pcmBytes), sampleRate);
}

function isWav(bytes) {
    return bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF";
}

/** Reads sample rate and raw PCM samples out of a WAV file, scanning chunks properly
 * rather than assuming a fixed 44-byte header (Google's WAVs are canonical, but this
 * is cheap insurance). Falls back to a 44-byte offset if no "data" chunk is found. */
function parseWav(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let sampleRate = 24000;
    let pcmBytes = null;
    let offset = 12; // past "RIFF" + size (4) + "WAVE"
    while (offset + 8 <= bytes.length) {
        const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        const size = view.getUint32(offset + 4, true);
        const body = offset + 8;
        if (id === "fmt " && body + 8 <= bytes.length) sampleRate = view.getUint32(body + 4, true);
        if (id === "data") pcmBytes = bytes.subarray(body, Math.min(body + size, bytes.length));
        offset = body + size + (size % 2); // chunks are padded to an even length
    }
    return { sampleRate, pcmBytes: pcmBytes || bytes.subarray(44) };
}

/**
 * Raises quiet 16-bit PCM speech toward SPEECH_TARGET_PEAK of full scale so the
 * phone's alarm volume at 100% is actually loud — Gemini doesn't always generate
 * audio at full level. Only ever raises volume, never lowers it, and never
 * amplifies past SPEECH_MAX_BOOST so a near-silent clip doesn't turn into noise.
 * Exported for testing; safe to call on any even-length Uint8Array of PCM16 bytes.
 */
export function boostQuietSpeech(pcmBytes, targetPeak = SPEECH_TARGET_PEAK, maxGain = SPEECH_MAX_BOOST) {
    try {
        const evenLength = pcmBytes.length - (pcmBytes.length % 2);
        const copy = new Uint8Array(pcmBytes.subarray(0, evenLength)); // fresh, 2-byte-aligned buffer
        const samples = new Int16Array(copy.buffer);

        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            const abs = samples[i] < 0 ? -samples[i] : samples[i];
            if (abs > peak) peak = abs;
        }
        if (peak === 0) return pcmBytes; // silence: nothing to boost

        const gain = Math.min(maxGain, (targetPeak * 32767) / peak);
        if (gain <= 1.02) return pcmBytes; // already loud enough; don't touch it

        for (let i = 0; i < samples.length; i++) {
            samples[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain)));
        }
        return copy;
    } catch (e) {
        console.warn("Speech loudness boost failed; playing the original recording", e);
        return pcmBytes;
    }
}

function base64ToBytes(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function pcmToWav(pcmBytes, sampleRate) {
    const header = new DataView(new ArrayBuffer(44));
    const writeStr = (offset, s) => [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
    writeStr(0, "RIFF");
    header.setUint32(4, 36 + pcmBytes.length, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    header.setUint32(16, 16, true);
    header.setUint16(20, 1, true);          // PCM
    header.setUint16(22, 1, true);          // mono
    header.setUint32(24, sampleRate, true);
    header.setUint32(28, sampleRate * 2, true);
    header.setUint16(32, 2, true);
    header.setUint16(34, 16, true);
    writeStr(36, "data");
    header.setUint32(40, pcmBytes.length, true);
    return new Blob([header, pcmBytes], { type: "audio/wav" });
}

/** Seconds of audio in a 16-bit mono WAV, read from its header. */
export async function wavDurationSeconds(blob) {
    try {
        const view = new DataView(await blob.slice(0, 44).arrayBuffer());
        const byteRate = view.getUint32(28, true);
        const dataSize = view.getUint32(40, true);
        return byteRate ? dataSize / byteRate : 0;
    } catch {
        return 0;
    }
}
