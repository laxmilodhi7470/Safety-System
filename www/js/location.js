/**
 * ============================================================================
 * Smart Emergency Safety System - Geolocation Management Module
 * ============================================================================
 * Handles browser Geolocation API calls, permission states, coordinate caching,
 * error handling (Permission Denied, Timeout, Unavailable), and Google Maps integration.
 * Adheres strictly to Zero-Continuous-Tracking privacy requirements.
 */

const LocationManager = (() => {
  // Current session location cache (Memory only, never background tracked)
  let currentLocation = null;
  let isFetching = false;

  // DOM Elements
  const statusBadge = document.getElementById('location-status-badge');
  const statusText = document.getElementById('location-status-text');
  const metricLat = document.getElementById('metric-lat');
  const metricLng = document.getElementById('metric-lng');
  const metricAcc = document.getElementById('metric-acc');
  const metricTime = document.getElementById('metric-time');
  const feedbackAlert = document.getElementById('location-feedback-alert');
  const getLocBtn = document.getElementById('get-location-btn');
  const getLocBtnText = document.getElementById('get-loc-btn-text');
  const retryBtn = document.getElementById('retry-location-btn');
  const viewMapsBtn = document.getElementById('view-maps-btn');
  const mapPlaceholder = document.getElementById('map-placeholder');
  const mapIframe = document.getElementById('map-iframe');
  const mapFooterCoords = document.getElementById('map-footer-coords');
  const mapReadablePin = document.getElementById('map-readable-pin');
  const mapDirectExtLink = document.getElementById('map-direct-ext-link');

  /**
   * Updates visual status badge in the UI
   */
  function setStatus(state, text) {
    if (!statusBadge || !statusText) return;
    statusBadge.className = 'location-status-badge';
    const dot = statusBadge.querySelector('.badge-dot') || document.createElement('span');
    dot.className = 'badge-dot';

    switch (state) {
      case 'loading':
        dot.classList.add('status-loading');
        break;
      case 'success':
        dot.classList.add('status-success');
        break;
      case 'error':
        dot.classList.add('status-error');
        break;
      default:
        dot.classList.add('status-idle');
    }
    statusText.textContent = text;
  }

  /**
   * Displays localized alert notification within the location card
   */
  function showFeedback(type, message) {
    if (!feedbackAlert) return;
    feedbackAlert.style.display = 'block';
    feedbackAlert.className = `feedback-alert ${type === 'error' ? 'alert-error' : 'alert-success'}`;
    feedbackAlert.textContent = message;
  }

  /**
   * Clears localized alert feedback
   */
  function clearFeedback() {
    if (!feedbackAlert) return;
    feedbackAlert.style.display = 'none';
    feedbackAlert.textContent = '';
  }

  /**
   * Builds public Google Maps web link
   */
  function getGoogleMapsUrl(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  /**
   * Formats accuracy in human-readable terms
   */
  function formatAccuracy(meters) {
    if (meters < 15) return `±${Math.round(meters)}m (High Accuracy GPS)`;
    if (meters < 50) return `±${Math.round(meters)}m (Good Cellular/WiFi)`;
    return `±${Math.round(meters)}m (Approximate Area)`;
  }

  /**
   * Updates Location Card UI with acquired coordinates
   */
  function updateUI(pos) {
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    const acc = pos.coords.accuracy;
    const time = new Date(pos.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (metricLat) metricLat.textContent = lat;
    if (metricLng) metricLng.textContent = lng;
    if (metricAcc) metricAcc.textContent = formatAccuracy(acc);
    if (metricTime) metricTime.textContent = time;

    const mapsUrl = getGoogleMapsUrl(lat, lng);

    if (viewMapsBtn) {
      viewMapsBtn.href = mapsUrl;
      viewMapsBtn.style.display = 'inline-flex';
    }

    if (retryBtn) {
      retryBtn.style.display = 'inline-flex';
    }

    // Embed interactive Google Maps frame
    if (mapIframe && mapPlaceholder) {
      const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
      mapIframe.src = embedUrl;
      mapIframe.style.display = 'block';
      mapPlaceholder.style.display = 'none';
    }

    if (mapFooterCoords && mapReadablePin && mapDirectExtLink) {
      mapFooterCoords.style.display = 'flex';
      mapReadablePin.textContent = `📍 Lat: ${lat}, Lng: ${lng} (${formatAccuracy(acc)})`;
      mapDirectExtLink.href = mapsUrl;
    }

    setStatus('success', 'GPS Location Acquired');
    showFeedback('success', `Location successfully locked at ${lat}, ${lng} with ${formatAccuracy(acc)}.`);
  }

  /**
   * Handles Geolocation errors with actionable guidance
   */
  function handleError(error) {
    let friendlyMsg = '';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        friendlyMsg = 'Permission denied: Please allow location access in your browser settings to share your emergency coordinates.';
        break;
      case error.POSITION_UNAVAILABLE:
        friendlyMsg = 'Position unavailable: Satellite/Network location information is currently unreachable. Check your device GPS settings.';
        break;
      case error.TIMEOUT:
        friendlyMsg = 'Location request timed out: We could not obtain high-accuracy GPS fix within 12 seconds. Tap "Retry" to try again.';
        break;
      default:
        friendlyMsg = `Unknown location error: ${error.message || 'Please check your connection and retry.'}`;
    }

    setStatus('error', 'Location Request Failed');
    showFeedback('error', friendlyMsg);
    if (retryBtn) retryBtn.style.display = 'inline-flex';
    if (window.App && window.App.showToast) {
      window.App.showToast(friendlyMsg, 'error');
    }
  }

  /**
   * Requests coordinates from the browser Geolocation API
   * @param {Function} callback Optional callback returning { success, data, error }
   */
  function fetchCurrentPosition(callback) {
    if (!('geolocation' in navigator)) {
      const unsupported = 'Geolocation is not supported by your current web browser.';
      setStatus('error', 'Unsupported Browser');
      showFeedback('error', unsupported);
      if (callback) callback({ success: false, error: unsupported });
      return;
    }

    clearFeedback();
    isFetching = true;
    setStatus('loading', 'Querying GPS Satellite / WiFi Fix...');
    if (getLocBtnText) getLocBtnText.textContent = 'Acquiring GPS...';
    if (getLocBtn) getLocBtn.disabled = true;

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0 // Always fetch fresh position, no stale cache
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        isFetching = false;
        currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
          mapsUrl: getGoogleMapsUrl(position.coords.latitude, position.coords.longitude)
        };

        if (getLocBtnText) getLocBtnText.textContent = 'Update My Location';
        if (getLocBtn) getLocBtn.disabled = false;

        updateUI(position);

        if (callback) {
          callback({ success: true, data: currentLocation });
        }
      },
      (error) => {
        isFetching = false;
        if (getLocBtnText) getLocBtnText.textContent = 'Acquire My Location';
        if (getLocBtn) getLocBtn.disabled = false;
        handleError(error);

        if (callback) {
          callback({ success: false, error: error });
        }
      },
      options
    );
  }

  /**
   * Initialize DOM event listeners
   */
  function init() {
    if (getLocBtn) {
      getLocBtn.addEventListener('click', () => {
        fetchCurrentPosition();
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        fetchCurrentPosition();
      });
    }
  }

  return {
    init,
    fetchCurrentPosition,
    getCurrentLocation: () => currentLocation,
    getGoogleMapsUrl
  };
})();
