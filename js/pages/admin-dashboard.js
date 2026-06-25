// ============================================================
// ADMIN DASHBOARD — Frontend Logic
// File:  js/pages/admin-dashboard.js
// Page:  admin/dashboard.html
//
// Backend hooks (WE CALL these — backend implements them):
//   - logoutUser()
//   - submitMarkerForm(formData)
//
// Exposed for backend (BACKEND CALLS these — we implement them):
//   - setHeaderName(name)
//   - openMarkerModal()            <- backend calls this on map click
//   - openInfoPanel(buildingData)  <- backend calls this on marker click
//
// IMPORTANT: This file does NOT initialize Leaflet. The backend
// developer initializes the map on the #map div. We only host it.
// ============================================================

let currentMarkerType = 'building';
let floorCount = 0;
let roomCounters = {};

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
   LOGOUT  (backend hook — we only CALL this, never implement it
   for real. The guard below just keeps the button from throwing
   an error in dev, before the backend script has loaded.)
============================================================ */
if (typeof logoutUser === 'undefined') {
  window.logoutUser = function () {
    console.warn('[DEV] logoutUser() not yet connected.');
  };
}

/* ============================================================
   MARKER TYPE TOGGLE (Building / Room)
============================================================ */
function setMarkerType(type) {
  currentMarkerType = type;
  document.getElementById('typeBtnBuilding').classList.toggle('active', type === 'building');
  document.getElementById('typeBtnRoom').classList.toggle('active', type === 'room');
  document.getElementById('floorSection').classList.toggle('hidden', type === 'room');
}

/* ============================================================
   MODAL OPEN / CLOSE
   openMarkerModal() is exposed below — the backend calls it
   when the user clicks an empty spot on the map.
============================================================ */
function openMarkerModal() {
  document.getElementById('markerModalOverlay').classList.add('open');
  document.getElementById('markerModalTitle').textContent = 'Add New Marker';

  // Reset form
  document.getElementById('markerName').value = '';
  document.getElementById('markerDescription').value = '';
  document.getElementById('markerPhoto').value = '';
  document.getElementById('markerPhotoPreview').style.display = 'none';

  setMarkerType('building');
  floorCount = 0;
  roomCounters = {};
  document.getElementById('floorsContainer').innerHTML = '';
}

function closeMarkerModal() {
  document.getElementById('markerModalOverlay').classList.remove('open');
}

/* ============================================================
   PHOTO PREVIEW (shared by marker / floor / org chart / faculty)
============================================================ */
function previewPhoto(input, previewId) {
  const preview = document.getElementById(previewId);
  const img = preview.querySelector('img');
  if (input.files && input.files[0]) {
    img.src = URL.createObjectURL(input.files[0]);
    preview.style.display = 'block';
  }
}

/* ============================================================
   FLOOR BLOCKS — add / remove
============================================================ */
function addFloor() {
  floorCount++;
  const id = floorCount;
  const container = document.getElementById('floorsContainer');

  const block = document.createElement('div');
  block.className = 'floor-block';
  block.id = `floorBlock${id}`;
  block.innerHTML = `
    <div class="floor-block-header">
      <span class="floor-block-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/>
        </svg>
        Floor ${id}
      </span>
      <button class="btn btn-sm" style="background:rgba(255,255,255,0.12);color:white;" onclick="removeFloor(${id})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Remove
      </button>
    </div>
    <div class="floor-block-body">

      <div class="form-group">
        <label class="form-label">Floor Name</label>
        <input class="form-input" type="text" placeholder="e.g. Ground Floor" data-floor="${id}" data-field="name" />
      </div>

      <div class="form-group">
        <label class="form-label">Colleges / Departments</label>
        <input class="form-input" type="text" placeholder="e.g. College of Engineering" data-floor="${id}" data-field="colleges" />
      </div>

      <div class="form-group">
        <label class="form-label">Floor Photo</label>
        <div class="photo-upload-area" onclick="document.getElementById('floorPhoto${id}').click()">
          <input type="file" id="floorPhoto${id}" accept="image/*" onchange="previewPhoto(this,'floorPhotoPreview${id}')" />
          <div class="photo-upload-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div class="photo-upload-text">Upload floor photo</div>
          <div class="photo-preview" id="floorPhotoPreview${id}"><img src="" alt="" /></div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Org Chart Image</label>
        <div class="photo-upload-area" onclick="document.getElementById('orgChart${id}').click()">
          <input type="file" id="orgChart${id}" accept="image/*" onchange="previewPhoto(this,'orgChartPreview${id}')" />
          <div class="photo-upload-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="9" y="9" width="6" height="6"/><path d="M3 9h6M15 9h6M3 15h6M15 15h6M9 3v6M15 3v6M9 15v6M15 15v6"/>
            </svg>
          </div>
          <div class="photo-upload-text">Upload org chart</div>
          <div class="photo-preview" id="orgChartPreview${id}"><img src="" alt="" /></div>
        </div>
      </div>

      <!-- Faculty in-charge -->
      <div class="modal-section-label">Faculty In-Charge</div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" type="text" placeholder="Faculty name" data-floor="${id}" data-field="facultyName" />
      </div>
      <div class="form-group">
        <label class="form-label">Position</label>
        <input class="form-input" type="text" placeholder="e.g. Dean" data-floor="${id}" data-field="facultyPosition" />
      </div>
      <div class="form-group">
        <label class="form-label">Faculty Photo</label>
        <div class="photo-upload-area" onclick="document.getElementById('facultyPhoto${id}').click()">
          <input type="file" id="facultyPhoto${id}" accept="image/*" onchange="previewPhoto(this,'facultyPhotoPreview${id}')" />
          <div class="photo-upload-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div class="photo-upload-text">Upload faculty photo</div>
          <div class="photo-preview" id="facultyPhotoPreview${id}"><img src="" alt="" /></div>
        </div>
      </div>

      <!-- Rooms -->
      <div class="modal-section-label">Rooms</div>
      <div class="rooms-list" id="roomsList${id}"></div>
      <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="addRoom(${id})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Room
      </button>

    </div>
  `;
  container.appendChild(block);
}

