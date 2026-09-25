package com.vincentkovar.reveille;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {
    static final String EXTRA_RINGING = "ringing";
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReveilleAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        applyRinging(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyRinging(intent);
    }

    /** Only while an alarm rings: show over the lock screen and turn the screen on. */
    private void applyRinging(Intent intent) {
        boolean ringing = intent != null && intent.getBooleanExtra(EXTRA_RINGING, false)
                && new AlarmStore(this).ringing();
        setLockScreenMode(ringing);
    }

    private void setLockScreenMode(boolean on) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(on);
            setTurnScreenOn(on);
        } else {
            int flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (on) getWindow().addFlags(flags); else getWindow().clearFlags(flags);
        }
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /** Called when a ring ends, so the app stops appearing over the lock screen. */
    static void releaseLockScreen() {
        MainActivity a = current.get();
        if (a != null) a.runOnUiThread(() -> a.setLockScreenMode(false));
    }
}
