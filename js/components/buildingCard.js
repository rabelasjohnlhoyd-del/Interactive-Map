// ============================================================
// BUILDING-CARD.JS — Reusable building card renderer
// File:  js/components/buildingCard.js
//
// Usage:
//   renderBuildingCards(buildings, container, mode)
//
// Modes:
//   'admin'    — shows Edit button      (calls editMarker(id))
//   'superadmin' — shows Archive button (calls archiveBuilding(id))
//   'archives' — shows Restore + Delete (calls restoreBuilding(id) / permanentlyDeleteBuilding(id))
//   'view'     — no action buttons (read-only)
//
// Exposed globals:
//   window.renderBuildingCards(buildings, containerId, mode)
//   window.filterBuildingCards(query, containerId)
// ============================================================

const CARD_TYPE_LABELS = {
  office:    'Office',
  classroom: 'Classroom',
  lab:       'Laboratory',
  gym:       'Gym / Sports',
  gate:      'Gate',
  canteen:   'Canteen',
  building:  'Building',
  room:      'Room',
};

// ── Main renderer ────────────────────────────────────────────
function renderBuildingCards(buildings, containerId, mode = 'view') {
  const grid  = document.getElementById(containerId);
  const empty = document.getElementById('emptyState');

  if (!grid) {
    console.warn(`[buildingCard] Container #${containerId} not found.`);
    return;
  }

  if (!buildings || buildings.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  grid.innerHTML = buildings.map(b => buildCardHTML(b, mode)).join('');
}

// ── Build single card HTML ────────────────────────────────────
function buildCardHTML(b, mode) {
  const typeLabel = CARD_TYPE_LABELS[b.type] || b.type || 'Building';
  const badgeClass = b.type === 'room' ? 'badge-room' : 'badge-building';

  const imgSection = b.photo
    ? `<img class="building-card-img" src="${b.photo}" alt="${escapeHtml(b.name)}" />`
    : `<div class="building-card-img-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
       </div>`;

  const metaSection = b.location
    ? `<div class="building-card-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        ${escapeHtml(b.location)}
       </div>`
    : '';

  const archivedMeta = mode === 'archives' && (b.archivedAt || b.archivedBy)
    ? `<div class="building-card-meta" style="margin-top:4px; color:var(--danger);">
        ${b.archivedAt ? `Archived ${escapeHtml(b.archivedAt)}` : ''}
        ${b.archivedBy ? ` by ${escapeHtml(b.archivedBy)}` : ''}
       </div>`
    : '';

  return `
    <div class="building-card ${mode === 'archives' ? 'archived' : ''}" data-id="${b.id}" data-name="${escapeHtml((b.name || '').toLowerCase())}">
      ${imgSection}
      <div class="building-card-body">
        <div class="building-card-header">
          <span class="building-card-name">${escapeHtml(b.name)}</span>
          <span class="badge ${badgeClass}">${typeLabel}</span>
        </div>
        ${metaSection}
        ${archivedMeta}
      </div>
      <div class="building-card-footer">
        ${buildFooterButtons(b, mode)}
      </div>
    </div>`;
}

// ── Footer buttons per mode ───────────────────────────────────
function buildFooterButtons(b, mode) {
  const id   = b.id;
  const name = escapeHtml(b.name);

  switch (mode) {
    case 'admin':
      return `
        <button class="btn btn-outline btn-sm" style="flex:1;justify-content:center;" onclick="handleEditMarker('${id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>`;

    case 'superadmin':
      return `
        <button class="btn btn-danger btn-sm w-full" style="justify-content:center;" onclick="handleArchiveBuilding('${id}', '${name}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
          Archive
        </button>`;

    case 'archives':
      return `
        <button class="btn btn-outline btn-sm" style="flex:1;justify-content:center;" onclick="handleRestoreBuilding('${id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
          Restore
        </button>
        <button class="btn btn-danger btn-sm" style="flex:1;justify-content:center;" onclick="handleDeleteBuilding('${id}', '${name}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
          Delete
        </button>`;

    default:
      return ''; // view mode — no buttons
  }
}

// ── Action handlers (call backend hooks) ─────────────────────
function handleEditMarker(id) {
  if (typeof editMarker === 'function') editMarker(id);
  else console.warn('[DEV] editMarker() not connected. ID:', id);
}

function handleArchiveBuilding(id, name) {
  if (typeof confirmArchive === 'function') confirmArchive(id, name);
  else console.warn('[DEV] confirmArchive() not connected. ID:', id);
}

function handleRestoreBuilding(id) {
  if (typeof restoreBuilding === 'function') restoreBuilding(id);
  else console.warn('[DEV] restoreBuilding() not connected. ID:', id);
}

function handleDeleteBuilding(id, name) {
  if (typeof promptDelete === 'function') promptDelete(id, name);
  else console.warn('[DEV] promptDelete() not connected. ID:', id);
}

// ── Live search filter ────────────────────────────────────────
function filterBuildingCards(query, containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const q = (query || '').toLowerCase().trim();
  grid.querySelectorAll('.building-card').forEach(card => {
    const name = card.dataset.name || '';
    card.style.display = !q || name.includes(q) ? '' : 'none';
  });
}

// ── XSS-safe escaping ─────────────────────────────────────────
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Expose globally ───────────────────────────────────────────
window.renderBuildingCards  = renderBuildingCards;
window.filterBuildingCards  = filterBuildingCards;