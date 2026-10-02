import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boostQuietSpeech, isTransientGeminiError, GeminiError, parseVerdicts, candidatesPrompt } from '../www/js/gemini.js';

function pcm16(values) {
    const bytes = new Uint8Array(values.length * 2);
    const view = new DataView(bytes.buffer);
    values.forEach((v, i) => view.setInt16(i * 2, v, true));
    return bytes;
}

function peakOf(bytes) {
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength / 2);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    return peak;
}

test('boosts a quiet recording toward the target peak', () => {
    // Peak 3000 of 32767 (~9%) is a plausible level for under-mastered TTS output.
    const quiet = pcm16([3000, -2500, 1800, -3000, 500]);
    const boosted = boostQuietSpeech(quiet, 0.9, 100); // high cap so the target, not the cap, governs
    const target = Math.round(0.9 * 32767);
    assert.ok(Math.abs(peakOf(boosted) - target) <= 1, `expected peak near ${target}, got ${peakOf(boosted)}`);
});

test('never lowers volume — already-loud audio is returned unchanged', () => {
    const loud = pcm16([32000, -31000, 30500]);
    assert.equal(boostQuietSpeech(loud), loud); // same reference: no copy made, no processing
});

test('silence is left alone rather than dividing by zero', () => {
    const silence = pcm16([0, 0, 0, 0]);
    assert.equal(boostQuietSpeech(silence), silence);
});

test('the boost is capped so a near-silent clip is not amplified into noise', () => {
    const tiny = pcm16([10, -8, 6]);
    const boosted = boostQuietSpeech(tiny, 0.9, 6);
    assert.equal(peakOf(boosted), 60); // 10 * 6 (the cap), not 10 * ~2950 (the target)
});

test('clamps to the valid 16-bit range even at the gain cap', () => {
    // A peak near full scale but not quite there, with maxGain high enough that
    // naive multiplication of OTHER samples could overflow if not clamped.
    const samples = pcm16([32767, -32768, 100]);
    const boosted = boostQuietSpeech(samples, 0.99, 50);
    const view = new Int16Array(boosted.buffer);
    for (const s of view) {
        assert.ok(s >= -32768 && s <= 32767, `sample ${s} out of int16 range`);
    }
});

test('handles an odd-length buffer without throwing', () => {
    const odd = new Uint8Array([1, 2, 3]); // not a multiple of 2 bytes
    assert.doesNotThrow(() => boostQuietSpeech(odd));
});

test('retries passing trouble: no connection, timeouts, Google hiccups', () => {
    assert.equal(isTransientGeminiError(new TypeError('Failed to fetch')), true);
    assert.equal(isTransientGeminiError(Object.assign(new Error('aborted'), { name: 'AbortError' })), true);
    assert.equal(isTransientGeminiError(new GeminiError('overloaded', 503)), true);
    assert.equal(isTransientGeminiError(new GeminiError('timeout', 408)), true);
});

test('does not retry what a retry cannot fix: used-up quota, bad key, retired model', () => {
    for (const status of [400, 401, 403, 404, 429]) {
        assert.equal(isTransientGeminiError(new GeminiError('nope', status)), false, `status ${status}`);
    }
});

test('parseVerdicts keeps accepted poems and labels, and ignores nonsense', () => {
    const result = {
        verdicts: [
            { index: 0, accept: true, archetype: 'surprising', season: 'rain' },
            { index: 1, accept: false, archetype: 'narrative', season: 'any' },
            { index: 2, accept: true, archetype: 'weird', season: 'monsoon' }, // unknown labels get defaults
            { index: 2, accept: true, archetype: 'surprising', season: 'winter' }, // repeat of an index
            { index: 9, accept: true, archetype: 'narrative', season: 'any' },  // outside the list
            { index: 'x', accept: true },
            { index: 3, accept: 'yes' },                                          // only true accepts
        ],
        best: 2,
    };
    const { accepted, best } = parseVerdicts(result, 4);
    assert.deepEqual(accepted, [
        { index: 0, archetype: 'surprising', season: 'rain' },
        { index: 2, archetype: 'narrative', season: 'any' },
    ]);
    assert.equal(best, 2);
});

test('parseVerdicts only allows a best poem that was accepted', () => {
    const verdicts = [{ index: 0, accept: true, archetype: 'narrative', season: 'any' }, { index: 1, accept: false, archetype: 'narrative', season: 'any' }];
    assert.equal(parseVerdicts({ verdicts, best: 1 }, 2).best, -1);
    assert.equal(parseVerdicts({ verdicts, best: -1 }, 2).best, -1);
    assert.deepEqual(parseVerdicts(null, 2), { accepted: [], best: -1 });
});

test('candidatesPrompt numbers each poem with its title, author and text', () => {
    const text = candidatesPrompt([{ title: 'One', author: 'A', lines: [' x ', '', 'y'] }, { title: 'Two', author: 'B', lines: ['z'] }]);
    assert.equal(text, '[0] "One" by A\nx\n\ny\n\n[1] "Two" by B\nz');
});
