package com.smartemergency.safety.voice;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * BootCompletedReceiver
 * 
 * Re-launches the VoiceTriggerForegroundService when the device reboots,
 * provided the user explicitly enabled Voice SOS Guard in the settings.
 */
public class BootCompletedReceiver extends BroadcastReceiver {
    private static final String TAG = "BootCompletedReceiver";
    private static final String PREFS_NAME = "SmartEmergencyPrefs";
    private static final String KEY_VOICE_ENABLED = "voice_sos_guard_enabled";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device booted. Checking voice guard opt-in preference...");

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isVoiceEnabled = prefs.getBoolean(KEY_VOICE_ENABLED, false);

            if (isVoiceEnabled) {
                Log.i(TAG, "User had Voice Guard enabled. Launching VoiceTriggerForegroundService...");
                Intent serviceIntent = new Intent(context, VoiceTriggerForegroundService.class);
                serviceIntent.setAction(VoiceTriggerForegroundService.ACTION_START_SERVICE);

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent);
                    } else {
                        context.startService(serviceIntent);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to launch service on boot: " + e.getMessage());
                }
            }
        }
    }
}
