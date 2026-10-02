import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    poemId, normalizePoem, sampleEntries, cleanSearchWords, discoverForPool, discoverForMood, DiscoveryError,
} from '../www/js/discovery.js';

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);
const raw = (title, author, n = 8) => ({ title, author, lines: lines(n), linecount: String(n) });
const entry = (title, author, n = 8) => ({ title, author, linecount: String(n) });
const firstRng = () => 0; // deterministic "shuffle"

test('normalizePoem keeps a good poem and gives it a stable id', () => {
    const poem = normalizePoem(raw('Ozymandias', 'Percy Bysshe Shelley', 14));
    assert.equal(poem.id, poemId('Percy Bysshe Shelley', 'Ozymandias'));
    assert.equal(poem.id, 'pdb-percy-bysshe-shelley-ozymandias');
    assert.equal(poem.lines.length, 14);
});

test('normalizePoem trims lines and drops leading, doubled and trailing blank lines', () => {
    const poem = normalizePoem({ title: 'T', author: 'A', lines: ['', '  a  ', '', '', 'b', 'c', 'd', '', ''] });
    assert.deepEqual(poem.lines, ['a', '', 'b', 'c', 'd']);
});

test('normalizePoem counts only real lines against the limits', () => {
    const stanzas = [...lines(15), '', ...lines(15)]; // 30 real lines + 1 stanza break
    assert.ok(normalizePoem({ title: 'T', author: 'A', lines: stanzas }));
    assert.equal(normalizePoem(raw('Too long', 'A', 31)), null);
    assert.equal(normalizePoem(raw('Too short', 'A', 3)), null);
});

test('normalizePoem rejects missing fields and garbled text', () => {
    assert.equal(normalizePoem(null), null);
    assert.equal(normalizePoem({ title: 'T', lines: lines(8) }), null);
    assert.equal(normalizePoem({ title: 'T', author: 'A', lines: 'not a list' }), null);
    assert.equal(normalizePoem({ title: 'T', author: 'A', lines: [...lines(7), 'Ã© garbled'] }), null);
});

test('sampleEntries drops bad lengths, known poems and duplicates', () => {
    const entries = [
        entry('Fine', 'A'), entry('Long', 'B', 40), entry('Short', 'C', 2),
        entry('Known', 'D'), entry('Fine', 'A'), { title: 'No author', linecount: '8' },
    ];
    const picked = sampleEntries(entries, { excludeIds: [poemId('D', 'Known')], rng: firstRng });
    assert.deepEqual(picked.map(e => e.title), ['Fine']);
});

test('sampleEntries limits poems per author and the total', () => {
    const entries = ['1', '2', '3', '4'].map(t => entry(t, 'Prolific')).concat([entry('x', 'Other'), entry('y', 'Third')]);
    const picked = sampleEntries(entries, { rng: firstRng });
    assert.equal(picked.filter(e => e.author === 'Prolific').length, 2);
    assert.equal(sampleEntries(entries, { max: 3, rng: firstRng }).length, 3);
});

test('cleanSearchWords keeps single lowercase words only', () => {
    assert.deepEqual(cleanSearchWords(['Rain', 'train station', 'a', 'rain', 'river!', 'moon']), ['rain', 'moon']);
    assert.deepEqual(cleanSearchWords(['one', 'two', 'six', 'ten', 'big'], 3), ['one', 'two', 'six']);
});

/** A stand-in for PoetryDB: a list of poems, answering the three kinds of request discovery makes. */
function fakePoetryDb(poems) {
    const seen = [];
    const fetchFn = async (url) => {
        const path = decodeURIComponent(new URL(url).pathname.slice(1));
        seen.push(path);
        const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
        if (path.startsWith('random/') || path.startsWith('lines/')) {
            return reply(poems.map(({ title, author, linecount }) => ({ title, author, linecount })));
        }
        const [titlePart, authorPart] = path.split('/')[1].split(';');
        const found = poems.filter(p => p.title === titlePart.replace(':abs', '') && p.author === authorPart.replace(':abs', ''));
        return found.length ? reply(found) : reply({ status: 404 }, 404);
    };
    return { fetchFn, seen };
}

