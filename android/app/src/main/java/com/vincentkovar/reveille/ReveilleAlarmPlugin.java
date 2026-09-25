package com.vincentkovar.reveille;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;

/**
 * The bridge between the web app (www/js/platform.js) and native alarms.
 * Method names here are what platform.js calls.
 */
@CapacitorPlugin(
        name = "ReveilleAlarm",
        permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class ReveilleAlarmPlugin extends Plugin {
    private static ReveilleAlarmPlugin active;

    @Override
    public void load() {
        active = this;
        AlarmService.ensureChannel(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (active == this) active = null;
    }

    /* ---- Events to the web layer (no-ops when the app isn't open) ---- */
    static void emit(String event, JSObject data) {
        ReveilleAlarmPlugin p = active;
        if (p != null) p.notifyListeners(event, data != null ? data : new JSObject(), true);
    }

    static void emitRingStarted(String alarmId, long at) {
        JSObject d = new JSObject();
        d.put("alarmId", alarmId);
        d.put("at", at);
        emit("ringStarted", d);
    }

    static void emitRingStopped(String reason) {
        JSObject d = new JSObject();
        d.put("reason", reason);
        emit("ringStopped", d);
    }

    /* ---- Info & state ---- */

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("edition", BuildConfig.EDITION);
        r.put("version", BuildConfig.VERSION_NAME);
        call.resolve(r);
    }

    /** Web → native: the full alarm list, snooze, and what's due to be read next. */
    @PluginMethod
    public void sync(PluginCall call) {
        AlarmStore store = new AlarmStore(getContext());
        JSArray alarms = call.getArray("alarms", new JSArray());
        store.saveAlarms(alarms);

        JSObject snooze = call.getObject("snooze");
        if (snooze != null && snooze.has("at")) {
            store.setSnooze(snooze.optLong("at"), snooze.optString("alarmId", null));
        } else if (!call.getData().has("snooze") || call.getData().isNull("snooze")) {
            store.clearSnooze();
        }

        Integer snoozeMinutes = call.getInt("snoozeMinutes");
        if (snoozeMinutes != null) {
            getContext().getSharedPreferences("reveille_alarms", Context.MODE_PRIVATE)
                    .edit().putInt("snoozeMinutes", snoozeMinutes).apply();
        }
        String upcomingKey = call.getString("upcomingAudioKey");
        if (upcomingKey != null) store.setUpcomingKey(upcomingKey);

        long next = AlarmScheduler.reschedule(getContext());
        JSObject r = new JSObject();
        r.put("nextAt", next);
        call.resolve(r);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        AlarmStore store = new AlarmStore(getContext());
        AlarmAudio audio = AlarmAudio.get(getContext());
        JSObject r = new JSObject();
        boolean ringing = store.ringing() && isServiceLikelyRunning();
        r.put("ringing", ringing);
        r.put("alarmId", store.ringAlarmId());
        r.put("at", store.ringAt());
        r.put("lastDismissedAt", store.lastDismissedAt());
        r.put("audioPlaying", audio.isPoemPlaying());
        r.put("audioElapsed", audio.poemElapsedSec());
        r.put("audioDuration", audio.poemDurationSec());
        if (store.hasAlarmList()) {
            try {
                r.put("alarms", new JSONArray(store.alarms().toString()));
            } catch (Exception ignored) { }
        }
        if (store.snoozeAt() > System.currentTimeMillis()) {
            JSObject s = new JSObject();
            s.put("at", store.snoozeAt());
            s.put("alarmId", store.snoozeAlarmId());
            r.put("snooze", s);
        } else {
            r.put("snooze", JSONObject.NULL);
        }
        call.resolve(r);
    }

    /** The ringing flag is persisted; if the process died mid-ring, don't report a phantom alarm. */
    private boolean isServiceLikelyRunning() {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
            if (sbn.getId() == AlarmService.NOTIFICATION_ID) return true;
        }
        new AlarmStore(getContext()).clearRinging();
        return false;
    }

    /* ---- Audio ---- */

    /** Save the pre-recorded poem so the alarm can play it without the web layer. */
    @PluginMethod
    public void cacheAudio(PluginCall call) {
        String key = call.getString("key");
        String base64 = call.getString("base64");
        if (key == null || base64 == null) { call.reject("key and base64 are required"); return; }
        AlarmStore store = new AlarmStore(getContext());
        File tmp = new File(getContext().getFilesDir(), "upcoming-poem.tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(Base64.decode(base64, Base64.DEFAULT));
        } catch (Exception e) {
            call.reject("Couldn't save audio", e);
            return;
        }
        if (!tmp.renameTo(store.audioFile())) { call.reject("Couldn't save audio"); return; }
        store.setCachedKey(key);
        call.resolve();
    }

    @PluginMethod
    public void playAudio(PluginCall call) {
        String base64 = call.getString("base64");
        int ramp = call.getInt("rampSeconds", 0);
        try {
            File f = new File(getContext().getCacheDir(), "play.wav");
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            float duration = AlarmAudio.get(getContext()).playFile(f, ramp);
            JSObject r = new JSObject();
            r.put("duration", duration);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Couldn't play audio", e);
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        AlarmAudio.get(getContext()).speak(call.getString("text", ""));
        call.resolve();
    }

    @PluginMethod
    public void stopAudio(PluginCall call) {
        AlarmAudio audio = AlarmAudio.get(getContext());
        if (new AlarmStore(getContext()).ringing()) audio.stopVoice(); else audio.stopAll();
        call.resolve();
    }

    @PluginMethod
    public void acknowledge(PluginCall call) {
        AlarmAudio.get(getContext()).acknowledge();
        call.resolve();
    }

    @PluginMethod
    public void armFailsafe(PluginCall call) {
        AlarmAudio.get(getContext()).armFailsafe(call.getInt("seconds", AlarmService.FAILSAFE_START_SECONDS));
        call.resolve();
    }

    /* ---- Ending a ring ---- */

    @PluginMethod
    public void dismiss(PluginCall call) {
        if (new AlarmStore(getContext()).ringing()) {
            sendToService(new Intent(getContext(), AlarmService.class).setAction(AlarmService.ACTION_DISMISS));
        } else {
            AlarmAudio.get(getContext()).stopAll(); // a test wake-up: nothing native to end
        }
        MainActivity.releaseLockScreen();
        call.resolve();
    }

    @PluginMethod
    public void snooze(PluginCall call) {
        int minutes = call.getInt("minutes", AlarmService.DEFAULT_SNOOZE_MINUTES);
        long at = System.currentTimeMillis() + minutes * 60_000L;
        AlarmStore store = new AlarmStore(getContext());
        if (store.ringing()) {
            sendToService(new Intent(getContext(), AlarmService.class)
                    .setAction(AlarmService.ACTION_SNOOZE).putExtra(AlarmService.EXTRA_MINUTES, minutes));
        } else {
            AlarmAudio.get(getContext()).stopAll();
        }
        JSObject r = new JSObject();
        r.put("at", at);
        call.resolve(r);
    }

    private void sendToService(Intent intent) {
        // The service is already in the foreground, so a plain startService is allowed.
        try {
            getContext().startService(intent);
        } catch (IllegalStateException e) {
            ContextCompat.startForegroundService(getContext(), intent);
        }
    }

    /* ---- Permissions ---- */

    @PluginMethod
    public void getPermissionStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied");

        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            fullScreen = ctx.getSystemService(NotificationManager.class).canUseFullScreenIntent();
        }
        r.put("fullScreen", fullScreen ? "granted" : "denied");

        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            exact = ctx.getSystemService(AlarmManager.class).canScheduleExactAlarms();
        }
        r.put("exactAlarm", exact ? "granted" : "denied");
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            getPermissionStatus(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        getPermissionStatus(call);
    }

    /** Open the exact Android settings page that fixes a permission. */
    @PluginMethod
    public void openSetting(PluginCall call) {
        String which = call.getString("which", "app");
        Context ctx = getContext();
        Uri pkg = Uri.parse("package:" + ctx.getPackageName());
        Intent intent;
        if ("fullScreen".equals(which) && Build.VERSION.SDK_INT >= 34) {
            intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg);
        } else if ("exactAlarm".equals(which) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg);
        } else if ("notifications".equals(which) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (Exception e) {
            ctx.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    @SuppressWarnings("unused")
    private static boolean hasPermission(Context ctx, String perm) {
        return ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED;
    }
}
