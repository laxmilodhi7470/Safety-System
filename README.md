# Smart Emergency Safety System

> **A Rapid-Assistance Web Application & Distress Response Prototype with Native Android Hands-Free Voice SOS Guard**  
> *Final-Year B.Tech Computer Science & Engineering Capstone Project*

---

## 📌 1. Project Overview

The **Smart Emergency Safety System** is a responsive, accessible, and privacy-conscious safety system engineered to help citizens request urgent assistance during high-stress crises. In life-threatening emergencies (medical cardiac events, road accidents, personal threats, or night-time stalking), individuals often cannot look at or tap their phone screen. 

This system provides both **guarded one-touch manual SOS** and **hands-free voice-activated background SOS ("Help me")** with precise GPS coordinates, automated native SMS dispatch payloads, and an acoustic alarm beacon.

---

## 🎙️ 2. Core Feature: Hands-Free Voice-Triggered SOS ("Help me")

### A. The Challenge with Background Voice on Modern Android
In modern Android (API 29+ / Android 10 through Android 14+), background access to the microphone is severely restricted for privacy:
1. **Background Mic Block:** An ordinary app minimized to the background has its microphone muted by the OS unless it holds an active **Foreground Service** with the explicit type `FOREGROUND_SERVICE_TYPE_MICROPHONE`.
2. **Screen-Off CPU Sleep:** When the display locks, Android enters deep Doze mode and disables CPU audio threads unless a **Partial Wake Lock** is acquired.
3. **Pure Web Browser Limitations:** Browsers (Chrome, Edge, Safari) terminate the Web Speech API and Web Audio processing as soon as the screen is locked or the tab is placed in the background.

### B. The Implemented Multi-Layer Solution
To fulfill the requirement reliably, the architecture employs a two-tier hybrid design:

#### Tier 1: Native Android Foreground Service (`android/` Package)
- **Service Class:** `VoiceTriggerForegroundService.java`
- **Foreground Type:** `ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE`
- **Wake Lock:** `PowerManager.PARTIAL_WAKE_LOCK` keeps the CPU active for continuous acoustic analysis while the screen is locked.
- **Audio Processing:** Uses low-latency 16kHz PCM `AudioRecord` connected to `VoiceDetectionBridge.java` (tuned for the cadence of "Help me" or on-device Porcupine/Vosk models).
- **Screen Wakeup:** `MainActivity.java` uses `setShowWhenLocked(true)`, `setTurnScreenOn(true)`, and `FLAG_KEEP_SCREEN_ON` to wake up the phone when the trigger phrase is detected.
- **Auto-Reboot:** `BootCompletedReceiver.java` restores the Voice Guard on device boot if the user opted in.
- **Capacitor Bridge:** `VoiceTriggerPlugin.java` connects the native background service to the web layer.

#### Tier 2: Ambient Web Engine & Screen Keep-Awake (Browser Fallback)
- **Web Speech API Continuous Loop:** Runs in the web app via `js/voice.js`, listening continuously for `"Help me"`.
- **Screen Wake Lock API:** `navigator.wakeLock.request('screen')` prevents the device screen from turning off while Voice Guard is active, providing hands-free voice monitoring during night travel or vehicle transit.
- **Live Diagnostics Terminal:** Real-time on-screen activity stream logging heard transcripts, RMS energy, and debounce status.

---

## 📂 3. Project Structure

```
Calculator/
├── index.html              # Main application UI, SOS hub, voice guard & settings
├── css/
│   └── styles.css          # Navy-blue & Red accent design system, toggles & diagnostic console
├── js/
│   ├── app.js              # Central orchestrator & module bootstrapping
│   ├── sos.js              # SOS workflow, GPS distress message builder, executeSOSDirectly & siren
│   ├── voice.js            # VoiceTriggerManager: speech recognition, wake lock & Android bridge
│   ├── contacts.js         # LocalStorage guardian CRUD, phone validation & native SMS links
│   └── location.js         # W3C Geolocation API wrapper, GPS accuracy rating & Maps integration
├── android/                # Native Android Studio project wrapper (Capacitor)
│   └── app/src/main/
│       ├── AndroidManifest.xml   # RECORD_AUDIO, FOREGROUND_SERVICE_MICROPHONE, WAKE_LOCK
│       └── java/com/smartemergency/safety/
│           ├── MainActivity.java
│           └── voice/
│               ├── VoiceTriggerForegroundService.java
│               ├── VoiceDetectionBridge.java
│               ├── NativeEmergencyDispatcher.java
│               ├── VoiceTriggerPlugin.java
│               └── BootCompletedReceiver.java
├── capacitor.config.json   # Native bridge configuration
├── package.json            # Node project configuration
└── README.md               # Complete architecture, limitations & presentation guide
```

