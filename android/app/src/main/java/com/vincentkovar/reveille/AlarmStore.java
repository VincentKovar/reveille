package com.vincentkovar.reveille;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;

/**
 * Native copy of the alarm list and ring state. The web layer sends its alarms
 * here on every change (ReveilleAlarmPlugin.sync) so alarms keep working after
 * a reboot or when the app has been closed.
 */
final class AlarmStore {
    private static final String PREFS = "reveille_alarms";
    private static final String K_ALARMS = "alarms";
    private static final String K_SNOOZE_AT = "snoozeAt";
    private static final String K_SNOOZE_ID = "snoozeAlarmId";
    private static final String K_RINGING = "ringing";
    private static final String K_RING_ID = "ringAlarmId";
    private static final String K_RING_AT = "ringAt";
    private static final String K_LAST_DISMISSED = "lastDismissedAt";
    private static final String K_UPCOMING_KEY = "upcomingAudioKey";
    private static final String K_CACHED_KEY = "cachedAudioKey";

    private final SharedPreferences prefs;
    private final Context context;

    AlarmStore(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    JSONArray alarms() {
        try {
            return new JSONArray(prefs.getString(K_ALARMS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** False until the web layer has sent an alarm list at least once. */
    boolean hasAlarmList() {
        return prefs.contains(K_ALARMS);
    }

    void saveAlarms(JSONArray alarms) {
        prefs.edit().putString(K_ALARMS, alarms.toString()).apply();
    }

    /** One-time alarms switch themselves off after ringing. */
    void disableIfOnce(String alarmId) {
        JSONArray all = alarms();
        for (int i = 0; i < all.length(); i++) {
            JSONObject a = all.optJSONObject(i);
            if (a != null && alarmId != null && alarmId.equals(a.optString("id"))) {
                JSONArray days = a.optJSONArray("days");
                if (days == null || days.length() == 0) {
                    try { a.put("enabled", false); } catch (JSONException ignored) { }
                    saveAlarms(all);
                }
                return;
            }
        }
    }

    long snoozeAt() { return prefs.getLong(K_SNOOZE_AT, 0); }
    String snoozeAlarmId() { return prefs.getString(K_SNOOZE_ID, null); }

    void setSnooze(long at, String alarmId) {
        prefs.edit().putLong(K_SNOOZE_AT, at).putString(K_SNOOZE_ID, alarmId).apply();
    }

    void clearSnooze() {
        prefs.edit().remove(K_SNOOZE_AT).remove(K_SNOOZE_ID).apply();
    }

    boolean ringing() { return prefs.getBoolean(K_RINGING, false); }
    String ringAlarmId() { return prefs.getString(K_RING_ID, null); }
    long ringAt() { return prefs.getLong(K_RING_AT, 0); }

    void setRinging(String alarmId, long at) {
        prefs.edit().putBoolean(K_RINGING, true).putString(K_RING_ID, alarmId).putLong(K_RING_AT, at).commit();
    }

    void clearRinging() {
        prefs.edit().putBoolean(K_RINGING, false).commit();
    }

    long lastDismissedAt() { return prefs.getLong(K_LAST_DISMISSED, 0); }

    void markDismissed(long at) {
        prefs.edit().putLong(K_LAST_DISMISSED, at).apply();
    }

    /* ---- Pre-recorded poem audio ----
     * The web layer records the next poem ahead of time and hands it over, so the
     * alarm can play it straight away without waiting for the app screen to load. */
    File audioFile() {
        return new File(context.getFilesDir(), "upcoming-poem.wav");
    }

    void setUpcomingKey(String key) {
        prefs.edit().putString(K_UPCOMING_KEY, key).apply();
    }

    void setCachedKey(String key) {
        prefs.edit().putString(K_CACHED_KEY, key).apply();
    }

    /** The recording on disk is for the poem that's actually due next. */
    boolean hasFreshAudio() {
        String up = prefs.getString(K_UPCOMING_KEY, null);
        String cached = prefs.getString(K_CACHED_KEY, null);
        return up != null && up.equals(cached) && audioFile().exists();
    }

    /** After a dismiss the recording has been heard; never replay it for tomorrow. */
    void discardAudio() {
        //noinspection ResultOfMethodCallIgnored
        audioFile().delete();
        prefs.edit().remove(K_CACHED_KEY).apply();
    }
}