const library = [raw('Alpha', 'A'), raw('Beta', 'B'), raw('Gamma', 'C'), raw('Delta', 'D')];

test('discoverForPool returns judged poems with their labels and PoetryDB text', async () => {
    const { fetchFn } = fakePoetryDb(library);
    const judge = async (candidates) => ({
        accepted: [{ index: 0, archetype: 'surprising', season: 'rain' }],
        best: -1,
        seenTitles: candidates.map(c => c.title),
    });
    const found = await discoverForPool({ needed: 3 }, { fetchFn, judge, rng: firstRng });
    assert.ok(found.length >= 1);
    assert.equal(found[0].source, 'poetrydb');
    assert.equal(found[0].archetype, 'surprising');
    assert.equal(found[0].season, 'rain');
    assert.deepEqual(found[0].lines, lines(8)); // the library's words, nothing from the judge
});

test('discoverForPool never offers excluded poems and stops at the number needed', async () => {
    const { fetchFn } = fakePoetryDb(library);
    const shown = [];
    const judge = async (candidates) => {
        shown.push(...candidates.map(c => c.title));
        return { accepted: candidates.map((_, index) => ({ index, archetype: 'narrative', season: 'any' })), best: -1 };
    };
    const found = await discoverForPool(
        { needed: 2, excludeIds: [poemId('A', 'Alpha')] }, { fetchFn, judge, rng: firstRng });
    assert.equal(found.length, 2);
    assert.ok(!shown.includes('Alpha'));
});

test('discoverForPool keeps what it found if a later round fails, but throws if it found nothing', async () => {
    const { fetchFn } = fakePoetryDb(library);
    let calls = 0;
    const flaky = async (candidates) => {
        if (++calls > 1) throw new Error('boom');
        return { accepted: [{ index: 0, archetype: 'narrative', season: 'any' }], best: -1 };
    };
    const found = await discoverForPool({ needed: 5 }, { fetchFn, judge: flaky, rng: firstRng });
    assert.equal(found.length, 1);

    const broken = async () => { throw new Error('boom'); };
    await assert.rejects(discoverForPool({ needed: 1 }, { fetchFn, judge: broken, rng: firstRng }), /boom/);
});

test('discoverForPool reports an unreachable library as a DiscoveryError', async () => {
    const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(
        discoverForPool({ needed: 1 }, { fetchFn, judge: async () => ({ accepted: [], best: -1 }) }),
        DiscoveryError);
});

test('discoverForMood searches the suggested words and returns the best-fitting poem', async () => {
    const { fetchFn, seen } = fakePoetryDb(library);
    const suggest = async () => ['rain', 'train station'];
    let moodSeen = null;
    const judge = async (candidates, opts) => {
        moodSeen = opts.mood;
        const index = candidates.findIndex(c => c.title === 'Gamma');
        return { accepted: [{ index, archetype: 'narrative', season: 'autumn' }], best: index };
    };
    const poem = await discoverForMood('quiet rain', { excludeIds: [] }, { fetchFn, judge, suggest, rng: firstRng });
    assert.equal(poem.title, 'Gamma');
    assert.equal(poem.source, 'poetrydb');
    assert.equal(moodSeen, 'quiet rain');
    assert.deepEqual(seen.filter(p => p.startsWith('lines/')).map(p => p.split('/')[1]), ['rain']); // phrase dropped
});

test('discoverForMood falls back to the mood\'s own words and returns null when nothing fits', async () => {
    const { fetchFn, seen } = fakePoetryDb(library);
    const judge = async () => ({ accepted: [{ index: 0, archetype: 'narrative', season: 'any' }], best: -1 });
    const poem = await discoverForMood('lonely harbour', { excludeIds: [] },
        { fetchFn, judge, suggest: async () => [], rng: firstRng });
    assert.equal(poem, null);
    assert.deepEqual(seen.filter(p => p.startsWith('lines/')).map(p => p.split('/')[1]), ['lonely', 'harbour']);
});
