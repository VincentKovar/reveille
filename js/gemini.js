/* ----------------------------------------------------
 * GEMINI API CALLS
 * Uses the key the user pasted into Settings (stored only
 * in this browser's localStorage — see storage.js).
 * ---------------------------------------------------- */

/**
 * Fetch a new public-domain-style poem from Gemini matching the given prompt,
 * avoiding titles already recently used.
 * Returns a poem object { id, title, author, archetype, season, lines } or null on failure.
 */
async function fetchOraclePoem(prompt, recentTitles) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        console.warn("No Gemini API key set; skipping oracle fetch.");
        return null;
    }

    const avoidClause = recentTitles.length
        ? `\nAvoid repeating any of these recently used poems: ${recentTitles.join(", ")}.`
        : "";

    const systemInstruction = `You are a poetry scholar specializing in public domain poetry.
Select or retrieve an authentic short public domain poem (under 20 lines) that matches these exact rules:
1. Narrative or quasi-narrative (a scene unfolds or something happens).
2. Fresh, surprising, open-ended imagery.
3. Unresolved central idea by the final line.${avoidClause}
Output JSON matching this schema:
{
  "title": "Poem Title",
  "author": "Author Name",
  "lines": ["Line 1", "Line 2", ...]
}`;

    const userQuery = `Find a public domain poem for: ${prompt}`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            title: { type: "STRING" },
                            author: { type: "STRING" },
                            lines: { type: "ARRAY", items: { type: "STRING" } }
                        },
                        required: ["title", "author", "lines"]
                    }
                }
            })
        });

        if (!response.ok) {
            console.warn("Gemini oracle fetch failed:", response.status, await response.text());
            return null;
        }

        const data = await response.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) return null;

        const newPoem = JSON.parse(jsonText);
        newPoem.id = "oracle-" + Date.now();
        newPoem.archetype = "surprising";
        newPoem.season = "oracle";
        return newPoem;
    } catch (e) {
        console.error("fetchOraclePoem error:", e);
        return null;
    }
}

/**
 * Speak text using Gemini TTS with the user's own key. Falls back to the
 * browser's built-in speechSynthesis if no key is set or the call fails.
 * Calls onVoicePath('gemini' | 'fallback') so the UI can be honest about
 * which voice actually played.
 */
async function speakPoemGeminiTTS(textToSpeak, voiceName, personaDirective, onComplete, onVoicePath) {
    const apiKey = getGeminiApiKey();

    if (!apiKey) {
        if (onVoicePath) onVoicePath('fallback');
        return speakFallbackSpeechSynthesis(textToSpeak, onComplete);
    }

    const promptText = `${personaDirective}\n\nPoem text:\n${textToSpeak}`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName }
                }
            }
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Gemini TTS HTTP ${response.status}: ${await response.text()}`);
        }

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (!audioData || !mimeType) {
            throw new Error("Invalid audio response from Gemini TTS");
        }

        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;

        const pcmData = base64ToArrayBuffer(audioData);
        const pcm16 = new Int16Array(pcmData);
        const wavBlob = pcmToWav(pcm16, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);

        const audio = new Audio(audioUrl);
        audio.onended = () => { if (onComplete) onComplete(); };
        if (onVoicePath) onVoicePath('gemini');
        audio.play();
        return audio;
    } catch (err) {
        console.warn("Gemini TTS failed, using Web Speech Synthesis fallback:", err);
        if (onVoicePath) onVoicePath('fallback');
        return speakFallbackSpeechSynthesis(textToSpeak, onComplete);
    }
}

function speakFallbackSpeechSynthesis(text, onComplete) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.88;
        utterance.pitch = 1.0;
        utterance.onend = () => { if (onComplete) onComplete(); };
        window.speechSynthesis.speak(utterance);
    }
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function pcmToWav(pcmData, sampleRate) {
    const numChannels = 1;
    const sampleBits = 16;
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (sampleBits / 8), true);
    view.setUint16(32, numChannels * (sampleBits / 8), true);
    view.setUint16(34, sampleBits, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length * 2, true);

    let offset = 44;
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        view.setInt16(offset, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}
