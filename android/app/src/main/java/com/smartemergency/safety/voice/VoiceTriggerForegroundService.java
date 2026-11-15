package com.smartemergency.safety.voice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.smartemergency.safety.MainActivity;
import com.smartemergency.safety.R;

/**
 * VoiceTriggerForegroundService
 * 
 * Runs as an Android Foreground Service with type FOREGROUND_SERVICE_TYPE_MICROPHONE
 * and a partial wake lock to keep CPU active for continuous acoustic analysis.
 *
 * Captures PCM audio via AudioRecord and evaluates wake-word acoustic signatures
 * (e.g. "Help me") using offline energy/pattern detection or embedded on-device
 * wake-word engine (Porcupine/Vosk).
 *
 * Upon detected trigger:
 * 1. Checks debounce threshold (prevent repeat rapid triggers).
 * 2. Emits an explicit broadcast intent: com.smartemergency.safety.ACTION_VOICE_SOS_TRIGGERED
 * 3. Launches MainActivity with emergency intent flags if screen is off/locked.
 */
public class VoiceTriggerForegroundService extends Service {
    private static final String TAG = "VoiceTriggerService";
    public static final String ACTION_START_SERVICE = "ACTION_START_VOICE_SERVICE";
    public static final String ACTION_STOP_SERVICE = "ACTION_STOP_VOICE_SERVICE";
    public static final String ACTION_SOS_DETECTED = "com.smartemergency.safety.ACTION_VOICE_SOS_TRIGGERED";
    
    private static final String CHANNEL_ID = "voice_sos_listener_channel";
    private static final int NOTIFICATION_ID = 9110;
    
    // Audio Configuration for Offline Keyword Spotting
    private static final int SAMPLE_RATE = 16000; // 16kHz standard for keyword spotters
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    
    private AudioRecord audioRecord;
    private Thread recordingThread;
    private boolean isListening = false;
    private PowerManager.WakeLock wakeLock;

    // False trigger guard & debounce tracking
    private long lastTriggerTimestamp = 0;
    private static final long COOLDOWN_PERIOD_MS = 15000; // 15-second debounce window

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        acquireWakeLock();
    }

    private void acquireWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SmartEmergency:VoiceWakeLock");
                wakeLock.acquire(10 * 60 * 1000L /* 10 minutes auto-release buffer */);
                Log.d(TAG, "Partial wake lock acquired for background voice analysis");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock: " + e.getMessage());
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
                Log.d(TAG, "Partial wake lock released");
            } catch (Exception e) {
                Log.e(TAG, "Error releasing wake lock: " + e.getMessage());
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Emergency Voice Guard Active",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Monitors microphone in background for the 'Help me' distress trigger");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildForegroundNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🛡️ Emergency Voice Guard Active")
                .setContentText("Listening for emergency phrase \"Help me\" (Hands-Free SOS)")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);

        return builder.build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP_SERVICE.equals(intent.getAction())) {
            stopListening();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Start Foreground Service with proper microphone service type on Android 14+ (API 34)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, buildForegroundNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, buildForegroundNotification());
        }

        startListening();

        // START_STICKY requests Android OS to restart service if killed due to transient memory pressure
        return START_STICKY;
    }

    private synchronized void startListening() {
        if (isListening) return;

        int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
        if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            bufferSize = SAMPLE_RATE * 2;
        }

        try {
            audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION, // Optimized for voice speech processing
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed");
                return;
            }

            audioRecord.startRecording();
            isListening = true;
            Log.i(TAG, "Microphone recording started in background");

            final int finalBufferSize = bufferSize;
            recordingThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    processAudioStream(finalBufferSize);
                }
            }, "VoiceSOSProcessingThread");
            recordingThread.setPriority(Thread.MAX_PRIORITY);
            recordingThread.start();

        } catch (SecurityException se) {
            Log.e(TAG, "RECORD_AUDIO permission not granted: " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error starting AudioRecord: " + e.getMessage());
        }
    }

    /**
     * Continuous audio buffer processor
     * Reads PCM frames, calculates Root-Mean-Square (RMS) and passes buffers
     * to the keyword spotter (Porcupine/Vosk engine or energy/frequency pattern).
     */
    private void processAudioStream(int bufferSize) {
        short[] audioBuffer = new short[bufferSize / 2];

        while (isListening) {
            int readCount = audioRecord.read(audioBuffer, 0, audioBuffer.length);
            if (readCount > 0) {
                // Analyze buffer for distress wake-word "Help me"
                boolean wakeWordDetected = analyzeAcousticFrame(audioBuffer, readCount);
                if (wakeWordDetected) {
                    handleWakeWordTrigger();
                }
            }
        }
    }

    /**
     * Acoustic frame evaluation.
     * Integrates wake-word keyword detector (e.g. Porcupine .ppn model for "help me"
     * or Vosk offline grammar: ["help me", "emergency"]).
     */
    private boolean analyzeAcousticFrame(short[] buffer, int length) {
        // Compute frame RMS energy
        double sum = 0;
        for (int i = 0; i < length; i++) {
            sum += buffer[i] * buffer[i];
        }
        double rms = Math.sqrt(sum / length);

        // Porcupine / Vosk integration hook:
        // int keywordIndex = porcupine.process(buffer);
        // return keywordIndex >= 0;

        // Acoustic threshold flag for testing / wake-word match validation
        return VoiceDetectionBridge.evaluateWakeWord(buffer, length, rms);
    }

    /**
     * Triggers SOS notification and dispatches broadcast intent
     */
    private synchronized void handleWakeWordTrigger() {
        long now = System.currentTimeMillis();
        if (now - lastTriggerTimestamp < COOLDOWN_PERIOD_MS) {
            Log.w(TAG, "Distress phrase detected but suppressed by anti-repeat debounce window.");
            return;
        }

        lastTriggerTimestamp = now;
        Log.i(TAG, "🚨 'HELP ME' WAKE-WORD CONFIRMED! DISPATCHING EMERGENCY SOS WORKFLOW!");

        // 1. Broadcast Intent to any running activity / Capacitor bridge
        Intent broadcastIntent = new Intent(ACTION_SOS_DETECTED);
        broadcastIntent.putExtra("timestamp", now);
        broadcastIntent.putExtra("source", "VOICE_TRIGGER_BACKGROUND");
        sendBroadcast(broadcastIntent);

        // 2. Launch / Wake up MainActivity with screen wakeup flags
        try {
            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.setAction(ACTION_SOS_DETECTED);
            launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_ACTIVITY_CLEAR_TOP |
                    Intent.FLAG_ACTIVITY_SINGLE_TOP |
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            launchIntent.putExtra("AUTO_EXECUTE_SOS", true);
            launchIntent.putExtra("EMERGENCY_CATEGORY", "Personal Safety");
            startActivity(launchIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch MainActivity on wake-word: " + e.getMessage());
        }

        // 3. Trigger Native Background Dispatcher directly (SMS & Location) in case UI is killed
        NativeEmergencyDispatcher.executeDirectSOS(getApplicationContext(), "Voice Trigger (\"Help me\")");
    }

    private synchronized void stopListening() {
        isListening = false;
        if (audioRecord != null) {
            try {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audioRecord: " + e.getMessage());
            }
            audioRecord = null;
        }
        if (recordingThread != null) {
            recordingThread.interrupt();
            recordingThread = null;
        }
        releaseWakeLock();
        Log.i(TAG, "Microphone recording stopped in background");
    }

    @Override
    public void onDestroy() {
        stopListening();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
