package com.vincentkovar.reveille;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import java.io.File;
import java.util.Locale;

/**
 * Everything audible during a wake-up: the poem recording, the phone's own
 * text-to-speech voice, and the fail-safe chime. All of it plays on the ALARM
 * stream, so it follows the alarm volume (not media volume) and plays in
 * silent mode — exactly like the built-in Clock app.
 */
final class AlarmAudio {
    private static final String TAG = "ReveilleAudio";
    private static AlarmAudio instance;

    // Extra loudness on top of the phone's own alarm-volume ceiling. MediaPlayer.setVolume()
    // and TextToSpeech's volume param are both clamped to 100% of that ceiling — there's no
    // way to ask them for more. LoudnessEnhancer is the dedicated Android API for exactly
    // this: a compressor-backed gain boost that goes past that ceiling without hard clipping.
    // 600 millibels = +6 dB, a noticeable boost that stays clean; some phone speakers
    // (Samsung's among them) are quiet enough at 100% volume that this matters.
    private static final int SPEECH_BOOST_MILLIBELS = 600;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioAttributes alarmAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();

    private MediaPlayer poem;
    private MediaPlayer chime;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String pendingSpeech;
    private AudioFocusRequest focusRequest;
    private LoudnessEnhancer poemLoudness;
    private LoudnessEnhancer speechLoudness;
    private int speechSessionId = AudioManager.AUDIO_SESSION_ID_GENERATE;
    private long poemStartedElapsed;
    private float poemDurationSec;
    private final Runnable failsafeRunnable = this::startChime;

    static synchronized AlarmAudio get(Context context) {
        if (instance == null) instance = new AlarmAudio(context.getApplicationContext());
        return instance;
    }

    private AlarmAudio(Context context) {
        this.context = context;
    }

    /** The voice finished. During a real alarm, start the countdown to the chime in case they fell back asleep. */
    private void onVoiceEnded(String event) {
        if (new AlarmStore(context).ringing()) armFailsafe(AlarmService.FAILSAFE_AFTER_POEM_SECONDS);
        ReveilleAlarmPlugin.emit(event, null);
    }

    /* ---------------- Fail-safe ---------------- */

    /** Start the backup chime after `seconds` unless something acknowledges first. */
    void armFailsafe(int seconds) {
        main.removeCallbacks(failsafeRunnable);
        main.postDelayed(failsafeRunnable, seconds * 1000L);
    }

    /** Sound has started playing: cancel the pending chime (and stop it if it already started). */
    void acknowledge() {
        main.removeCallbacks(failsafeRunnable);
        stopChime();
    }

    private void startChime() {
        if (chime != null) return;
        Log.i(TAG, "Fail-safe chime starting");
        try {
            chime = MediaPlayer.create(context, R.raw.failsafe_chime, alarmAttrs, AudioManager.AUDIO_SESSION_ID_GENERATE);
            if (chime == null) return;
            chime.setLooping(true);
            requestFocus();
            ramp(chime, 0.15f, 60_000);
            chime.start();
        } catch (Exception e) {
            Log.e(TAG, "Chime failed", e);
        }
    }

    private void stopChime() {
        if (chime != null) {
            try { chime.stop(); } catch (Exception ignored) { }
            chime.release();
            chime = null;
        }
    }

    /* ---------------- Poem recording ---------------- */

    /** Plays a WAV file, fading in from quiet over rampSeconds. Returns duration in seconds. */
    float playFile(File file, int rampSeconds) throws Exception {
        stopPoem();
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(alarmAttrs);
        mp.setDataSource(file.getAbsolutePath());
        mp.prepare();
        attachLoudnessBoost(mp);
        mp.setOnCompletionListener(p -> {
            if (poem == p) {
                stopPoem();
                onVoiceEnded("playbackEnded");
            }
        });
        requestFocus();
        if (rampSeconds > 0) ramp(mp, 0.25f, rampSeconds * 1000L); else mp.setVolume(1f, 1f);
        mp.start();
        poem = mp;
        poemStartedElapsed = SystemClock.elapsedRealtime();
        poemDurationSec = mp.getDuration() / 1000f;
        return poemDurationSec;
    }

    boolean isPoemPlaying() {
        return poem != null;
    }

    /** Seconds into the current recording, for syncing the on-screen highlight. */
    float poemElapsedSec() {
        return poem == null ? 0 : (SystemClock.elapsedRealtime() - poemStartedElapsed) / 1000f;
    }

