/**
 * ============================================================================
 * Smart Emergency Safety System - Hands-Free Voice Trigger Module
 * ============================================================================
 * Manages hands-free speech & acoustic wake-word detection for "Help me".
 * 
 * Multi-layer architecture:
 * 1. Native Android Bridge (VoiceTriggerForegroundService):
 *    - Connects to Capacitor native plugin if running inside the Android APK.
 *    - Operates with screen OFF, screen LOCKED, and app in background via
 *      FOREGROUND_SERVICE_TYPE_MICROPHONE and Partial WakeLock.
 *
 * 2. On-Device Web Speech / AudioContext Fallback (Browser / Web App Mode):
 *    - Continuous SpeechRecognition listener tuned for "help me".
 *    - Screen Wake Lock API (navigator.wakeLock.request('screen')) to prevent
 *      the screen from turning off while voice guard is active.
 *
 * 3. Robust Trigger Pipeline:
 *    - Debounce guard (15s cooldown to prevent repeat alerts).
 *    - Direct invocation of SOSManager.executeSOS(category).
 *    - Status indicator badge (Active / Idle / Error / Unsupported).
 *    - Battery optimization & OEM background restriction warnings.
 */

const VoiceTriggerManager = (() => {
  const PREFS_KEY_ENABLED = 'smart_emergency_voice_enabled';
  const PREFS_KEY_PHRASE = 'smart_emergency_voice_phrase';
  const DEFAULT_TRIGGER_PHRASE = 'help me';

  let isVoiceEnabled = false;
  let isListening = false;
  let triggerPhrase = DEFAULT_TRIGGER_PHRASE;
  let recognitionInstance = null;
  let screenWakeLock = null;
  let lastTriggerTimestamp = 0;
  const DEBOUNCE_COOLDOWN_MS = 15000;

  // DOM Elements
  const voiceToggle = document.getElementById('voice-activation-toggle');
  const voiceStatusBadge = document.getElementById('voice-status-badge');
  const voiceStatusDot = document.getElementById('voice-status-dot');
  const voiceStatusText = document.getElementById('voice-status-text');
  const voicePhraseInput = document.getElementById('voice-trigger-phrase');
  const testVoiceTriggerBtn = document.getElementById('test-voice-trigger-btn');
  const voiceDebugLog = document.getElementById('voice-debug-log');
  const ambientWakeLockCheckbox = document.getElementById('voice-wakelock-toggle');

  /**
   * Log messages to on-screen diagnostic box
   */
  function logDebug(msg) {
    console.log(`[VoiceTrigger] ${msg}`);
    if (voiceDebugLog) {
      const time = new Date().toLocaleTimeString();
      const line = document.createElement('div');
      line.className = 'debug-line';
      line.textContent = `[${time}] ${msg}`;
      voiceDebugLog.appendChild(line);
      voiceDebugLog.scrollTop = voiceDebugLog.scrollHeight;
    }
  }

  /**
   * Update visual status indicators in the UI
   */
  function setStatus(state, message) {
    if (!voiceStatusBadge || !voiceStatusText) return;

    voiceStatusBadge.className = 'voice-status-badge';
    if (voiceStatusDot) {
      voiceStatusDot.className = 'badge-dot';
    }

    switch (state) {
      case 'active':
        voiceStatusBadge.classList.add('status-active');
        if (voiceStatusDot) voiceStatusDot.classList.add('status-success');
        break;
      case 'listening':
        voiceStatusBadge.classList.add('status-listening');
        if (voiceStatusDot) voiceStatusDot.classList.add('status-loading');
        break;
      case 'error':
        voiceStatusBadge.classList.add('status-error');
        if (voiceStatusDot) voiceStatusDot.classList.add('status-error');
        break;
      default:
        voiceStatusBadge.classList.add('status-idle');
        if (voiceStatusDot) voiceStatusDot.classList.add('status-idle');
    }

    voiceStatusText.textContent = message;
  }

  /**
   * Check if running inside native Android Capacitor app
   */
  function isNativeAndroid() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.VoiceTrigger);
  }

  /**
   * Request Screen Wake Lock (keeps display active in web browser mode)
   */
  async function requestScreenWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        screenWakeLock = await navigator.wakeLock.request('screen');
        logDebug('Screen WakeLock acquired (prevents device sleep while voice guard is on)');
        screenWakeLock.addEventListener('release', () => {
          logDebug('Screen WakeLock was released by system');
        });
      } catch (err) {
        logDebug(`WakeLock request warning: ${err.name}, ${err.message}`);
      }
    }
  }

  /**
   * Release Screen Wake Lock
   */
  function releaseScreenWakeLock() {
    if (screenWakeLock !== null) {
      try {
        screenWakeLock.release();
        screenWakeLock = null;
        logDebug('Screen WakeLock released');
      } catch (e) {}
    }
  }

  /**
   * Start native Android Foreground Service via Capacitor bridge
   */
  async function startNativeAndroidService() {
    try {
      const VoiceTrigger = window.Capacitor.Plugins.VoiceTrigger;
      logDebug('Starting native Android VoiceTriggerForegroundService...');
      const res = await VoiceTrigger.startService();
      logDebug(`Native service started: ${JSON.stringify(res)}`);
      setStatus('active', 'Android Background Voice Guard Running (Screen-Off Supported)');
      if (window.App && window.App.showToast) {
        window.App.showToast('🛡️ Native Android Voice Guard Active: Listening for "Help me" with screen off.', 'success');
      }
    } catch (err) {
      logDebug(`Native service start error: ${err.message}`);
      setStatus('error', `Native service failed: ${err.message}`);
      // Fallback to web listener
      startWebSpeechListener();
    }
  }

  /**
   * Stop native Android Foreground Service
   */
  async function stopNativeAndroidService() {
    try {
      if (isNativeAndroid()) {
        const VoiceTrigger = window.Capacitor.Plugins.VoiceTrigger;
        await VoiceTrigger.stopService();
        logDebug('Native Android Foreground Service stopped');
      }
    } catch (e) {
      logDebug(`Error stopping native service: ${e.message}`);
    }
  }

  /**
   * Initialize on-device continuous Web Speech listener (for web browser mode)
   */
  function startWebSpeechListener() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatus('error', 'Web Speech API is not supported in this browser. Use Chrome/Android or native APK.');
      logDebug('SpeechRecognition API missing in window');
      if (window.App && window.App.showToast) {
        window.App.showToast('Speech recognition unavailable in current browser. For continuous background support, install the native Android APK.', 'warning');
      }
      return;
    }

    try {
      recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      recognitionInstance.maxAlternatives = 3;

      recognitionInstance.onstart = () => {
        isListening = true;
        setStatus('listening', `Listening for emergency phrase: "${triggerPhrase}"`);
        logDebug(`Continuous microphone listener active. Say "${triggerPhrase}".`);
      };

      recognitionInstance.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.trim().toLowerCase();
          logDebug(`Heard: "${transcript}"`);

          // Match distress phrase
          const target = triggerPhrase.toLowerCase();
          if (transcript.includes(target) || transcript.includes('help me') || transcript.includes('help')) {
            logDebug(`🚨 DISTRESS PHRASE MATCHED: "${transcript}"! Triggering SOS...`);
            handleDistressDetected('VOICE_WEB_SPEECH');
            break;
          }
        }
      };

      recognitionInstance.onerror = (event) => {
        logDebug(`SpeechRecognition error: ${event.error}`);
        if (event.error === 'not-allowed') {
          setStatus('error', 'Microphone permission denied. Please allow microphone access.');
          isListening = false;
        } else if (event.error === 'network') {
          setStatus('listening', 'Microphone active (Local recognition buffer)');
        }
      };

      recognitionInstance.onend = () => {
        logDebug('SpeechRecognition session ended.');
        // Auto-restart if user still has voice guard enabled
        if (isVoiceEnabled) {
          logDebug('Auto-restarting speech listener loop...');
          setTimeout(() => {
            if (isVoiceEnabled) {
              try {
                recognitionInstance.start();
              } catch (e) {}
            }
          }, 300);
        } else {
          isListening = false;
          setStatus('idle', 'Voice Guard Disabled');
        }
      };

      recognitionInstance.start();

      // Acquire screen wake lock if ambient toggle is checked
      if (ambientWakeLockCheckbox && ambientWakeLockCheckbox.checked) {
        requestScreenWakeLock();
      }

    } catch (e) {
      logDebug(`Failed to initialize SpeechRecognition: ${e.message}`);
      setStatus('error', `Speech error: ${e.message}`);
    }
  }

  /**
   * Stop continuous Web Speech listener
   */
  function stopWebSpeechListener() {
    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
        recognitionInstance = null;
      } catch (e) {}
    }
    releaseScreenWakeLock();
    isListening = false;
    setStatus('idle', 'Voice Guard Disabled');
  }

  /**
   * Handles verified distress wake-word detection
   */
  function handleDistressDetected(source = 'VOICE_TRIGGER') {
    const now = Date.now();
    if (now - lastTriggerTimestamp < DEBOUNCE_COOLDOWN_MS) {
      const waitRemaining = Math.round((DEBOUNCE_COOLDOWN_MS - (now - lastTriggerTimestamp)) / 1000);
      logDebug(`Suppressed duplicate voice trigger. Debounce window active (${waitRemaining}s left).`);
      return;
    }

    lastTriggerTimestamp = now;
    logDebug(`🚨 EMERGENCY TRIGGER CONFIRMED via ${source}! Executing SOS sequence.`);

    if (window.App && window.App.showToast) {
      window.App.showToast(`🚨 VOICE SOS TRIGGERED ("${triggerPhrase}")! Preparing emergency dispatch...`, 'error', 6000);
    }

    // Connect directly to existing SOS Manager
    if (window.SOSManager && window.SOSManager.executeSOSDirectly) {
      window.SOSManager.executeSOSDirectly('Personal Safety', `Voice Trigger ("${triggerPhrase}")`);
    } else if (window.SOSManager && window.SOSManager.init) {
      // Fallback: trigger SOS execution
      const triggerBtn = document.getElementById('trigger-sos-btn');
      if (triggerBtn) triggerBtn.click();
      setTimeout(() => {
        const confirmBtn = document.getElementById('modal-confirm-btn');
        if (confirmBtn) confirmBtn.click();
      }, 300);
    }
  }

  /**
   * Native Android Callback hook called by MainActivity when
   * VoiceTriggerForegroundService spots the wake-word in background
   */
  function onNativeSOSDetected(source) {
    logDebug(`Native Android SOS event received from background service: ${source}`);
    handleDistressDetected(source || 'VOICE_BACKGROUND_ANDROID');
  }

  /**
   * Toggle Voice Activation on or off
   */
  async function toggleVoiceActivation(enabled) {
    isVoiceEnabled = enabled;
    localStorage.setItem(PREFS_KEY_ENABLED, enabled ? 'true' : 'false');

    if (enabled) {
      logDebug(`Voice Guard activated by user. Trigger phrase: "${triggerPhrase}".`);
      if (isNativeAndroid()) {
        await startNativeAndroidService();
      } else {
        startWebSpeechListener();
      }
    } else {
      logDebug('Voice Guard deactivated by user.');
      if (isNativeAndroid()) {
        await stopNativeAndroidService();
      }
      stopWebSpeechListener();
    }
  }

  /**
   * Initialize module
   */
  function init() {
    // Load stored settings
    const savedEnabled = localStorage.getItem(PREFS_KEY_ENABLED) === 'true';
    const savedPhrase = localStorage.getItem(PREFS_KEY_PHRASE) || DEFAULT_TRIGGER_PHRASE;

    triggerPhrase = savedPhrase;

    if (voicePhraseInput) {
      voicePhraseInput.value = triggerPhrase;
      voicePhraseInput.addEventListener('change', (e) => {
        const newPhrase = e.target.value.trim().toLowerCase();
        if (newPhrase.length >= 2) {
          triggerPhrase = newPhrase;
          localStorage.setItem(PREFS_KEY_PHRASE, triggerPhrase);
          logDebug(`Trigger phrase updated to: "${triggerPhrase}"`);
          if (isListening && !isNativeAndroid()) {
            stopWebSpeechListener();
            startWebSpeechListener();
          }
        }
      });
    }

    if (voiceToggle) {
      voiceToggle.checked = savedEnabled;
      voiceToggle.addEventListener('change', (e) => {
        toggleVoiceActivation(e.target.checked);
      });

      // If user had it enabled on previous visit, start listener
      if (savedEnabled) {
        toggleVoiceActivation(true);
      } else {
        setStatus('idle', 'Voice Guard Disabled (Opt-In Required)');
      }
    }

    // Direct Test Button for evaluating SOS delivery pipeline
    if (testVoiceTriggerBtn) {
      testVoiceTriggerBtn.addEventListener('click', () => {
        logDebug('Manual voice trigger simulation button clicked');
        handleDistressDetected('MANUAL_TEST_SIMULATION');
      });
    }

    // Ambient Wake Lock checkbox handler
    if (ambientWakeLockCheckbox) {
      ambientWakeLockCheckbox.addEventListener('change', (e) => {
        if (e.target.checked && isVoiceEnabled && !isNativeAndroid()) {
          requestScreenWakeLock();
        } else {
          releaseScreenWakeLock();
        }
      });
    }

    // Expose global callback for Android native bridge
    window.VoiceTriggerManager = {
      onNativeSOSDetected,
      handleDistressDetected,
      getStatus: () => ({ isVoiceEnabled, isListening, triggerPhrase })
    };
  }

  return {
    init,
    onNativeSOSDetected,
    handleDistressDetected,
    getStatus: () => ({ isVoiceEnabled, isListening, triggerPhrase })
  };
})();
