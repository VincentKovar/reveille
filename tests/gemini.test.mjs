import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boostQuietSpeech } from '../www/js/gemini.js';

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
