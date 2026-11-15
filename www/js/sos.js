/**
 * ============================================================================
 * Smart Emergency Safety System - SOS Emergency Dispatch Module
 * ============================================================================
 * Handles the SOS activation workflow:
 * 1. Accidental activation guard via confirmation modal.
 * 2. Emergency category selection (Medical, Accident, Personal Safety, Other).
 * 3. On-demand Geolocation capture via LocationManager.
 * 4. Formats standardized distress message with coordinates and Google Maps URL.
 * 5. Web Audio API siren beacon & visual screen strobe generator.
 * 6. Native SMS prefill broadcast link creation for registered contacts.
 * 7. Transparent status indicators (Local Prototype Action vs Production dispatch).
 */

const SOSManager = (() => {
  // Current alert state
  let selectedCategory = 'Medical';
  let activeAlert = null;
  let audioContext = null;
  let sirenOscillator = null;
  let sirenGain = null;
  let isSirenPlaying = false;

  // DOM Elements - Hero SOS
  const triggerSosBtn = document.getElementById('trigger-sos-btn');
  const heroCategoryPills = document.querySelectorAll('.category-pills .pill-btn');

  // DOM Elements - Confirmation Modal
  const sosModal = document.getElementById('sos-modal');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalCancelX = document.getElementById('modal-cancel-x');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  const modalTypeBtns = document.querySelectorAll('#modal-type-grid .modal-type-btn');

  // DOM Elements - Active Alert Banner Card
  const activeAlertBox = document.getElementById('active-alert-box');
  const alertDisplayTime = document.getElementById('alert-display-time');
  const alertDisplayType = document.getElementById('alert-display-type');
  const alertDisplayCoords = document.getElementById('alert-display-coords');
  const alertDisplayAccuracy = document.getElementById('alert-display-accuracy');
  const preparedTextarea = document.getElementById('prepared-message-content');
  const copyAlertMsgBtn = document.getElementById('copy-alert-msg-btn');
  const broadcastContactsBtn = document.getElementById('broadcast-contacts-btn');
  const alertMapLink = document.getElementById('alert-map-link');
  const soundBeaconBtn = document.getElementById('sound-beacon-btn');
  const soundBtnText = document.getElementById('sound-btn-text');

  /**
   * Generates formatted distress message text
   */
  function buildDistressMessage(category, location) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString();

    let locDetails = 'Location acquisition pending';
    let mapsLink = 'https://maps.google.com';

    if (location && location.lat && location.lng) {
      const lat = location.lat.toFixed(5);
      const lng = location.lng.toFixed(5);
      const acc = Math.round(location.accuracy || 20);
      locDetails = `Lat: ${lat}, Lng: ${lng} (Accuracy: ±${acc}m)`;
      mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
    }

    return `🚨 EMERGENCY ALERT: ${category.toUpperCase()}!
I need urgent assistance.
📍 Location: ${locDetails}
🗺️ Map: ${mapsLink}
⏰ Timestamp: ${dateStr} ${timeStr}
(Sent via Smart Emergency Safety System)`;
  }

  /**
   * Retrieves the current prepared distress text or a default message
   */
  function getCurrentDistressMessage() {
    if (activeAlert && activeAlert.message) {
      return activeAlert.message;
    }
    const currentLoc = window.LocationManager ? window.LocationManager.getCurrentLocation() : null;
    return buildDistressMessage(selectedCategory, currentLoc);
  }

  /**
   * Open the SOS Confirmation Dialog
   */
  function openConfirmationModal() {
    if (!sosModal) return;
    sosModal.hidden = false;
    // Set active modal category button
    modalTypeBtns.forEach(btn => {
      const matches = btn.getAttribute('data-type') === selectedCategory;
      btn.classList.toggle('active', matches);
    });
    modalConfirmBtn.focus();
  }

  /**
   * Close the SOS Confirmation Dialog
   */
  function closeConfirmationModal() {
    if (!sosModal) return;
    sosModal.hidden = true;
  }

  /**
   * Executes confirmed SOS emergency alert sequence
   */
  function executeSOS() {
    closeConfirmationModal();

    const timestamp = new Date();
    activeAlert = {
      category: selectedCategory,
      timestamp: timestamp,
      location: null,
      message: ''
    };

    // Show active alert banner
    if (activeAlertBox) {
      activeAlertBox.style.display = 'block';
      activeAlertBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (alertDisplayTime) {
      alertDisplayTime.textContent = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (alertDisplayType) {
      alertDisplayType.textContent = selectedCategory;
    }
    if (alertDisplayCoords) {
      alertDisplayCoords.textContent = 'Acquiring GPS coordinates...';
    }
    if (alertDisplayAccuracy) {
      alertDisplayAccuracy.textContent = 'Contacting device geolocation...';
    }

    // Set preliminary message
    activeAlert.message = buildDistressMessage(selectedCategory, null);
    if (preparedTextarea) {
      preparedTextarea.value = activeAlert.message;
    }

    if (window.App && window.App.showToast) {
      window.App.showToast(`🚨 ${selectedCategory} Alert Prepared locally. Fetching GPS...`, 'warning');
    }

    // Request GPS location immediately
    if (window.LocationManager && window.LocationManager.fetchCurrentPosition) {
      window.LocationManager.fetchCurrentPosition((res) => {
        if (res.success && res.data) {
          activeAlert.location = res.data;
          const lat = res.data.lat.toFixed(6);
          const lng = res.data.lng.toFixed(6);
          const acc = Math.round(res.data.accuracy);

          if (alertDisplayCoords) {
            alertDisplayCoords.textContent = `${lat}, ${lng}`;
          }
          if (alertDisplayAccuracy) {
            alertDisplayAccuracy.textContent = `High Fix (±${acc} meters)`;
          }
          if (alertMapLink) {
            alertMapLink.href = res.data.mapsUrl;
          }

          // Rebuild final distress message with verified GPS
          activeAlert.message = buildDistressMessage(selectedCategory, res.data);
          if (preparedTextarea) {
            preparedTextarea.value = activeAlert.message;
          }

          // Refresh Contacts module SMS links with the new GPS-enriched message
          if (window.ContactsManager && window.ContactsManager.refreshDisplay) {
            window.ContactsManager.refreshDisplay();
          }

          if (window.App && window.App.showToast) {
            window.App.showToast('GPS coordinates locked and attached to distress message!', 'success');
          }
        } else {
          if (alertDisplayCoords) {
            alertDisplayCoords.textContent = 'Location unavailable (Permission denied or timeout)';
          }
          if (alertDisplayAccuracy) {
            alertDisplayAccuracy.textContent = 'Manual address required in SMS';
          }
        }
      });
    }

    // Refresh contact SMS links
    if (window.ContactsManager && window.ContactsManager.refreshDisplay) {
      window.ContactsManager.refreshDisplay();
    }
  }

  /**
   * Copies distress message text to clipboard
   */
  function copyMessageToClipboard() {
    if (!preparedTextarea) return;
    const text = preparedTextarea.value;
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (window.App && window.App.showToast) {
          window.App.showToast('Distress text copied to clipboard!', 'success');
        }
      }).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  }

  function fallbackCopyText(text) {
    preparedTextarea.select();
    document.execCommand('copy');
    if (window.App && window.App.showToast) {
      window.App.showToast('Distress text copied to clipboard!', 'success');
    }
  }

  /**
   * Broadcasts prefilled SMS to all emergency contacts
   */
  function broadcastSmsToContacts() {
    const contacts = window.ContactsManager ? window.ContactsManager.getContacts() : [];
    if (!contacts || contacts.length === 0) {
      if (window.App && window.App.showToast) {
        window.App.showToast('Please add at least one trusted contact in the section below first.', 'error');
      }
      const contactsSec = document.getElementById('contacts-section');
      if (contactsSec) contactsSec.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Open first contact's SMS directly, and notify user that others can be triggered from list
    const firstContact = contacts[0];
    const msg = getCurrentDistressMessage();
    const uri = window.ContactsManager.buildSmsUri(firstContact.phone, msg);

    // Open default SMS application
    window.location.href = uri;

    if (window.App && window.App.showToast) {
      window.App.showToast(
        `Opened SMS app for ${firstContact.name}. Tap individual guardian buttons below to message additional contacts.`, 
        'success'
      );
    }
  }

  /**
   * Web Audio API Siren Beacon Synthesizer
   * Creates an audible oscillating emergency alarm beacon without external audio file dependencies.
   */
  function toggleSirenAlarm() {
    if (isSirenPlaying) {
      stopSirenAlarm();
    } else {
      startSirenAlarm();
    }
  }

  function startSirenAlarm() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        alert('Web Audio API is not supported on this browser.');
        return;
      }

      if (!audioContext) {
        audioContext = new AudioCtx();
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      sirenOscillator = audioContext.createOscillator();
      sirenGain = audioContext.createGain();

      sirenOscillator.type = 'sawtooth';
      sirenOscillator.frequency.setValueAtTime(600, audioContext.currentTime);

      // Sweep frequency back and forth between 600Hz and 1200Hz
      const now = audioContext.currentTime;
      for (let i = 0; i < 40; i++) {
        sirenOscillator.frequency.linearRampToValueAtTime(1100, now + (i * 0.8) + 0.4);
        sirenOscillator.frequency.linearRampToValueAtTime(600, now + (i * 0.8) + 0.8);
      }

      sirenGain.gain.setValueAtTime(0.3, audioContext.currentTime);

      sirenOscillator.connect(sirenGain);
      sirenGain.connect(audioContext.destination);

      sirenOscillator.start();
      isSirenPlaying = true;

      // Visual screen strobe effect
      document.body.classList.add('siren-active');
      if (soundBtnText) soundBtnText.textContent = 'Stop Alarm Siren';
      if (soundBeaconBtn) soundBeaconBtn.className = 'btn btn-danger';

      if (window.App && window.App.showToast) {
        window.App.showToast('🚨 Acoustic alarm siren activated! Visual strobe active.', 'warning');
      }
    } catch (e) {
      console.error('Audio synthesizer error:', e);
    }
  }

  function stopSirenAlarm() {
    if (sirenOscillator) {
      try {
        sirenOscillator.stop();
        sirenOscillator.disconnect();
      } catch (e) {}
      sirenOscillator = null;
    }
    isSirenPlaying = false;
    document.body.classList.remove('siren-active');
    if (soundBtnText) soundBtnText.textContent = 'Sound Alarm Siren';
    if (soundBeaconBtn) soundBeaconBtn.className = 'btn btn-warning';

    if (window.App && window.App.showToast) {
      window.App.showToast('Alarm siren stopped.', 'info');
    }
  }

  /**
   * Initializes event listeners
   */
  function init() {
    // Hero SOS button click
    if (triggerSosBtn) {
      triggerSosBtn.addEventListener('click', openConfirmationModal);
    }

    // Hero category pills
    heroCategoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        heroCategoryPills.forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-checked', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-checked', 'true');
        selectedCategory = pill.getAttribute('data-type');
      });
    });

    // Modal category pills
    modalTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modalTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCategory = btn.getAttribute('data-type');

        // Sync hero pills
        heroCategoryPills.forEach(p => {
          const match = p.getAttribute('data-type') === selectedCategory;
          p.classList.toggle('active', match);
          p.setAttribute('aria-checked', match ? 'true' : 'false');
        });
      });
    });

    // Modal buttons
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeConfirmationModal);
    if (modalCancelX) modalCancelX.addEventListener('click', closeConfirmationModal);
    if (modalConfirmBtn) modalConfirmBtn.addEventListener('click', executeSOS);

    // Click outside modal card to close
    if (sosModal) {
      sosModal.addEventListener('click', (e) => {
        if (e.target === sosModal) closeConfirmationModal();
      });
    }

    // Alert banner actions
    if (copyAlertMsgBtn) copyAlertMsgBtn.addEventListener('click', copyMessageToClipboard);
    if (broadcastContactsBtn) broadcastContactsBtn.addEventListener('click', broadcastSmsToContacts);
    if (soundBeaconBtn) soundBeaconBtn.addEventListener('click', toggleSirenAlarm);
  }

  /**
   * Directly executes SOS workflow programmatically (e.g., from hands-free voice trigger)
   * bypassing the manual click confirmation modal while activating Siren and GPS acquisition.
   */
  function executeSOSDirectly(category = 'Personal Safety', triggerSource = 'Hands-Free Voice Trigger') {
    selectedCategory = category;
    closeConfirmationModal();

    const timestamp = new Date();
    activeAlert = {
      category: selectedCategory,
      timestamp: timestamp,
      location: null,
      message: '',
      triggerSource: triggerSource
    };

    // Show active alert banner
    if (activeAlertBox) {
      activeAlertBox.style.display = 'block';
      activeAlertBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (alertDisplayTime) {
      alertDisplayTime.textContent = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (alertDisplayType) {
      alertDisplayType.textContent = `${selectedCategory} (${triggerSource})`;
    }
    if (alertDisplayCoords) {
      alertDisplayCoords.textContent = 'Acquiring GPS coordinates...';
    }
    if (alertDisplayAccuracy) {
      alertDisplayAccuracy.textContent = 'Contacting device geolocation...';
    }

    // Set initial distress payload
    activeAlert.message = buildDistressMessage(selectedCategory, null);
    if (preparedTextarea) {
      preparedTextarea.value = activeAlert.message;
    }

    // Automatically start emergency acoustic alarm siren
    if (!isSirenPlaying) {
      startSirenAlarm();
    }

    // Query GPS location immediately
    if (window.LocationManager && window.LocationManager.fetchCurrentPosition) {
      window.LocationManager.fetchCurrentPosition((res) => {
        if (res.success && res.data) {
          activeAlert.location = res.data;
          const lat = res.data.lat.toFixed(6);
          const lng = res.data.lng.toFixed(6);
          const acc = Math.round(res.data.accuracy);

          if (alertDisplayCoords) {
            alertDisplayCoords.textContent = `${lat}, ${lng}`;
          }
          if (alertDisplayAccuracy) {
            alertDisplayAccuracy.textContent = `High Fix (±${acc} meters)`;
          }
          if (alertMapLink) {
            alertMapLink.href = res.data.mapsUrl;
          }

          activeAlert.message = buildDistressMessage(selectedCategory, res.data);
          if (preparedTextarea) {
            preparedTextarea.value = activeAlert.message;
          }

          if (window.ContactsManager && window.ContactsManager.refreshDisplay) {
            window.ContactsManager.refreshDisplay();
          }

          if (window.App && window.App.showToast) {
            window.App.showToast(`🚨 SOS Triggered by Voice! Location attached. Ready for SMS broadcast.`, 'error', 6000);
          }
        }
      });
    }

    if (window.ContactsManager && window.ContactsManager.refreshDisplay) {
      window.ContactsManager.refreshDisplay();
    }
  }

  return {
    init,
    executeSOS,
    executeSOSDirectly,
    getCurrentDistressMessage,
    getActiveAlert: () => activeAlert
  };
})();
