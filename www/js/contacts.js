/**
 * ============================================================================
 * Smart Emergency Safety System - Emergency Contacts Module
 * ============================================================================
 * Manages trusted emergency contacts via LocalStorage.
 * Handles validation, editing, deletion with modal confirmation,
 * prefilled SMS URI scheme generation (`sms:PHONE?body=...`), and demo data seeding.
 */

const ContactsManager = (() => {
  const STORAGE_KEY = 'smart_emergency_contacts_v1';
  let contacts = [];
  let pendingDeleteId = null;

  // DOM Elements
  const form = document.getElementById('contact-form');
  const formTitle = document.getElementById('contact-form-title');
  const editIdInput = document.getElementById('edit-contact-id');
  const nameInput = document.getElementById('contact-name');
  const phoneInput = document.getElementById('contact-phone');
  const relationSelect = document.getElementById('contact-relation');
  const nameError = document.getElementById('name-error');
  const phoneError = document.getElementById('phone-error');
  const relationError = document.getElementById('relation-error');
  const saveBtn = document.getElementById('save-contact-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const contactsListContainer = document.getElementById('contacts-list');
  const noContactsState = document.getElementById('no-contacts-state');
  const contactsCountSpan = document.getElementById('contacts-count');
  const loadSampleBtn = document.getElementById('load-sample-contacts-btn');
  const emptyStateSampleBtn = document.getElementById('empty-state-sample-btn');
  const batchContainer = document.getElementById('batch-sms-container');
  const quickSmsLinksList = document.getElementById('quick-sms-links-list');

  // Delete Modal Elements
  const deleteModal = document.getElementById('delete-modal');
  const deleteModalName = document.getElementById('delete-contact-name-display');
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  const deleteCancelBtn = document.getElementById('delete-cancel-btn');
  const deleteCancelX = document.getElementById('delete-cancel-x');

  /**
   * Safe HTML Escaping for input display
   */
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Load stored contacts from LocalStorage
   */
  function loadContacts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        contacts = JSON.parse(raw);
        if (!Array.isArray(contacts)) contacts = [];
      } else {
        contacts = [];
      }
    } catch (e) {
      console.error('Error reading localStorage contacts:', e);
      contacts = [];
    }
  }

  /**
   * Persist contacts to LocalStorage
   */
  function saveContacts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      render();
    } catch (e) {
      console.error('Error writing to localStorage:', e);
      if (window.App && window.App.showToast) {
        window.App.showToast('Failed to save to local storage (storage quota exceeded or disabled).', 'error');
      }
    }
  }

  /**
   * Clear all validation error labels
   */
  function clearErrors() {
    if (nameError) nameError.textContent = '';
    if (phoneError) phoneError.textContent = '';
    if (relationError) relationError.textContent = '';
    if (nameInput) nameInput.classList.remove('is-invalid');
    if (phoneInput) phoneInput.classList.remove('is-invalid');
    if (relationSelect) relationSelect.classList.remove('is-invalid');
  }

  /**
   * Validate form inputs
   */
  function validateForm() {
    clearErrors();
    let isValid = true;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim().replace(/\D/g, ''); // strip non-digits
    const relation = relationSelect.value;

    if (!name || name.length < 2) {
      nameError.textContent = 'Please enter a valid full name (minimum 2 characters).';
      nameInput.focus();
      isValid = false;
    } else if (name.length > 50) {
      nameError.textContent = 'Name cannot exceed 50 characters.';
      isValid = false;
    }

    if (!phone || phone.length !== 10) {
      phoneError.textContent = 'Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).';
      if (isValid) phoneInput.focus();
      isValid = false;
    }

    if (!relation) {
      relationError.textContent = 'Please choose a relationship type.';
      if (isValid) relationSelect.focus();
      isValid = false;
    }

    return isValid;
  }

  /**
   * Resets form back to "Add Contact" state
   */
  function resetForm() {
    form.reset();
    editIdInput.value = '';
    formTitle.innerHTML = '<span class="icon-circle">👤</span> Add Emergency Contact';
    saveBtn.textContent = 'Save Contact';
    cancelEditBtn.style.display = 'none';
    clearErrors();
  }

  /**
   * Seeds demo contacts for easy testing and college demonstration
   */
  function seedSampleContacts() {
    const samples = [
      {
        id: 'contact_' + Date.now() + '_1',
        name: 'Aarav Sharma',
        phone: '9876543210',
        relation: 'Parent',
        createdAt: new Date().toISOString()
      },
      {
        id: 'contact_' + (Date.now() + 1) + '_2',
        name: 'Dr. Priya Patel',
        phone: '9812345678',
        relation: 'Doctor',
        createdAt: new Date().toISOString()
      },
      {
        id: 'contact_' + (Date.now() + 2) + '_3',
        name: 'Rahul Verma',
        phone: '9765432109',
        relation: 'Friend',
        createdAt: new Date().toISOString()
      }
    ];

    contacts = samples;
    saveContacts();
    if (window.App && window.App.showToast) {
      window.App.showToast('Sample emergency contacts loaded successfully!', 'success');
    }
  }

  /**
   * Initiates edit mode for a specific contact
   */
  function editContact(id) {
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;

    editIdInput.value = contact.id;
    nameInput.value = contact.name;
    phoneInput.value = contact.phone;
    relationSelect.value = contact.relation;

    formTitle.innerHTML = `<span class="icon-circle">✏️</span> Edit Contact: ${escapeHTML(contact.name)}`;
    saveBtn.textContent = 'Update Contact';
    cancelEditBtn.style.display = 'block';

    // Scroll smoothly into form view
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
  }

  /**
   * Opens delete confirmation modal
   */
  function promptDelete(id) {
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;

    pendingDeleteId = id;
    deleteModalName.textContent = contact.name;
    deleteModal.hidden = false;
  }

  /**
   * Closes delete confirmation modal
   */
  function closeDeleteModal() {
    pendingDeleteId = null;
    deleteModal.hidden = true;
  }

  /**
   * Confirms deletion of pending contact
   */
  function confirmDelete() {
    if (!pendingDeleteId) return;
    const deletedName = contacts.find(c => c.id === pendingDeleteId)?.name || 'Contact';
    contacts = contacts.filter(c => c.id !== pendingDeleteId);
    saveContacts();
    closeDeleteModal();
    if (window.App && window.App.showToast) {
      window.App.showToast(`Removed "${deletedName}" from emergency contacts.`, 'warning');
    }
  }

  /**
   * Formats a device-compatible SMS URI
   */
  function buildSmsUri(phone, message) {
    // Standard format for universal SMS apps: sms:+91XXXXXXXXXX?body=...
    // iOS also accepts &body=, but standard modern Web handles ?body= well.
    const cleanPhone = `+91${phone}`;
    const encodedBody = encodeURIComponent(message);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const separator = isIOS ? '&' : '?';
    return `sms:${cleanPhone}${separator}body=${encodedBody}`;
  }

  /**
   * Renders contacts list in the DOM
   */
  function render() {
    if (contactsCountSpan) contactsCountSpan.textContent = contacts.length;

    if (contacts.length === 0) {
      noContactsState.style.display = 'block';
      contactsListContainer.innerHTML = '';
      if (batchContainer) batchContainer.style.display = 'none';
      return;
    }

    noContactsState.style.display = 'none';
    contactsListContainer.innerHTML = '';

    // Generate dynamic message if SOS module exists
    const currentAlertMsg = (window.SOSManager && window.SOSManager.getCurrentDistressMessage) 
      ? window.SOSManager.getCurrentDistressMessage() 
      : 'EMERGENCY ALERT: I need immediate assistance! Please check on me.';

    contacts.forEach(contact => {
      const card = document.createElement('div');
      card.className = 'contact-card-item';
      card.setAttribute('role', 'listitem');

      const initial = (contact.name && contact.name.trim().length > 0) 
        ? contact.name.trim().charAt(0).toUpperCase() 
        : '👤';

      const smsUri = buildSmsUri(contact.phone, currentAlertMsg);
      const callUri = `tel:+91${contact.phone}`;

      card.innerHTML = `
        <div class="contact-avatar" aria-hidden="true">${initial}</div>
        <div class="contact-info">
          <div class="contact-name-row">
            <span class="contact-name">${escapeHTML(contact.name)}</span>
            <span class="contact-relation-badge">${escapeHTML(contact.relation)}</span>
          </div>
          <div class="contact-phone">
            <span>📞 +91 ${escapeHTML(contact.phone)}</span>
          </div>
        </div>
        <div class="contact-actions">
          <a href="${smsUri}" class="btn-icon-action action-sms" title="Prefill SMS Distress Alert to ${escapeHTML(contact.name)}" aria-label="Open SMS to ${escapeHTML(contact.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </a>
          <a href="${callUri}" class="btn-icon-action action-call" title="Direct Phone Call to ${escapeHTML(contact.name)}" aria-label="Call ${escapeHTML(contact.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </a>
          <button type="button" class="btn-icon-action action-edit" data-id="${contact.id}" title="Edit contact details" aria-label="Edit ${escapeHTML(contact.name)}">
            ✏️
          </button>
          <button type="button" class="btn-icon-action action-delete" data-id="${contact.id}" title="Delete contact" aria-label="Delete ${escapeHTML(contact.name)}">
            🗑️
          </button>
        </div>
      `;

      // Attach button events
      const editBtn = card.querySelector('.action-edit');
      const deleteBtn = card.querySelector('.action-delete');

      editBtn.addEventListener('click', () => editContact(contact.id));
      deleteBtn.addEventListener('click', () => promptDelete(contact.id));

      contactsListContainer.appendChild(card);
    });

    // Render Batch SMS Links
    if (batchContainer && quickSmsLinksList) {
      batchContainer.style.display = 'block';
      quickSmsLinksList.innerHTML = '';

      contacts.forEach(contact => {
        const pill = document.createElement('a');
        pill.className = 'sms-pill-link';
        pill.href = buildSmsUri(contact.phone, currentAlertMsg);
        pill.innerHTML = `💬 SMS ${escapeHTML(contact.name)} (${escapeHTML(contact.relation)})`;
        quickSmsLinksList.appendChild(pill);
      });
    }
  }

  /**
   * Initializes event listeners
   */
  function init() {
    loadContacts();
    render();

    // Form submission
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const id = editIdInput.value.trim();
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim().replace(/\D/g, '');
        const relation = relationSelect.value;

        if (id) {
          // Edit existing
          const idx = contacts.findIndex(c => c.id === id);
          if (idx !== -1) {
            contacts[idx].name = name;
            contacts[idx].phone = phone;
            contacts[idx].relation = relation;
            contacts[idx].updatedAt = new Date().toISOString();
          }
          if (window.App && window.App.showToast) {
            window.App.showToast(`Updated contact details for ${name}.`, 'success');
          }
        } else {
          // Create new
          const newContact = {
            id: 'contact_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name,
            phone,
            relation,
            createdAt: new Date().toISOString()
          };
          contacts.push(newContact);
          if (window.App && window.App.showToast) {
            window.App.showToast(`Added ${name} to emergency contacts.`, 'success');
          }
        }

        saveContacts();
        resetForm();
      });
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        resetForm();
      });
    }

    if (loadSampleBtn) {
      loadSampleBtn.addEventListener('click', seedSampleContacts);
    }

    if (emptyStateSampleBtn) {
      emptyStateSampleBtn.addEventListener('click', seedSampleContacts);
    }

    // Delete modal listeners
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', confirmDelete);
    if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', closeDeleteModal);
    if (deleteCancelX) deleteCancelX.addEventListener('click', closeDeleteModal);
    if (deleteModal) {
      deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
      });
    }
  }

  return {
    init,
    getContacts: () => contacts,
    buildSmsUri,
    refreshDisplay: render
  };
})();
