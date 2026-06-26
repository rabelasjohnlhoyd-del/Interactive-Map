// ============================================================
// MODAL.JS — Reusable modal manager
// File:  js/components/modal.js
//
// Handles ALL modals in the admin/superadmin pages:
//   - Generic open/close by overlay ID
//   - Confirm dialog (archive, delete)
//   - Add/Edit marker modal (admin dashboard)
//   - Add/Edit admin modal (manage-admins)
//
// Exposed globals:
//   window.openModal(overlayId)
//   window.closeModal(overlayId)
//   window.showConfirm({ title, message, confirmText, danger, onConfirm })
//   window.closeConfirm()
// ============================================================

// ── Generic open / close ─────────────────────────────────────
function openModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) {
    console.warn(`[modal] #${overlayId} not found.`);
    return;
  }
  overlay.classList.add('open');

  // Close on backdrop click
  overlay._backdropHandler = (e) => {
    if (e.target === overlay) closeModal(overlayId);
  };
  overlay.addEventListener('click', overlay._backdropHandler);

  // Close on Escape key
  overlay._escHandler = (e) => {
    if (e.key === 'Escape') closeModal(overlayId);
  };
  document.addEventListener('keydown', overlay._escHandler);
}

function closeModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.classList.remove('open');

  // Cleanup listeners
  if (overlay._backdropHandler) {
    overlay.removeEventListener('click', overlay._backdropHandler);
    delete overlay._backdropHandler;
  }
  if (overlay._escHandler) {
    document.removeEventListener('keydown', overlay._escHandler);
    delete overlay._escHandler;
  }
}

// ── Confirm dialog ────────────────────────────────────────────
// Usage:
//   showConfirm({
//     title:       'Archive Building?',
//     message:     '"Admin Building" will be moved to Archives.',
//     confirmText: 'Archive',
//     danger:      false,   // true = red confirm button
//     onConfirm:   () => archiveBuilding(id),
//   });

function showConfirm({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) {
  const overlay  = document.getElementById('confirmOverlay');
  const titleEl  = document.getElementById('archiveConfirmTitle') || document.getElementById('deleteConfirmTitle');
  const msgEl    = document.getElementById('confirmMsg')          || document.getElementById('deleteConfirmMsg');
  const btn      = document.getElementById('confirmBtn')          || document.getElementById('deleteConfirmBtn');

  if (!overlay || !btn) {
    console.warn('[modal] Confirm dialog elements not found.');
    return;
  }

  if (titleEl) titleEl.textContent = title || 'Are you sure?';
  if (msgEl)   msgEl.textContent   = message || '';

  // Set button style
  btn.textContent = confirmText;
  btn.className   = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

  // Attach one-time confirm handler
  const handler = () => {
    if (typeof onConfirm === 'function') onConfirm();
    closeConfirm();
    btn.removeEventListener('click', handler);
  };
  // Remove any previous handler first
  btn.replaceWith(btn.cloneNode(true));
  const freshBtn = document.getElementById('confirmBtn') || document.getElementById('deleteConfirmBtn');
  freshBtn.className   = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  freshBtn.textContent = confirmText;
  freshBtn.addEventListener('click', handler);

  openModal('confirmOverlay');
}

function closeConfirm() {
  closeModal('confirmOverlay');
}

// ── Marker modal (Admin dashboard) ───────────────────────────
// Opens the Add/Edit marker modal and pre-fills fields if
// editing an existing building.
//
// Usage:
//   openMarkerModal()           — Add mode
//   openMarkerModal(building)   — Edit mode

function openMarkerModal(building = null) {
  const overlay   = document.getElementById('markerModalOverlay');
  const titleEl   = document.getElementById('markerModalTitle');
  const nameEl    = document.getElementById('markerName');
  const descEl    = document.getElementById('markerDesc');
  const typeEl    = document.getElementById('markerType');
  const latEl     = document.getElementById('markerLat');
  const lngEl     = document.getElementById('markerLng');
  const idEl      = document.getElementById('markerEditId');

  if (!overlay) {
    console.warn('[modal] #markerModalOverlay not found.');
    return;
  }

  const isEdit = building !== null;

  if (titleEl) titleEl.textContent = isEdit ? 'Edit Marker' : 'Add New Marker';
  if (idEl)    idEl.value          = isEdit ? (building.id || '') : '';
  if (nameEl)  nameEl.value        = isEdit ? (building.name || '') : '';
  if (descEl)  descEl.value        = isEdit ? (building.description || '') : '';
  if (typeEl)  typeEl.value        = isEdit ? (building.type || 'office') : 'office';
  if (latEl)   latEl.value         = isEdit ? (building.lat || '') : '';
  if (lngEl)   lngEl.value         = isEdit ? (building.lng || '') : '';

  // Reset photo preview
  const preview = document.getElementById('photoPreview');
  if (preview) {
    preview.style.display = 'none';
    const previewImg = preview.querySelector('img');
    if (previewImg) previewImg.src = '';
  }

  // Show existing photo if editing
  if (isEdit && building.photo) {
    if (preview) {
      const previewImg = preview.querySelector('img');
      if (previewImg) previewImg.src = building.photo;
      preview.style.display = 'block';
    }
  }

  // Reset floors if switching modes
  const floorsSection = document.getElementById('floorsSection');
  if (floorsSection && !isEdit) floorsSection.innerHTML = '';

  openModal('markerModalOverlay');
}

function closeMarkerModal() {
  closeModal('markerModalOverlay');
}

// ── Admin account modal (Manage Admins) ───────────────────────
function openAdminModal(admin = null) {
  const overlay  = document.getElementById('adminModalOverlay');
  const titleEl  = document.getElementById('adminModalTitle');
  const nameEl   = document.getElementById('adminName');
  const emailEl  = document.getElementById('adminEmail');
  const passEl   = document.getElementById('adminPassword');
  const roleEl   = document.getElementById('adminRole');
  const passGrp  = document.getElementById('adminPasswordGroup');
  const uidEl    = document.getElementById('adminModalUid');

  if (!overlay) {
    console.warn('[modal] #adminModalOverlay not found.');
    return;
  }

  const isEdit = admin !== null;

  if (titleEl) titleEl.textContent  = isEdit ? 'Edit Admin' : 'Add Admin';
  if (uidEl)   uidEl.value          = isEdit ? (admin.uid   || '') : '';
  if (nameEl)  nameEl.value         = isEdit ? (admin.name  || '') : '';
  if (emailEl) emailEl.value        = isEdit ? (admin.email || '') : '';
  if (roleEl)  roleEl.value         = isEdit ? (admin.role  || 'admin') : 'admin';
  if (passEl)  passEl.value         = '';

  // Hide password field on edit
  if (passGrp) passGrp.style.display = isEdit ? 'none' : '';

  openModal('adminModalOverlay');
}

function closeAdminModal() {
  closeModal('adminModalOverlay');
}

// ── Photo upload preview ──────────────────────────────────────
function initPhotoUpload(inputId, previewId) {
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = preview.querySelector('img');
      if (img) img.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}

// ── Expose globally ───────────────────────────────────────────
window.openModal        = openModal;
window.closeModal       = closeModal;
window.showConfirm      = showConfirm;
window.closeConfirm     = closeConfirm;
window.openMarkerModal  = openMarkerModal;
window.closeMarkerModal = closeMarkerModal;
window.openAdminModal   = openAdminModal;
window.closeAdminModal  = closeAdminModal;
window.initPhotoUpload  = initPhotoUpload;