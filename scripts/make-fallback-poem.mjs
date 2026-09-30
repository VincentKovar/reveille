// Records the bundled fallback poem used by the Android app when Gemini's voice isn't
// ready at wake-up time: the FALLBACK_POEM_ID poem, read by Sulafat with the default
// delivery style, saved as a WAV inside the app.
// Run once (and again only if you change the poem, voice or style):
//   GEMINI_API_KEY=your-key node scripts/make-fallback-poem.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('Set GEMINI_API_KEY first, e.g.  GEMINI_API_KEY=AIza... node scripts/make-fallback-poem.mjs');
    process.exit(1);
}

// gemini.js reads the key from the app's localStorage; give it one that holds this key.
globalThis.localStorage = {
    getItem: (k) => (k === 'reveille_gemini_key' ? JSON.stringify(apiKey) : null),
    setItem() {},
    removeItem() {},
};

const { synthesizeSpeech, recitationScript, wavDurationSeconds } = await import('../www/js/gemini.js');
const { LIBRARY_POEMS } = await import('../www/js/poems.js');
const { FALLBACK_POEM_ID, DEFAULT_PERSONA } = await import('../www/js/config.js');

const poem = LIBRARY_POEMS.find(p => p.id === FALLBACK_POEM_ID);
if (!poem) throw new Error(`No library poem with id "${FALLBACK_POEM_ID}"`);

let wav;
for (let attempt = 1; attempt <= 3 && !wav; attempt++) {
    try {
        console.log(`Recording "${poem.title}" (attempt ${attempt})…`);
        wav = await synthesizeSpeech(recitationScript(poem), 'Sulafat', DEFAULT_PERSONA, 90000);
    } catch (err) {
        console.warn(String(err.message || err));
    }
}
if (!wav) {
    console.error('Gemini did not return audio. Check the key and try again.');
    process.exit(1);
}

mkdirSync('android/app/src/main/res/raw', { recursive: true });
writeFileSync('android/app/src/main/res/raw/fallback_poem.wav', Buffer.from(await wav.arrayBuffer()));
console.log(`wrote android/app/src/main/res/raw/fallback_poem.wav (${Math.round(await wavDurationSeconds(wav))} s, ${(wav.size / 1024).toFixed(0)} KB)`);
