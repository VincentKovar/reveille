/* ----------------------------------------------------
 * GEMINI API
 * Calls go straight from this device to Google using the key the person
 * pasted in Settings. Each call tries Google's current Interactions API
 * first, then the older generateContent API, so the app keeps working
 * across Google's API changes.
 * ---------------------------------------------------- */
import { GEMINI_TEXT_MODEL, GEMINI_TEXT_BACKUP_MODELS, GEMINI_TTS_MODEL, SPEECH_TARGET_PEAK, SPEECH_MAX_BOOST } from './config.js';
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

/* ---------------- POEM JUDGING ---------------- */
// Gemini never supplies poem text. Discovery (discovery.js) fetches real public-domain poems and
// asks Gemini only which of them fit, so a discovered poem can't be a misquotation.

export const POEM_SEASONS = ["autumn", "winter", "spring", "summer", "rain", "any"];

/**
 * Runs `attempt(model)` with each model in turn until one works. Moves on to the next model only for
 * trouble another model might not have: an overloaded or slow Google, or a used-up quota (which is
 * counted per model). Anything else, such as a rejected key, is thrown straight away.
 */
export async function withBackupModel(models, attempt) {
    let lastError;
    for (const model of models) {
        try {
            return await attempt(model);
        } catch (err) {
            lastError = err;
            if (!isTransientGeminiError(err) && err?.status !== 429) throw err;
        }
    }
    throw lastError;
}

/** Ask for JSON matching `schema`; returns the parsed object. */
function askJson(system, userText, schema) {
    return withBackupModel([GEMINI_TEXT_MODEL, ...GEMINI_TEXT_BACKUP_MODELS], (model) => askJsonWith(model, system, userText, schema));
}

async function askJsonWith(model, system, userText, schema) {
    const data = await withFallback(
        () => post("interactions", {
            model, store: false,
            system_instruction: system,
            input: [{ type: "user_input", content: [{ type: "text", text: userText }] }],
            response_format: { type: "text", mime_type: "application/json", schema },
        }, 30000),
        () => post(`models/${model}:generateContent`, {
            contents: [{ parts: [{ text: userText }] }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
        }, 30000),
    );
    const text = extractText(data).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
        return JSON.parse(text);
    } catch {
        throw new GeminiError("Gemini returned something that wasn't JSON.", 500);
    }
}

const JUDGE_SCHEMA = {
    type: "object",
    properties: {
        verdicts: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    index: { type: "integer" },
                    accept: { type: "boolean" },
                    archetype: { type: "string" },
                    season: { type: "string" },
                },
                required: ["index", "accept", "archetype", "season"],
            },
        },
        best: { type: "integer" },
    },
    required: ["verdicts", "best"],
};

const WORDS_SCHEMA = {
    type: "object",
    properties: { words: { type: "array", items: { type: "string" } } },
    required: ["words"],
};

/** The numbered candidate list shown to Gemini. */
export function candidatesPrompt(candidates) {
    return candidates.map((p, i) =>
        `[${i}] "${p.title}" by ${p.author}\n${p.lines.map(l => l.trim()).join("\n")}`).join("\n\n");
}

/**
 * Reads Gemini's verdicts, trusting nothing: indexes outside the list, repeats and unknown labels are
 * dropped or defaulted. Returns { accepted: [{ index, archetype, season }], best } where best is the
 * index of one accepted poem, or -1.
 */
export function parseVerdicts(result, count) {
    const accepted = [];
    const seen = new Set();
    for (const v of Array.isArray(result?.verdicts) ? result.verdicts : []) {
        if (!Number.isInteger(v?.index) || v.index < 0 || v.index >= count || seen.has(v.index)) continue;
        seen.add(v.index);
        if (v.accept !== true) continue;
        accepted.push({
            index: v.index,
            archetype: v.archetype === "surprising" ? "surprising" : "narrative",
            season: POEM_SEASONS.includes(v.season) ? v.season : "any",
        });
    }
    const best = accepted.some(a => a.index === result?.best) ? result.best : -1;
    return { accepted, best };
}

/**
 * Judge real poems against Reveille's selection rules. `candidates` are { title, author, lines }.
 * With a mood, also picks the accepted poem that fits it best; `filter` is "narrative", "surprising" or "all".
 * Returns { accepted, best } as parseVerdicts does — throws GeminiError on failure.
 */
export async function judgePoems(candidates, { mood = "", filter = "all" } = {}) {
    const system = `You choose poems for an alarm clock that wakes people by reading one aloud. You are given numbered public-domain poems. Judge only the text given: never quote, rewrite or add lines.
Accept a poem only if all of these are true:
1. It is complete: a whole poem, not an excerpt, a fragment or a numbered part of a longer work.
2. It is narrative or quasi-narrative (a scene unfolds or something happens), or it is built on a fresh, surprising image. A static lyric about abstract feeling, or an argument, is not enough.
3. It is open-ended: the last line does not fully resolve or moralise the central idea.
4. It is free of slurs and demeaning language about people.
Return a verdict for every poem. For accepted poems, set "archetype" to "narrative" if something happens or a scene unfolds, otherwise "surprising". Set "season" to the best fit among ${POEM_SEASONS.join(", ")} ("rain" means a wet or stormy day, "any" means no particular season). Return the same values for rejected poems.
Set "best" to the index of the accepted poem that best fits the mood${filter === "all" ? "" : ` (prefer a ${filter} poem)`}, or -1 if there is no mood or no accepted poem fits.`;
    const userText = `${mood ? `Mood: ${mood}\n\n` : "Mood: none\n\n"}${candidatesPrompt(candidates)}`;
    return parseVerdicts(await askJson(system, userText, JUDGE_SCHEMA), candidates.length);
}

/** Plain words likely to appear in the lines of a poem matching a mood, for searching the poem library. */
export async function suggestSearchWords(mood) {
    const system = `You help search a library of classic English poems by the words in their lines.
Given a mood or scene, give up to 5 single lowercase words (plain concrete nouns or verbs, no phrases) likely to appear in the lines of a poem that suits it.`;
    const result = await askJson(system, `Mood: ${mood}`, WORDS_SCHEMA);
    return Array.isArray(result?.words) ? result.words.map(String) : [];
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
