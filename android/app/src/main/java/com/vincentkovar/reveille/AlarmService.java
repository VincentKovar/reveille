package com.vincentkovar.reveille;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Runs for the length of one wake-up. Keeps the phone awake, shows the
 * full-screen alarm over the lock screen, plays the pre-recorded poem if there
 * is one, and arms the fail-safe chime. Ends on dismiss, snooze, or after
 * 30 minutes unattended.
 */
public class AlarmService extends Service {
    private static final String TAG = "ReveilleAlarm";
    static final String CHANNEL_ID = "reveille_alarm";
    static final int NOTIFICATION_ID = 42;

    static final String ACTION_START = "com.vincentkovar.reveille.START";
    static final String ACTION_DISMISS = "com.vincentkovar.reveille.DISMISS";
    static final String ACTION_SNOOZE = "com.vincentkovar.reveille.SNOOZE";
    static final String EXTRA_MINUTES = "minutes";

    static final int FAILSAFE_START_SECONDS = 30;
    static final int FAILSAFE_AFTER_POEM_SECONDS = 90;
    static final int RAMP_SECONDS = 20;
    static final int DEFAULT_SNOOZE_MINUTES = 9;
    private static final long GIVE_UP_MS = 30 * 60 * 1000L;

    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable giveUp = () -> finish("timeout", 0);

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_DISMISS.equals(action)) {
            finish("dismiss", 0);
        } else if (ACTION_SNOOZE.equals(action)) {
            finish("snooze", intent.getIntExtra(EXTRA_MINUTES, DEFAULT_SNOOZE_MINUTES));
        } else {
            begin(intent);
        }
        return START_NOT_STICKY;
    }

    private void begin(Intent intent) {
        String alarmId = intent != null ? intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) : null;
        long at = intent != null ? intent.getLongExtra(AlarmScheduler.EXTRA_AT, System.currentTimeMillis()) : System.currentTimeMillis();
        AlarmStore store = new AlarmStore(this);

        // Must go foreground within seconds of starting.
        Notification n = buildNotification(this);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "reveille:alarm");
            wakeLock.acquire(GIVE_UP_MS + 60_000);
        }

        // Bookkeeping: this ring has happened, so book the next one.
        if (store.snoozeAt() > 0 && store.snoozeAt() <= System.currentTimeMillis() + 1000) store.clearSnooze();
        store.disableIfOnce(alarmId);
        store.setRinging(alarmId, at);
        AlarmScheduler.reschedule(this);

        AlarmAudio audio = AlarmAudio.get(this);
        audio.armFailsafe(FAILSAFE_START_SECONDS);

        // Play the pre-recorded poem right away if we have it; otherwise the app screen reads it.
        if (store.hasFreshAudio()) {
            try {
                audio.playFile(store.audioFile(), RAMP_SECONDS);
                audio.acknowledge();
            } catch (Exception e) {
                Log.w(TAG, "Couldn't play pre-recorded poem; waiting for the app", e);
            }
        }

        handler.removeCallbacks(giveUp);
        handler.postDelayed(giveUp, GIVE_UP_MS);
        ReveilleAlarmPlugin.emitRingStarted(alarmId, at);
    }

    /** End the wake-up. reason: "dismiss" | "snooze" | "timeout". */
    private void finish(String reason, int snoozeMinutes) {
        AlarmStore store = new AlarmStore(this);
        AlarmAudio.get(this).stopAll();
        long now = System.currentTimeMillis();

        if ("snooze".equals(reason)) {
            store.setSnooze(now + snoozeMinutes * 60_000L, store.ringAlarmId());
        } else if (store.ringing()) {
            store.markDismissed(now);
            store.discardAudio();
        }
        store.clearRinging();
        AlarmScheduler.reschedule(this);
        handler.removeCallbacks(giveUp);
        ReveilleAlarmPlugin.emitRingStopped("snooze".equals(reason) ? "snooze" : "dismiss");
        MainActivity.releaseLockScreen();

        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(giveUp);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* ---------------- Notification ---------------- */

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Alarms", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Shows the wake-up screen when an alarm rings");
        ch.setSound(null, null); // Reveille plays its own sound on the alarm channel.
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(true);
        nm.createNotificationChannel(ch);
    }

    private static Notification buildNotification(Context context) {
        ensureChannel(context);
        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_RINGING, true);
        PendingIntent fullScreen = PendingIntent.getActivity(context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent snooze = PendingIntent.getService(context, 1,
                new Intent(context, AlarmService.class).setAction(ACTION_SNOOZE).putExtra(EXTRA_MINUTES, snoozeMinutes(context)),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent dismiss = PendingIntent.getService(context, 2,
                new Intent(context, AlarmService.class).setAction(ACTION_DISMISS),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_reveille)
                .setContentTitle("Good morning")
                .setContentText("Your poem is ready. Tap to read along.")
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setColor(0xFFE8B07A)
                .setContentIntent(fullScreen)
                .setFullScreenIntent(fullScreen, true)
                .addAction(0, "Snooze", snooze)
                .addAction(0, "I'm up", dismiss)
                .build();
    }

    private static int snoozeMinutes(Context context) {
        return context.getSharedPreferences("reveille_alarms", MODE_PRIVATE).getInt("snoozeMinutes", DEFAULT_SNOOZE_MINUTES);
    }
}
