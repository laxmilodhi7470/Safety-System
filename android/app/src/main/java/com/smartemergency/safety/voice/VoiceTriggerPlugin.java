package com.smartemergency.safety.voice;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import android.Manifest;

/**
 * VoiceTriggerPlugin
 * 
 * Capacitor Plugin Bridge providing JavaScript access to the native
 * VoiceTriggerForegroundService.
 *
 * Exposes methods:
 * - isSupported() -> { supported: boolean, platform: 'android' }
 * - startService() -> requests audio/notification permissions & starts Foreground Service
 * - stopService() -> stops Foreground Service and releases audio pipeline
 * - getStatus() -> { isRunning: boolean, wakeWord: 'Help me' }
 */
@CapacitorPlugin(
    name = "VoiceTrigger",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        ),
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class VoiceTriggerPlugin extends Plugin {
    private static boolean isServiceRunning = false;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("platform", "android");
        ret.put("wakeWord", "Help me");
        call.resolve(ret);
    }

    @PluginMethod
    public void startService(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Context unavailable");
            return;
        }

        try {
            Intent serviceIntent = new Intent(context, VoiceTriggerForegroundService.class);
            serviceIntent.setAction(VoiceTriggerForegroundService.ACTION_START_SERVICE);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            isServiceRunning = true;
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Emergency Voice Guard Foreground Service started successfully");
            ret.put("wakeWord", "Help me");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to launch VoiceTriggerForegroundService: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Context unavailable");
            return;
        }

        try {
            Intent serviceIntent = new Intent(context, VoiceTriggerForegroundService.class);
            serviceIntent.setAction(VoiceTriggerForegroundService.ACTION_STOP_SERVICE);
            context.stopService(serviceIntent);

            isServiceRunning = false;
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Emergency Voice Guard Service stopped");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to stop VoiceTriggerForegroundService: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isRunning", isServiceRunning);
        ret.put("wakeWord", "Help me");
        ret.put("sampleRate", 16000);
        call.resolve(ret);
    }
}
