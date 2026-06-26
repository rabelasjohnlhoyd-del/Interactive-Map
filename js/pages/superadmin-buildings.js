// ============================================================
// SUPERADMIN BUILDINGS PAGE — Frontend Logic
// File:  js/pages/superadmin-buildings.js
// Page:  superadmin/buildings.html
//
// Backend hooks (WE CALL — backend implements):
//   - logoutUser()
//   - archiveBuilding(buildingId)
//
// Exposed for backend (BACKEND CALLS — we implement):
//   - setHeaderName(name)
//   - renderBuildingsList(buildings)
// ============================================================

/* --- Header name --- */
function setHeaderName(name) {
  const nameEls = document.querySelectorAll('[data-header-name]');
  nameEls.forEach(el => el.textContent = name);
  const avatarEls = document.querySelectorAll('[data-header-avatar]');
  avatarEls.forEach(el => el.textContent = name.charAt(0).toUpperCase());
}

/* --- Logout stub (overridden by backend) --- */
if (typeof logoutUser === 'undefined') {
  window.logoutUser = function() {
    console.warn('[DEV] logoutUser() not yet connected.');
  };
}

/* --- Render buildings grid --- */
function renderBuildingsList(buildings) {
  const grid = document.getElementById('buildingsGrid');
  const empty = document.getElementById('emptyState');

  if (!buildings || buildings.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  grid.innerHTML = buildings.map(b => `
    <div class="building-card" data-id="${b.id}" data-name="${(b.name || '').toLowerCase()}">
      ${b.photo
        ? `<img class="building-card-img" src="${b.photo}" alt="${b.name}" />`
        : `<div class="building-card-img-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          </div>`}
      <div class="building-card-body">
        <div class="building-card-header">
          <span class="building-card-name">${b.name}</span>
          <span class="badge ${b.type === 'room' ? 'badge-room' : 'badge-building'}">${b.type || 'building'}</span>
        </div>
        <div class="building-card-meta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          ${b.location || 'Campus'}
        </div>
      </div>
      <div class="building-card-footer">
        <button class="btn btn-sm btn-danger w-full" onclick="confirmArchive('${b.id}', '${b.name}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
          </svg>
          Archive
        </button>
      </div>
    </div>
  `).join('');
}

/* --- Live search filter --- */
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      document.querySelectorAll('.building-card').forEach(card => {
        const name = card.dataset.name || '';
        card.style.display = name.includes(q) ? '' : 'none';
      });
    });
  }
});

/* --- Archive confirmation --- */
function confirmArchive(buildingId, buildingName) {
  const overlay = document.getElementById('confirmOverlay');
  const msgEl   = document.getElementById('confirmMsg');
  if (msgEl) msgEl.textContent = `Archive "${buildingName}"? It will be moved to Archives and hidden from the map.`;
  overlay.dataset.pendingId = buildingId;
  overlay.classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
}

function doArchive() {
  const buildingId = document.getElementById('confirmOverlay').dataset.pendingId;
  closeConfirm();
  if (typeof archiveBuilding === 'function') {
    archiveBuilding(buildingId);
  } else {
    console.warn('[DEV] archiveBuilding() not yet connected. Would archive:', buildingId);
  }
}

/* --- Dark mode (persisted) --- */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? '' : 'dark');
  localStorage.setItem('lu-theme', isDark ? 'light' : 'dark');
}

(function applySavedTheme() {
  if (localStorage.getItem('lu-theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

/* --- Expose to backend --- */
window.setHeaderName      = setHeaderName;
window.renderBuildingsList = renderBuildingsList;

/* --- DEV: load mock data if backend not connected --- */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const grid = document.getElementById('buildingsGrid');
    if (grid && grid.children.length === 0) {
      console.warn('[DEV] renderBuildingsList() not called by backend — loading mock data.');
      renderBuildingsList([
        { id: '1', name: 'Admin Building',  type: 'building', location: 'Main Campus' },
        { id: '2', name: 'Science Lab',     type: 'building', location: 'East Wing'   },
        { id: '3', name: 'Registrar Room',  type: 'room',     location: 'Ground Floor'},
      ]);
    }
  }, 800);
});