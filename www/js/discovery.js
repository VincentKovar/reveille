/* ----------------------------------------------------
 * POEM DISCOVERY
 * Finds poems the app wasn't shipped with. The words always come from PoetryDB
 * (public-domain texts, https://poetrydb.org). Gemini only judges which poems fit
 * (see judgePoems in gemini.js) and never supplies text.
 * ---------------------------------------------------- */
import { POETRYDB_URL, DISCOVERY_MIN_LINES, DISCOVERY_MAX_LINES } from './config.js';
import { judgePoems, suggestSearchWords } from './gemini.js';

const RANDOM_LIST_SIZE = 80;     // titles looked at per top-up round
const CANDIDATES_PER_ROUND = 12; // full poems shown to Gemini at once when topping up
const CANDIDATES_FOR_MOOD = 20;  // more for a mood search: word matches are loose ("rain" also finds "brain")
const MAX_PER_AUTHOR = 2;        // so one prolific poet can't fill the shortlist
const TOP_UP_ROUNDS = 2;         // Gemini calls per top-up at most
const MOOD_SEARCH_WORDS = 4;

export class DiscoveryError extends Error {}

/* ---------------- PURE HELPERS ---------------- */
function slug(text) {
    return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function poemId(author, title) {
    return `pdb-${slug(author)}-${slug(title)}`;
}

// Garbled characters from a bad source encoding.
const BROKEN_TEXT = /Ã|â€|�/;

/**
 * Tidies a poem from PoetryDB into { id, title, author, lines }, or returns null if it can't be used:
 * missing fields, outside the line limits (blank stanza-break lines don't count) or garbled text.
 */
export function normalizePoem(raw) {
    if (typeof raw?.title !== "string" || typeof raw.author !== "string" || !Array.isArray(raw.lines)) return null;
    if (raw.lines.some(l => typeof l !== "string")) return null;
    const lines = [];
    for (const line of raw.lines) {
        const text = line.trim();
        if (!text && (!lines.length || !lines[lines.length - 1])) continue; // no leading or doubled blanks
        lines.push(text);
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    const count = lines.filter(Boolean).length;
    if (count < DISCOVERY_MIN_LINES || count > DISCOVERY_MAX_LINES) return null;
    if (BROKEN_TEXT.test(raw.title + lines.join("\n"))) return null;
    return { id: poemId(raw.author, raw.title), title: raw.title.trim(), author: raw.author.trim(), lines };
}

function shuffled(items, rng) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Picks a shortlist from { title, author, linecount } entries: a usable length, not already known,
 * no more than MAX_PER_AUTHOR from one poet, in random order.
 */
export function sampleEntries(entries, { excludeIds = [], max = CANDIDATES_PER_ROUND, rng = Math.random } = {}) {
    const skip = new Set(excludeIds);
    const perAuthor = new Map();
    const picked = [];
    for (const entry of shuffled(entries, rng)) {
        if (picked.length >= max) break;
        if (typeof entry?.title !== "string" || typeof entry.author !== "string") continue;
        const lines = Number(entry.linecount);
        if (!(lines >= DISCOVERY_MIN_LINES && lines <= DISCOVERY_MAX_LINES)) continue;
        const id = poemId(entry.author, entry.title);
        if (skip.has(id) || (perAuthor.get(entry.author) ?? 0) >= MAX_PER_AUTHOR) continue;
        skip.add(id);
        perAuthor.set(entry.author, (perAuthor.get(entry.author) ?? 0) + 1);
        picked.push(entry);
    }
    return picked;
}

/** Single plain lowercase words only; PoetryDB can't search phrases. */
export function cleanSearchWords(words, max = MOOD_SEARCH_WORDS) {
    const seen = new Set();
    for (const word of words) {
        const w = String(word).trim().toLowerCase();
        if (/^[a-z]{3,15}$/.test(w)) seen.add(w);
    }
    return [...seen].slice(0, max);
}

/* ---------------- POETRYDB ---------------- */
async function getJson(path, fetchFn) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await fetchFn(`${POETRYDB_URL}/${path}`, { signal: ctrl.signal });
        if (res.status === 404) return []; // PoetryDB answers "not found" when nothing matches
        if (!res.ok) throw new DiscoveryError(`PoetryDB HTTP ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        if (err instanceof DiscoveryError) throw err;
        throw new DiscoveryError("Couldn't reach the poem library right now. Try again in a minute.");
    } finally {
        clearTimeout(timer);
    }
}

const listRandom = (fetchFn) => getJson(`random/${RANDOM_LIST_SIZE}/title,author,linecount`, fetchFn);
const listByWord = (word, fetchFn) => getJson(`lines/${word}/title,author,linecount`, fetchFn);

/** Full text for each shortlisted entry. Entries that fail to load or can't be used are skipped. */
async function loadPoems(entries, fetchFn) {
    const loaded = await Promise.allSettled(entries.map(async (entry) => {
        // PoetryDB's multi-field search splits on ";" and its path on "/", so such titles can't be asked for.
        if (/[;/]/.test(entry.title + entry.author)) return null;
        const term = (s) => `${encodeURIComponent(s)}:abs`;
        const found = await getJson(`title,author/${term(entry.title)};${term(entry.author)}`, fetchFn);
        return normalizePoem(found.find(p => p.linecount === entry.linecount) ?? found[0]);
    }));
    return loaded.flatMap(r => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/* ---------------- DISCOVERY ---------------- */
function withVerdict(poem, verdict) {
    return { ...poem, archetype: verdict.archetype, season: verdict.season, source: "poetrydb" };
}

/**
 * Finds up to `needed` new poems that fit Reveille's rules, for the pool of upcoming poems.
 * `excludeIds` are poems the app already has or used lately. Returns what it found, possibly fewer than
 * asked; throws only if it found nothing and something went wrong.
 */
export async function discoverForPool({ needed, excludeIds = [], filter = "all" }, deps = {}) {
    const { fetchFn = fetch, judge = judgePoems, rng = Math.random } = deps;
    const found = [];
    let failure = null;
    for (let round = 0; round < TOP_UP_ROUNDS && found.length < needed; round++) {
        try {
            const taken = [...excludeIds, ...found.map(p => p.id)];
            const entries = sampleEntries(await listRandom(fetchFn), { excludeIds: taken, rng });
            const candidates = await loadPoems(entries, fetchFn);
            if (!candidates.length) continue;
            const { accepted } = await judge(candidates, { filter });
            for (const verdict of accepted) found.push(withVerdict(candidates[verdict.index], verdict));
        } catch (err) {
            failure = err;
            break;
        }
    }
    if (!found.length && failure) throw failure;
    return found.slice(0, needed);
}

/**
 * Finds the one new poem that best fits a mood, or null if nothing fits. Gemini suggests words to search
 * for, PoetryDB returns poems containing them, and Gemini then judges the real texts.
 */
export async function discoverForMood(mood, { excludeIds = [], filter = "all" }, deps = {}) {
    const { fetchFn = fetch, judge = judgePoems, suggest = suggestSearchWords, rng = Math.random } = deps;
    let words = cleanSearchWords(await suggest(mood));
    if (!words.length) words = cleanSearchWords(mood.split(/\s+/)); // Gemini gave nothing usable: search the person's own words
    if (!words.length) return null;

    const lists = await Promise.all(words.map(w => listByWord(w, fetchFn)));
    const entries = sampleEntries(lists.flat(), { excludeIds, max: CANDIDATES_FOR_MOOD, rng });
    const candidates = await loadPoems(entries, fetchFn);
    if (!candidates.length) return null;

    const { accepted, best } = await judge(candidates, { mood, filter });
    const chosen = accepted.find(v => v.index === best);
    return chosen ? withVerdict(candidates[chosen.index], chosen) : null;
}
