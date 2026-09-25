package com.vincentkovar.reveille;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

/**
 * Receives the booked alarm. Not exported: only our own PendingIntent can reach it.
 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.vincentkovar.reveille.FIRE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_FIRE.equals(intent.getAction())) return;
        Intent service = new Intent(context, AlarmService.class)
                .setAction(AlarmService.ACTION_START)
                .putExtras(intent);
        ContextCompat.startForegroundService(context, service);
    }

    /**
     * Re-books alarms whenever Android forgets them: after a reboot, an app
     * update, a clock or time-zone change, or the exact-alarm permission
     * being granted. Exported so the system can reach it; it can only re-book,
     * never ring.
     */
    public static class SystemEvents extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            AlarmScheduler.reschedule(context);
        }
    }
}
