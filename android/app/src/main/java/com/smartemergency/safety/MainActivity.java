package com.smartemergency.safety;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.os.PowerManager;
import android.util.Log;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;
import com.smartemergency.safety.voice.VoiceTriggerForegroundService;
import com.smartemergency.safety.voice.VoiceTriggerPlugin;

/**
 * MainActivity
 * 
 * Bridges Capacitor Web layer with native hardware capabilities.
 * Handles screen wakeup and lockscreen dismissal flags when an emergency
 * voice SOS broadcast is received from VoiceTriggerForegroundService.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    private BroadcastReceiver sosReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (VoiceTriggerForegroundService.ACTION_SOS_DETECTED.equals(intent.getAction())) {
                Log.i(TAG, "Emergency SOS broadcast received from VoiceTriggerForegroundService!");
                turnScreenOnAndDismissKeyguard();
                notifyWebLayerSOS();
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom native plugin before super.onCreate()
        registerPlugin(VoiceTriggerPlugin.class);
        super.onCreate(savedInstanceState);

        // Turn on screen if launched from emergency background trigger
        handleEmergencyIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleEmergencyIntent(intent);
    }

    private void handleEmergencyIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("AUTO_EXECUTE_SOS", false)) {
            Log.i(TAG, "MainActivity brought to foreground via AUTO_EXECUTE_SOS");
            turnScreenOnAndDismissKeyguard();
            notifyWebLayerSOS();
        }
    }

    private void turnScreenOnAndDismissKeyguard() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                );
            }

            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "SmartEmergency:ScreenWakeOnSOS"
                );
                screenLock.acquire(10000); // 10 seconds wake
            }
        } catch (Exception e) {
            Log.e(TAG, "Error turning screen on: " + e.getMessage());
        }
    }

    private void notifyWebLayerSOS() {
        // Trigger JavaScript event inside WebView
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(new Runnable() {
                @Override
                public void run() {
                    getBridge().getWebView().evaluateJavascript(
                            "if (window.VoiceTriggerManager && window.VoiceTriggerManager.onNativeSOSDetected) { " +
                            "  window.VoiceTriggerManager.onNativeSOSDetected('VOICE_BACKGROUND_ANDROID'); " +
                            "}",
                            null
                    );
                }
            });
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        IntentFilter filter = new IntentFilter(VoiceTriggerForegroundService.ACTION_SOS_DETECTED);
        registerReceiver(sosReceiver, filter);
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(sosReceiver);
        } catch (Exception ignored) {}
    }
}
