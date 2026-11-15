/**
 * ============================================================================
 * Smart Emergency Safety System - Main Application Orchestrator
 * ============================================================================
 * Handles global application UI:
 * - Module bootstrapping (LocationManager, ContactsManager, SOSManager)
 * - Accessible tab switching for First Aid Protocols
 * - Mobile responsive navigation menu toggle
 * - Scrollspy navigation highlight
 * - Dismissible academic prototype banner
 * - Centralized Toast notification service
 */

const App = (() => {
  const toastContainer = document.getElementById('toast-container');
  const navToggle = document.getElementById('nav-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const dismissBannerBtn = document.getElementById('dismiss-banner');
  const prototypeBanner = document.querySelector('.prototype-banner');
  const navLinks = document.querySelectorAll('.nav-link');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
  const protocolTabs = document.querySelectorAll('.protocol-tabs .tab-btn');
  const protocolPanels = document.querySelectorAll('.protocol-panel');

  /**
   * Display accessible Toast Notification
   * @param {string} message - Text notification
   * @param {'info'|'success'|'warning'|'error'} type - Style level
   * @param {number} duration - Milliseconds before auto-dismiss
   */
  function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '🛑';

    toast.innerHTML = `
      <span aria-hidden="true">${icon}</span>
      <span class="toast-text">${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Announce to screen readers
    const liveAnnouncer = document.getElementById('live-announcer');
    if (liveAnnouncer) liveAnnouncer.textContent = message;

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  /**
   * Mobile menu toggle handler
   */
  function setupMobileMenu() {
    if (!navToggle || !mobileMenu) return;

    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
      mobileMenu.hidden = isExpanded;
    });

    // Close mobile menu when clicking any nav link
    mobileNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        mobileMenu.hidden = true;
      });
    });
  }

  /**
   * Tab switcher for Emergency Preparedness & First Aid Section
   */
  function setupProtocolTabs() {
    protocolTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('aria-controls');

        // Deactivate all tabs
        protocolTabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });

        // Hide all panels
        protocolPanels.forEach(p => {
          p.classList.remove('active');
          p.hidden = true;
        });

        // Activate selected
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        const activePanel = document.getElementById(targetId);
        if (activePanel) {
          activePanel.classList.add('active');
          activePanel.hidden = false;
        }
      });
    });
  }

  /**
   * Active Navigation link highlighting via scroll
   */
  function setupScrollSpy() {
    const sections = document.querySelectorAll('section[id], header[id]');
    if (!sections.length) return;

    window.addEventListener('scroll', () => {
      let currentSection = '';
      const scrollPos = window.pageYOffset + 120;

      sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          currentSection = section.getAttribute('id');
        }
      });

      navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === `#${currentSection}`) {
          link.classList.add('active');
        }
      });
    }, { passive: true });
  }

  /**
   * Setup disclaimer banner dismiss behavior
   */
  function setupBannerDismiss() {
    if (!dismissBannerBtn || !prototypeBanner) return;

    if (sessionStorage.getItem('smart_emergency_banner_dismissed') === 'true') {
      prototypeBanner.style.display = 'none';
    }

    dismissBannerBtn.addEventListener('click', () => {
      prototypeBanner.style.display = 'none';
      sessionStorage.setItem('smart_emergency_banner_dismissed', 'true');
    });
  }

  /**
   * Main App Initialization
   */
  function init() {
    // Expose global App instance
    window.App = { showToast };

    // Bootstrap sub-modules
    if (window.LocationManager && window.LocationManager.init) {
      window.LocationManager.init();
    }
    if (window.ContactsManager && window.ContactsManager.init) {
      window.ContactsManager.init();
    }
    if (window.SOSManager && window.SOSManager.init) {
      window.SOSManager.init();
    }
    if (window.VoiceTriggerManager && window.VoiceTriggerManager.init) {
      window.VoiceTriggerManager.init();
    }

    // Setup global UI handlers
    setupMobileMenu();
    setupProtocolTabs();
    setupScrollSpy();
    setupBannerDismiss();

    console.log('✅ Smart Emergency Safety System initialized successfully.');
  }

  return { init, showToast };
})();

// Launch application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
