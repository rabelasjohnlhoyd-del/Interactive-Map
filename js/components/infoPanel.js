// ============================================================
// INFO-PANEL.JS — Unified info panel component
// File:  js/components/infoPanel.js
//
// Handles TWO panel types:
//
//   1. PUBLIC MAP panel  — #info-panel (public-map.html)
//      renderPublicPanel(data, onNavigate)
//      clearPublicPanel()
//
//   2. ADMIN / SUPERADMIN slide-in panel — #infoPanel
//      openAdminPanel(buildingData)
//      closeAdminPanel()
//      toggleFloor(headerEl)
//
// All functions exposed as window globals so HTML onclick
// attributes and backend scripts can call them directly.
// ============================================================

const TYPE_LABELS = {
  office:    'Office',
  classroom: 'Classroom',
  lab:       'Laboratory',
  gym:       'Gym / Sports',
  gate:      'Gate',
  canteen:   'Canteen',
  building:  'Building',
  room:      'Room',
};

// ============================================================
//  1. PUBLIC MAP PANEL
// ============================================================

function renderPublicPanel(data, onNavigate) {
  const container = document.getElementById('info-panel');
  if (!container) return;
  container.innerHTML = '';

  const typeLabel = TYPE_LABELS[data.type] || (data.type ? data.type.toUpperCase() : 'LOCATION');

  container.innerHTML = `
    <div class="info-card-animate info-wrapper-premium">

      <div class="info-img-container" style="position:relative;">
        <img class="info-hero-img"
             src="${data.image || 'assets/images/default-campus.jpg'}"
             alt="${_esc(data.name)}"
             onerror="this.src='assets/images/default-campus.jpg'" />
        <span class="category-badge">${typeLabel}</span>
      </div>

      <div class="info-content">
        <h2 class="info-title">${_esc(data.name)}</h2>
        <small class="info-campus-text">Laguna University Campus</small>
        <p class="info-desc">${_esc(data.description || 'No description available.')}</p>

        <div class="info-details">
          🕒 <strong>Hours:</strong> ${_esc(data.hours || 'Not Specified')}
        </div>

        <button class="action-btn-main" onclick="window._infoPanelNav && window._infoPanelNav(${data.lat}, ${data.lng}, '${_esc(data.name)}')">
          <span>🚀</span> GET LIVE DIRECTIONS
        </button>
      </div>

    </div>`;

  // Store the navigate callback so the button can call it
  window._infoPanelNav = onNavigate;
}

function clearPublicPanel() {
  const container = document.getElementById('info-panel');
  if (!container) return;
  container.innerHTML = `
    <div class="sidebar-placeholder">
      <div class="placeholder-icon">📍</div>
      <h3>Explore LU</h3>
      <p>Select a building or room to view its photo and get directions.</p>
    </div>`;
}

// ============================================================
//  2. ADMIN / SUPERADMIN SLIDE-IN PANEL
// ============================================================

function openAdminPanel(buildingData) {
  const panel       = document.getElementById('infoPanel');
  const titleEl     = document.getElementById('infoPanelTitle');
  const bodyEl      = document.getElementById('infoPanelBody');
  const coverEl     = document.getElementById('infoPanelCover');
  const placeholder = document.getElementById('infoPanelCoverPlaceholder');

  if (!panel) {
    console.warn('[infoPanel] #infoPanel not found on this page.');
    return;
  }

  // Title
  titleEl.textContent = buildingData.name || 'Unknown';

  // Cover photo
  if (buildingData.photo) {
    coverEl.src = buildingData.photo;
    coverEl.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    coverEl.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }

  // Body content
  if (buildingData.type === 'room') {
    bodyEl.innerHTML = `
      <p class="info-panel-description">
        ${_esc(buildingData.description || 'No description available.')}
      </p>`;
  } else {
    bodyEl.innerHTML = buildFloorsHTML(buildingData);
  }

  panel.classList.add('open');
}

function closeAdminPanel() {
  const panel = document.getElementById('infoPanel');
  if (panel) panel.classList.remove('open');
}

function toggleFloor(headerEl) {
  headerEl.classList.toggle('expanded');
  headerEl.nextElementSibling.classList.toggle('open');
}

// ── Floors accordion HTML ─────────────────────────────────────
function buildFloorsHTML(data) {
  const floors = data.floors || [];

  const floorsHTML = floors.map(floor => `
    <div class="floor-item">
      <div class="floor-item-header" onclick="toggleFloor(this)">
        <span class="floor-item-name">${_esc(floor.name)}</span>
        <svg class="floor-item-chevron" width="16" height="16" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="floor-item-content">
        ${floor.colleges ? `
          <div>
            <div class="floor-detail-label">Colleges / Departments</div>
            <div class="floor-detail-value">${_esc(floor.colleges)}</div>
          </div>` : ''}

        ${floor.floorPhoto ? `
          <img class="floor-image" src="${floor.floorPhoto}" alt="Floor photo" />` : ''}

        ${floor.orgChart ? `
          <div>
            <div class="floor-detail-label">Org Chart</div>
            <img class="floor-image" src="${floor.orgChart}" alt="Org chart" />
          </div>` : ''}

        ${floor.faculty ? buildFacultyCard(floor.faculty) : ''}

        ${floor.rooms && floor.rooms.length ? buildRoomsList(floor.rooms) : ''}
      </div>
    </div>`).join('');

  return `
    <p class="info-panel-description">${_esc(data.description || '')}</p>
    <div class="floors-accordion">${floorsHTML}</div>`;
}

function buildFacultyCard(faculty) {
  const avatar = faculty.photo
    ? `<img src="${faculty.photo}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
    : _esc(faculty.name.charAt(0));

  return `
    <div>
      <div class="floor-detail-label">Faculty In-Charge</div>
      <div class="faculty-card">
        <div class="faculty-avatar">${avatar}</div>
        <div>
          <div class="faculty-name">${_esc(faculty.name)}</div>
          <div class="faculty-position">${_esc(faculty.position || '')}</div>
        </div>
      </div>
    </div>`;
}

function buildRoomsList(rooms) {
  return `
    <div>
      <div class="floor-detail-label">Rooms</div>
      <div class="rooms-list-display">
        ${rooms.map(r => `
          <div class="room-item-display ${r.isFaculty ? 'faculty-room' : ''}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            ${_esc(r.name)}
            ${r.isFaculty ? '<span class="room-tag">Faculty</span>' : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

// ── XSS-safe escape ───────────────────────────────────────────
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Expose globally ───────────────────────────────────────────
window.renderPublicPanel = renderPublicPanel;
window.clearPublicPanel  = clearPublicPanel;
window.openInfoPanel     = openAdminPanel;   // matches existing HTML onclick="openInfoPanel()"
window.closeInfoPanel    = closeAdminPanel;  // matches existing HTML onclick="closeInfoPanel()"
window.toggleFloor       = toggleFloor;

// Also keep partner's original export names for public-map.js compatibility
if (typeof module !== 'undefined') {
  module.exports = { renderPublicPanel, clearPublicPanel };
}