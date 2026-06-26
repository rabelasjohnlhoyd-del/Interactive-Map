// ============================================================
// SUPER ADMIN DASHBOARD — Frontend Logic
// File:  js/pages/superadmin-dashboard.js
// Page:  superadmin/dashboard.html
//
// Backend hooks (WE CALL these — backend implements them):
//   - logoutUser()
//
// Exposed for backend (BACKEND CALLS these — we implement them):
//   - setHeaderName(name)
//   - openInfoPanel(buildingData)  <- backend calls this on marker click
//
// NOTE: Super Admin is VIEW-ONLY here — no add/edit marker modal,
// no openMarkerModal(). Map is initialized by the backend, never here.
//
// HEADS UP: This file is also <script>-included on
// superadmin/buildings.html, but that page uses a DIFFERENT set
// of element IDs (headerNameSA / sidebarNameSA / headerAvatarSA /
// sidebarAvatarSA with the "SA" suffix) and defines its own
// setHeaderName()/logoutUser() inline afterward anyway, so those
// definitions simply override the ones below on that page — no
// errors, just redundant. Worth flagging to your groupmate so the
// ID naming gets made consistent across both super admin pages.
// ============================================================

/* ============================================================
   HEADER NAME  (called by backend)
============================================================ */
function setHeaderName(name) {
  document.getElementById('headerUserName').textContent = name;
  document.getElementById('sidebarUserName').textContent = name;
  const initial = name.charAt(0).toUpperCase();
  document.getElementById('headerAvatar').textContent = initial;
  document.getElementById('sidebarAvatar').textContent = initial;
}

/* ============================================================
   LOGOUT  (backend hook — fallback stub for dev only, so the
   button doesn't throw before the real backend script loads)
============================================================ */
if (typeof logoutUser === 'undefined') {
  window.logoutUser = function () {
    console.warn('[DEV] logoutUser() not yet connected.');
  };
}

/* ============================================================
   INFO PANEL  (backend calls openInfoPanel(buildingData))
   Same render logic as the admin dashboard — Super Admin can
   view full building details, just can't add/edit markers.
============================================================ */
function openInfoPanel(buildingData) {
  const panel = document.getElementById('infoPanel');
  const title = document.getElementById('infoPanelTitle');
  const body = document.getElementById('infoPanelBody');
  const cover = document.getElementById('infoPanelCover');
  const placeholder = document.getElementById('infoPanelCoverPlaceholder');

  title.textContent = buildingData.name || 'Unknown';

  if (buildingData.photo) {
    cover.src = buildingData.photo;
    cover.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    cover.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }

  if (buildingData.type === 'room') {
    body.innerHTML = `
      <p class="info-panel-description">${buildingData.description || 'No description available.'}</p>
    `;
  } else {
    const floors = buildingData.floors || [];
    body.innerHTML = `
      <p class="info-panel-description">${buildingData.description || ''}</p>
      <div class="floors-accordion">
        ${floors.map((floor) => `
          <div class="floor-item">
            <div class="floor-item-header" onclick="toggleFloor(this)">
              <span class="floor-item-name">${floor.name}</span>
              <svg class="floor-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="floor-item-content">
              ${floor.colleges ? `
                <div>
                  <div class="floor-detail-label">Colleges / Departments</div>
                  <div class="floor-detail-value">${floor.colleges}</div>
                </div>` : ''}
              ${floor.floorPhoto ? `<img class="floor-image" src="${floor.floorPhoto}" alt="Floor photo" />` : ''}
              ${floor.orgChart ? `
                <div>
                  <div class="floor-detail-label">Org Chart</div>
                  <img class="floor-image" src="${floor.orgChart}" alt="Org chart" />
                </div>` : ''}
              ${floor.faculty ? `
                <div>
                  <div class="floor-detail-label">Faculty In-Charge</div>
                  <div class="faculty-card">
                    <div class="faculty-avatar">${floor.faculty.photo
                      ? `<img src="${floor.faculty.photo}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
                      : floor.faculty.name.charAt(0)}</div>
                    <div>
                      <div class="faculty-name">${floor.faculty.name}</div>
                      <div class="faculty-position">${floor.faculty.position || ''}</div>
                    </div>
                  </div>
                </div>` : ''}
              ${floor.rooms && floor.rooms.length ? `
                <div>
                  <div class="floor-detail-label">Rooms</div>
                  <div class="rooms-list-display">
                    ${floor.rooms.map((r) => `
                      <div class="room-item-display ${r.isFaculty ? 'faculty-room' : ''}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                        </svg>
                        ${r.name}
                        ${r.isFaculty ? '<span class="room-tag">Faculty</span>' : ''}
                      </div>`).join('')}
                  </div>
                </div>` : ''}
            </div>
          </div>`).join('')}
      </div>
    `;
  }

  panel.classList.add('open');
}

function closeInfoPanel() {
  document.getElementById('infoPanel').classList.remove('open');
}

function toggleFloor(header) {
  header.classList.toggle('expanded');
  header.nextElementSibling.classList.toggle('open');
}

/* ============================================================
   DARK MODE TOGGLE (persisted, matches the other pages)
============================================================ */
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

/* ============================================================
   EXPOSE TO BACKEND
============================================================ */
window.openInfoPanel = openInfoPanel;
window.setHeaderName = setHeaderName;