function removeFloor(id) {
  const block = document.getElementById(`floorBlock${id}`);
  if (block) block.remove();
  delete roomCounters[id];
}

/* ============================================================
   ROOM ROWS — add / remove (nested inside a floor block)
============================================================ */
function addRoom(floorId) {
  if (!roomCounters[floorId]) roomCounters[floorId] = 0;
  roomCounters[floorId]++;
  const rid = roomCounters[floorId];
  const list = document.getElementById(`roomsList${floorId}`);

  const row = document.createElement('div');
  row.className = 'room-row';
  row.id = `roomRow${floorId}_${rid}`;
  row.innerHTML = `
    <input class="form-input" type="text" placeholder="Room name" data-floor="${floorId}" data-room="${rid}" data-field="roomName" />
    <input class="form-input" type="text" placeholder="Description" data-floor="${floorId}" data-room="${rid}" data-field="roomDesc" />
    <label class="room-faculty-check">
      <input type="checkbox" data-floor="${floorId}" data-room="${rid}" data-field="isFaculty" />
      Faculty
    </label>
    <button class="btn-remove-room" onclick="removeRoom(${floorId}, ${rid})">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  list.appendChild(row);
}

function removeRoom(floorId, rid) {
  const row = document.getElementById(`roomRow${floorId}_${rid}`);
  if (row) row.remove();
}

/* ============================================================
   FORM DATA COLLECTION
   The original version only sent { name, type, description,
   floors: [] } — floors/rooms/photos were never actually read
   from the DOM. This walks every floor block and room row and
   builds the real structured object.
============================================================ */
function getFileFromInput(inputId) {
  const input = document.getElementById(inputId);
  return input && input.files && input.files[0] ? input.files[0] : null;
}

function collectFormFloors() {
  const floorBlocks = document.querySelectorAll('#floorsContainer .floor-block');
  const floors = [];

  floorBlocks.forEach((block) => {
    const id = block.id.replace('floorBlock', '');

    const getVal = (field) => {
      const el = block.querySelector(`[data-floor="${id}"][data-field="${field}"]`);
      return el ? el.value.trim() : '';
    };

    const rooms = [];
    const roomRows = document.querySelectorAll(`#roomsList${id} .room-row`);
    roomRows.forEach((row) => {
      const nameInput = row.querySelector('[data-field="roomName"]');
      const descInput = row.querySelector('[data-field="roomDesc"]');
      const facultyCheck = row.querySelector('[data-field="isFaculty"]');
      rooms.push({
        name: nameInput ? nameInput.value.trim() : '',
        description: descInput ? descInput.value.trim() : '',
        isFaculty: facultyCheck ? facultyCheck.checked : false
      });
    });

    floors.push({
      name: getVal('name'),
      colleges: getVal('colleges'),
      floorPhoto: getFileFromInput(`floorPhoto${id}`),
      orgChart: getFileFromInput(`orgChart${id}`),
      faculty: {
        name: getVal('facultyName'),
        position: getVal('facultyPosition'),
        photo: getFileFromInput(`facultyPhoto${id}`)
      },
      rooms: rooms
    });
  });

  return floors;
}

/* ============================================================
   SUBMIT MARKER  (backend hook)
============================================================ */
function submitMarker() {
  const nameInput = document.getElementById('markerName');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.focus();
    console.warn('[Validation] Marker name is required.');
    return;
  }

  const formData = {
    name: name,
    type: currentMarkerType,
    description: document.getElementById('markerDescription').value.trim(),
    photo: getFileFromInput('markerPhoto'),
    floors: currentMarkerType === 'building' ? collectFormFloors() : []
  };

  if (typeof submitMarkerForm === 'function') {
    submitMarkerForm(formData);
  } else {
    console.warn('[DEV] submitMarkerForm() not connected. Form data:', formData);
    closeMarkerModal();
  }
}

/* ============================================================
   INFO PANEL  (backend calls openInfoPanel(buildingData))
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
   DARK MODE TOGGLE (persisted, matches superadmin/buildings.html)
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
   The backend calls these directly — keep them on window.
============================================================ */
window.openMarkerModal = openMarkerModal;
window.openInfoPanel = openInfoPanel;
window.setHeaderName = setHeaderName;