---

## 🔒 4. Operating System Restrictions & Technical Realities

To maintain complete academic and engineering integrity in a viva or demonstration:

| Scenario | Behavior | Mitigation / User Setting |
| :--- | :--- | :--- |
| **App Minimized / Background** | **Fully functional** in Native Android via Foreground Service with permanent notification. | Foreground Service keeps audio pipeline active. |
| **Screen Locked / Screen Off** | **Fully functional** in Native Android with `PARTIAL_WAKE_LOCK`. | Screen wakes up via `FLAG_TURN_SCREEN_ON` when trigger is detected. |
| **App Force-Stopped** | **Blocked by Android OS**. Force-stopping revokes all background execution. | User must reopen the application after force-stop. |
| **Device Reboot** | **Fully restored** via `BootCompletedReceiver` if user had enabled Voice Guard. | Runs automatically on `BOOT_COMPLETED`. |
| **OEM Battery Optimization** | Aggressive task killers (Xiaomi MIUI, OnePlus OxygenOS, Samsung) may kill services after 30+ minutes. | User must set **Battery &rarr; Unrestricted** and enable **Autostart** in system settings. |
| **Microphone Privacy** | Android 12+ displays an orange/green indicator dot in the status bar. | Expected behavior; ensures user consent. |
| **Pure Web Browser Mode** | Background listening ceases when screen locks. | Use the built-in **Ambient Wake Lock** toggle to keep screen on while monitoring. |

---

## 🧪 5. Testing & Verification Guide

### Test 1: Voice Detection Verification (Separate Test)
1. Navigate to the **🎙️ Hands-Free Voice SOS Guard** section on the page.
2. Toggle **Enable Voice SOS Guard** ON.
3. Allow the browser/device microphone permission prompt.
4. Verify that the status badge turns to **"Listening for emergency phrase: 'help me'"** (Blue).
5. Clearly speak **"Help me"** into your microphone.
6. Observe the **Live Activity Log** console: it prints `[Heard: "help me"]` &rarr; `[DISTRESS PHRASE MATCHED!]`.
7. Verify that the **15-second anti-repeat cooldown** suppresses false rapid duplicate activations.

### Test 2: SOS Delivery & Notification Verification (Separate Test)
1. In the Voice Guard section, click **"🧪 Test Voice SOS Trigger ('Help me')"**.
2. Verify that:
   - The **Emergency Alert Card** opens immediately with the distress payload.
   - The **Acoustic Alarm Siren** (Web Audio sawtooth sweep) sounds.
   - The **Screen Strobe** visual flashing effect is active.
   - GPS coordinates are fetched and pinned to the Google Maps link.
   - The trusted emergency contacts list is updated with prefilled SMS dispatch buttons.
   - Clicking **"Open SMS with Prefilled Message"** deep-links to your device's native messaging client with coordinates attached.

---

## 🚀 6. How to Run Locally

### Option A: Using Python Local Server
```bash
python -m http.server 8000
```
Open **`http://localhost:8000`** in Google Chrome or Microsoft Edge.

### Option B: Building Native Android APK
1. Install Capacitor CLI & dependencies:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```
2. Sync the web assets:
   ```bash
   npx cap sync android
   ```
3. Open in Android Studio and build APK:
   ```bash
   npx cap open android
   ```
   Deploy to your physical Android device via USB debugging (`adb install app-debug.apk`).