    float poemDurationSec() { return poemDurationSec; }

    private void stopPoem() {
        if (poem != null) {
            MediaPlayer p = poem;
            poem = null;
            try { p.stop(); } catch (Exception ignored) { }
            p.release();
        }
        if (poemLoudness != null) {
            try { poemLoudness.release(); } catch (Exception ignored) { }
            poemLoudness = null;
        }
    }

    /** +6 dB past the alarm stream's own ceiling. Not every device has this effect
     * available, so a failure here just means normal (not boosted) volume. */
    private void attachLoudnessBoost(MediaPlayer mp) {
        try {
            LoudnessEnhancer enhancer = new LoudnessEnhancer(mp.getAudioSessionId());
            enhancer.setTargetGain(SPEECH_BOOST_MILLIBELS);
            enhancer.setEnabled(true);
            poemLoudness = enhancer;
        } catch (Exception e) {
            Log.w(TAG, "LoudnessEnhancer unavailable; playing the poem at normal volume", e);
            poemLoudness = null;
        }
    }

    /* ---------------- Phone's own voice ---------------- */

    void speak(String text) {
        if (tts == null) {
            pendingSpeech = text;
            tts = new TextToSpeech(context, status -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (!ttsReady) {
                    Log.w(TAG, "No text-to-speech engine available");
                    onVoiceEnded("speechEnded");
                    return;
                }
                tts.setAudioAttributes(alarmAttrs);
                tts.setLanguage(Locale.getDefault());
                tts.setSpeechRate(0.85f);
                attachSpeechLoudnessBoost();
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { main.post(() -> onVoiceEnded("speechEnded")); }
                    @Override public void onError(String id) { main.post(() -> onVoiceEnded("speechEnded")); }
                });
                if (pendingSpeech != null) {
                    String t = pendingSpeech;
                    pendingSpeech = null;
                    speakNow(t);
                }
            });
        } else if (ttsReady) {
            speakNow(text);
        } else {
            pendingSpeech = text;
        }
    }

    private void speakNow(String text) {
        requestFocus();
        Bundle params = new Bundle();
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM);
        if (speechLoudness != null) {
            // Route this utterance through the audio session we've already boosted.
            params.putInt(TextToSpeech.Engine.KEY_PARAM_SESSION_ID, speechSessionId);
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "poem");
    }

    /** Same +6 dB boost as the poem recording, applied to the phone's own voice
     * (used when there's no Gemini key). Needs an explicit session id, generated
     * up front, so the effect can be attached before the first utterance plays. */
    private void attachSpeechLoudnessBoost() {
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            speechSessionId = am.generateAudioSessionId();
            LoudnessEnhancer enhancer = new LoudnessEnhancer(speechSessionId);
            enhancer.setTargetGain(SPEECH_BOOST_MILLIBELS);
            enhancer.setEnabled(true);
            speechLoudness = enhancer;
        } catch (Exception e) {
            Log.w(TAG, "LoudnessEnhancer unavailable; using the phone's voice at normal volume", e);
            speechLoudness = null;
        }
    }

    /* ---------------- Shared ---------------- */

    /** Stop everything: poem, speech, chime and any pending fail-safe. */
    void stopAll() {
        main.removeCallbacks(failsafeRunnable);
        stopPoem();
        stopChime();
        pendingSpeech = null;
        if (tts != null) tts.stop();
        abandonFocus();
    }

    /** Stop the poem and speech only (e.g. a preview being cancelled). */
    void stopVoice() {
        stopPoem();
        pendingSpeech = null;
        if (tts != null) tts.stop();
    }

    private void ramp(MediaPlayer mp, float from, long durationMs) {
        final long start = SystemClock.elapsedRealtime();
        mp.setVolume(from, from);
        main.post(new Runnable() {
            @Override public void run() {
                if (mp != poem && mp != chime) return;
                float t = Math.min(1f, (SystemClock.elapsedRealtime() - start) / (float) durationMs);
                float v = from + (1f - from) * t;
                try { mp.setVolume(v, v); } catch (IllegalStateException e) { return; }
                if (t < 1f) main.postDelayed(this, 250);
            }
        });
    }

    private void requestFocus() {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(alarmAttrs).build();
            }
            am.requestAudioFocus(focusRequest);
        }
    }

    private void abandonFocus() {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            am.abandonAudioFocusRequest(focusRequest);
        }
    }
}
