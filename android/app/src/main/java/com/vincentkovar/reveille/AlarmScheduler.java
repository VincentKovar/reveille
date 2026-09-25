package com.vincentkovar.reveille;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Works out the next ring and books it with Android's AlarmManager.setAlarmClock —
 * the same mechanism the built-in Clock app uses. It fires on time even in
 * Doze / battery saver, and shows the alarm icon in the status bar.
 */
final class AlarmScheduler {
    static final String EXTRA_ALARM_ID = "alarmId";
    static final String EXTRA_AT = "at";
    private static final int REQ_FIRE = 1001;
    private static final int REQ_SHOW = 1002;

    private AlarmScheduler() { }

    /** Mirrors nextOccurrence() in www/js/schedule.js — keep the two in step. */
    static long nextOccurrence(JSONObject alarm, long now) {
        if (alarm == null || !alarm.optBoolean("enabled", false)) return -1;
        int hour = alarm.optInt("hour");
        int minute = alarm.optInt("minute");
        JSONArray days = alarm.optJSONArray("days");
        boolean once = days == null || days.length() == 0;

        Calendar from = Calendar.getInstance();
        from.setTimeInMillis(now);
        for (int offset = 0; offset <= 7; offset++) {
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(from.get(Calendar.YEAR), from.get(Calendar.MONTH), from.get(Calendar.DAY_OF_MONTH) + offset, hour, minute, 0);
            long t = c.getTimeInMillis();
            if (t <= now) continue;
            int weekday = c.get(Calendar.DAY_OF_WEEK) - 1; // Calendar: Sunday = 1; ours: Sunday = 0
            if (once || contains(days, weekday)) return t;
        }
        return -1;
    }

    private static boolean contains(JSONArray days, int weekday) {
        for (int i = 0; i < days.length(); i++) {
            if (days.optInt(i, -1) == weekday) return true;
        }
        return false;
    }

    /** Earliest of all enabled alarms and a pending snooze. Returns {at, alarmId} or null. */
    static Object[] nextRing(AlarmStore store, long now) {
        long best = -1;
        String bestId = null;
        JSONArray alarms = store.alarms();
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = alarms.optJSONObject(i);
            long t = nextOccurrence(a, now);
            if (t > 0 && (best < 0 || t < best)) {
                best = t;
                bestId = a.optString("id");
            }
        }
        long snooze = store.snoozeAt();
        if (snooze > now && (best < 0 || snooze <= best)) {
            best = snooze;
            bestId = store.snoozeAlarmId();
        }
        return best < 0 ? null : new Object[] { best, bestId };
    }

    /** Replace whatever is booked with the next ring (or nothing). Safe to call any time. */
    static long reschedule(Context context) {
        AlarmStore store = new AlarmStore(context);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Object[] next = nextRing(store, System.currentTimeMillis());

        PendingIntent existing = firePendingIntent(context, null, 0, PendingIntent.FLAG_NO_CREATE);
        if (existing != null) am.cancel(existing);
        if (next == null) return -1;

        long at = (long) next[0];
        String alarmId = (String) next[1];
        PendingIntent fire = firePendingIntent(context, alarmId, at, PendingIntent.FLAG_UPDATE_CURRENT);

        Intent show = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent showPi = PendingIntent.getActivity(context, REQ_SHOW, show,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            // Without the exact-alarm permission, fall back to the closest thing Android allows.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        } else {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi), fire);
        }
        return at;
    }

    private static PendingIntent firePendingIntent(Context context, String alarmId, long at, int flags) {
        Intent intent = new Intent(context, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_FIRE);
        if (alarmId != null) intent.putExtra(EXTRA_ALARM_ID, alarmId);
        intent.putExtra(EXTRA_AT, at);
        return PendingIntent.getBroadcast(context, REQ_FIRE, intent, flags | PendingIntent.FLAG_IMMUTABLE);
    }
}
