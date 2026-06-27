// ============================================================
//  LU Navigator — public-map.js (v6)
//  NEW: Turn-by-turn directions panel, voice guidance,
//       route step progress, autocomplete search,
//       live heading arrow, arrival animation
// ============================================================

let map;
let userMarker        = null;
let userHeadingMarker = null;
let accuracyCircle    = null;
let destinationCoords = null;
let routePolyline     = null;
let markersLayer      = L.layerGroup();
let allLocations      = [];
let isNavigating      = false;
let routeDrawPending  = false;
let currentDestName   = '';
let gpsReady          = false;
let currentSteps      = [];
let currentStepIndex  = 0;
let lastHeading       = 0;
let speechEnabled     = true;
let autocompleteList  = [];

// --- Campus Config ---
const CAMPUS_CENTER    = L.latLng(14.2560, 121.4050);
const CAMPUS_RADIUS_M  = 600;
const ARRIVED_RADIUS_M = 15;
const STEP_ADVANCE_M   = 18;    // meters before auto-advancing step
const OSRM_TIMEOUT_MS  = 8000;

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';

// ============================================================
//  TURN ICONS & HELPERS
// ============================================================
const MANEUVER_ICON = {
    'turn-left':          '↰',
    'turn-right':         '↱',
    'turn-slight-left':   '↖',
    'turn-slight-right':  '↗',
    'turn-sharp-left':    '⬅',
    'turn-sharp-right':   '➡',
    'straight':           '⬆',
    'depart':             '🚶',
    'arrive':             '🏁',
    'roundabout':         '🔄',
    'rotary':             '🔄',
    'fork-left':          '↰',
    'fork-right':         '↱',
    'merge':              '⬆',
    'on ramp':            '⬆',
    'off ramp':           '↘',
    'uturn':              '↩',
};

function getManeuverIcon(step) {
    const mod = step.maneuver?.modifier || '';
    const type = step.maneuver?.type || 'straight';
    const key = mod ? `${type}-${mod}` : type;
    return MANEUVER_ICON[key] || MANEUVER_ICON[type] || '⬆';
}

function getManeuverText(step) {
    const type = step.maneuver?.type || '';
    const mod  = step.maneuver?.modifier || '';
    const name = step.name || 'the path';

    if (type === 'depart')  return `Start walking`;
    if (type === 'arrive')  return `Arrive at ${currentDestName}`;
    if (type === 'straight' || mod === 'straight') return `Continue straight${name ? ' on ' + name : ''}`;
    if (mod === 'left')  return `Turn left${name ? ' onto ' + name : ''}`;
    if (mod === 'right') return `Turn right${name ? ' onto ' + name : ''}`;
    if (mod === 'slight left')  return `Keep slightly left${name ? ' onto ' + name : ''}`;
    if (mod === 'slight right') return `Keep slightly right${name ? ' onto ' + name : ''}`;
    if (mod === 'sharp left')   return `Sharp left${name ? ' onto ' + name : ''}`;
    if (mod === 'sharp right')  return `Sharp right${name ? ' onto ' + name : ''}`;
    if (type === 'roundabout' || type === 'rotary') return `Take the roundabout`;
    if (type === 'uturn') return `Make a U-turn`;
    return `Continue${name ? ' on ' + name : ''}`;
}

function formatDist(meters) {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    if (meters >= 100)  return `${Math.round(meters / 10) * 10} m`;
    return `${Math.round(meters)} m`;
}

function formatETA(seconds) {
    const mins = Math.ceil(seconds / 60);
    if (mins <= 1) return '~1 min';
    return `~${mins} min`;
}

// ============================================================
//  SPEECH / VOICE GUIDANCE
// ============================================================
let lastSpokenStep = -1;

function speak(text) {
    if (!speechEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang  = 'en-PH';
    utt.rate  = 1.05;
    utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
}

// ============================================================
//  INIT
// ============================================================
async function initMap() {
    map = L.map('map', { zoomControl: false, maxZoom: 19 })
            .setView([14.2560, 121.4050], 17);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    markersLayer.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    try {
        const res = await fetch('js/data/buildings.json');
        allLocations = await res.json();
        renderMarkers('all');
        buildAutocompleteData();
    } catch (err) {
        console.error('Error loading buildings.json:', err);
        showWarning('⚠️ Could not load campus data. Please refresh.');
    }

    injectNavPanel();
    setupEventListeners();
    startLiveTracking();
}

// ============================================================
//  MARKER STYLES
// ============================================================
const TYPE_STYLE = {
    office:    { color: '#1A5C38', emoji: '🏢' },
    classroom: { color: '#2563EB', emoji: '📚' },
    lab:       { color: '#7C3AED', emoji: '🔬' },
    gym:       { color: '#D97706', emoji: '🏀' },
    gate:      { color: '#DC2626', emoji: '🚪' },
    canteen:   { color: '#059669', emoji: '🍴' },
};

function makeIcon(type) {
    const s = TYPE_STYLE[type] || { color: '#1A5C38', emoji: '📍' };
    return L.divIcon({
        className: '',
        html: `<div style="width:36px;height:36px;background:${s.color};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:13px;padding-bottom:4px;">${s.emoji}</div></div>`,
        iconSize:    [36, 36],
        iconAnchor:  [18, 36],
        popupAnchor: [0, -38],
    });
}

// ============================================================
//  MARKERS
// ============================================================
function renderMarkers(category) {
    markersLayer.clearLayers();
    const filtered = category === 'all'
        ? allLocations
        : allLocations.filter(loc => loc.type === category);

    filtered.forEach(loc => {
        const marker = L.marker([loc.lat, loc.lng], { icon: makeIcon(loc.type) });
        marker.bindTooltip(loc.name, { permanent: false, direction: 'top', offset: [0, -38] });
        marker.on('click', () => handleLocationSelect(loc));
        markersLayer.addLayer(marker);
    });
}

// ============================================================
//  QUICK EXPLORE
// ============================================================
window.handleQuickExplore = function(category) {
    renderMarkers(category);

    const found = allLocations.find(loc => loc.type === category);
    if (found) {
        map.flyTo([found.lat - 0.0004, found.lng], 18, { animate: true, duration: 1.5 });
        setTimeout(() => handleLocationSelect(found), 1200);
    }

    document.querySelectorAll('.quick-item').forEach(item => {
        item.classList.remove('selected');
        if (item.getAttribute('onclick').includes(category)) item.classList.add('selected');
    });

    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }
};

// ============================================================
//  LOCATION SELECT (Room Card)
// ============================================================
function handleLocationSelect(loc) {
    if (!loc) return;

    map.flyTo([loc.lat - 0.0005, loc.lng], 18, { animate: true, duration: 1.5 });

    document.getElementById('card-title').innerText = loc.name;
    document.getElementById('card-tag').innerText   = loc.type || 'Location';
    document.getElementById('card-desc').innerText  = loc.description || 'No description available.';

    const imgEl      = document.getElementById('card-img');
    const imgSection = document.querySelector('.card-image-section');

    if (loc.image && loc.image.trim() !== '') {
        imgEl.src = loc.image;
        imgSection.style.display = 'block';
        imgEl.onerror = () => { imgSection.style.display = 'none'; };
    } else {
        imgSection.style.display = 'none';
    }

    const card = document.getElementById('room-card');
    card.classList.add('active');

    document.getElementById('card-nav-btn').onclick = () => {
        startNavigation(loc.lat, loc.lng, loc.name);
        card.classList.remove('active');
    };
}

// ============================================================
//  FILTER PILLS
// ============================================================
window.filterMarkers = function(category) {
    renderMarkers(category);
    document.getElementById('room-card').classList.remove('active');
    document.querySelectorAll('.f-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(category));
    });
};

// ============================================================
//  INJECT NAVIGATION PANEL (Turn-by-turn UI)
// ============================================================
function injectNavPanel() {
    if (document.getElementById('nav-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'nav-panel';
    panel.className = 'nav-panel hidden';
    panel.innerHTML = `
        <div class="nav-panel-header">
            <div class="nav-current-step">
                <div class="nav-turn-icon" id="nav-turn-icon">🚶</div>
                <div class="nav-step-info">
                    <div class="nav-step-text" id="nav-step-text">Starting navigation...</div>
                    <div class="nav-step-dist" id="nav-step-dist">—</div>
                </div>
            </div>
            <div class="nav-header-right">
                <button class="nav-voice-btn" id="nav-voice-btn" title="Toggle Voice">🔊</button>
                <button class="nav-close-btn" id="nav-close-btn" title="Stop Navigation">✕</button>
            </div>
        </div>

        <div class="nav-progress-bar">
            <div class="nav-progress-fill" id="nav-progress-fill" style="width:0%"></div>
        </div>

        <div class="nav-steps-list" id="nav-steps-list"></div>

        <div class="nav-panel-footer">
            <div class="nav-footer-item">
                <span class="nav-footer-label">DISTANCE</span>
                <span class="nav-footer-val" id="nav-total-dist">—</span>
            </div>
            <div class="nav-footer-divider"></div>
            <div class="nav-footer-item">
                <span class="nav-footer-label">ETA</span>
                <span class="nav-footer-val" id="nav-eta-val">—</span>
            </div>
            <div class="nav-footer-divider"></div>
            <div class="nav-footer-item">
                <span class="nav-footer-label">DESTINATION</span>
                <span class="nav-footer-val" id="nav-dest-name" style="font-size:11px;max-width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</span>
            </div>
        </div>
    `;

    document.querySelector('.main-content').appendChild(panel);

    document.getElementById('nav-close-btn').addEventListener('click', stopNavigation);
    document.getElementById('nav-voice-btn').addEventListener('click', () => {
        speechEnabled = !speechEnabled;
        document.getElementById('nav-voice-btn').textContent = speechEnabled ? '🔊' : '🔇';
        showWarning(speechEnabled ? '🔊 Voice guidance on' : '🔇 Voice guidance off');
        if (speechEnabled && currentSteps[currentStepIndex]) {
            speak(getManeuverText(currentSteps[currentStepIndex]));
        }
    });
}

// ============================================================
//  SHOW / HIDE NAV PANEL
// ============================================================
function showNavPanel() {
    const panel = document.getElementById('nav-panel');
    if (panel) panel.classList.remove('hidden');

    // Hide the old distance toast — nav panel replaces it
    const toast = document.getElementById('distance-toast');
    if (toast) { toast.classList.add('hidden'); toast.style.display = 'none'; }
}

function hideNavPanel() {
    const panel = document.getElementById('nav-panel');
    if (panel) panel.classList.add('hidden');
}

// ============================================================
//  POPULATE STEPS LIST
// ============================================================
function renderStepsList(steps) {
    const list = document.getElementById('nav-steps-list');
    if (!list) return;

    list.innerHTML = '';
    steps.forEach((step, i) => {
        const li = document.createElement('div');
        li.className = `nav-step-item${i === 0 ? ' active' : ''}`;
        li.id = `step-item-${i}`;
        li.innerHTML = `
            <span class="step-item-icon">${getManeuverIcon(step)}</span>
            <div class="step-item-body">
                <span class="step-item-text">${getManeuverText(step)}</span>
                <span class="step-item-dist">${formatDist(step.distance)}</span>
            </div>
        `;
        list.appendChild(li);
    });
}

// ============================================================
//  UPDATE CURRENT STEP (called on each GPS update)
// ============================================================
function updateCurrentStep(userPos) {
    if (!currentSteps.length) return;

    // Find nearest step intersection ahead
    let nearestIdx   = currentStepIndex;
    let nearestDist  = Infinity;

    for (let i = currentStepIndex; i < currentSteps.length; i++) {
        const s = currentSteps[i];
        if (!s.maneuver?.location) continue;
        const [lng, lat] = s.maneuver.location;
        const dist = userPos.distanceTo(L.latLng(lat, lng));
        if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }

    // Advance step when close to the maneuver point
    if (nearestDist < STEP_ADVANCE_M && nearestIdx + 1 < currentSteps.length) {
        nearestIdx = nearestIdx + 1;
    }

    if (nearestIdx !== currentStepIndex) {
        currentStepIndex = nearestIdx;

        // Announce new step
        if (currentStepIndex !== lastSpokenStep) {
            lastSpokenStep = currentStepIndex;
            const stepText = getManeuverText(currentSteps[currentStepIndex]);
            speak(stepText);
        }

        // Highlight in list
        document.querySelectorAll('.nav-step-item').forEach((el, i) => {
            el.classList.toggle('active', i === currentStepIndex);
            el.classList.toggle('done', i < currentStepIndex);
        });

        // Auto-scroll list
        const activeItem = document.getElementById(`step-item-${currentStepIndex}`);
        if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Update header
    const step = currentSteps[currentStepIndex];
    if (step) {
        const distToStep = nearestDist < 9999 ? nearestDist : step.distance;
        document.getElementById('nav-turn-icon').textContent  = getManeuverIcon(step);
        document.getElementById('nav-step-text').textContent  = getManeuverText(step);
        document.getElementById('nav-step-dist').textContent  = formatDist(distToStep);
    }

    // Update progress bar
    const progress = currentSteps.length > 1
        ? Math.min(100, (currentStepIndex / (currentSteps.length - 1)) * 100)
        : 0;
    const fill = document.getElementById('nav-progress-fill');
    if (fill) fill.style.width = `${progress}%`;
}

// ============================================================
//  START NAVIGATION
// ============================================================
function startNavigation(lat, lng, name) {
    destinationCoords = L.latLng(lat, lng);
    isNavigating      = true;
    currentDestName   = name;
    currentStepIndex  = 0;
    lastSpokenStep    = -1;

    document.getElementById('nav-dest-name').textContent = name;
    document.getElementById('nav-total-dist').textContent = '...';
    document.getElementById('nav-eta-val').textContent = '...';
    document.getElementById('nav-step-text').textContent = `Heading to ${name}`;
    document.getElementById('nav-steps-list').innerHTML = '';

    showNavPanel();
    speak(`Starting navigation to ${name}`);

    if (gpsReady && userMarker) {
        const userPos = userMarker.getLatLng();
        if (userPos.distanceTo(CAMPUS_CENTER) > CAMPUS_RADIUS_M) {
            showWarning('📍 You may be outside campus. Route shown from detected location.');
        }
        drawFallbackLine(userPos, destinationCoords);
        drawWalkingRoute(userPos, destinationCoords);
    }
}

// ============================================================
//  STOP NAVIGATION
// ============================================================
function stopNavigation() {
    isNavigating      = false;
    destinationCoords = null;
    currentDestName   = '';
    currentSteps      = [];
    currentStepIndex  = 0;

    if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }

    window.speechSynthesis?.cancel();
    hideNavPanel();
}

// ============================================================
//  DRAW WALKING ROUTE — OSRM with steps + fallback
// ============================================================
async function drawWalkingRoute(userPos, destPos) {
    if (routeDrawPending) return;
    routeDrawPending = true;

    const url = `${OSRM_BASE}/${userPos.lng},${userPos.lat};${destPos.lng},${destPos.lat}?overview=full&geometries=geojson&steps=true&annotations=false`;

    try {
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

        const res  = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route');

        const route    = data.routes[0];
        const coords   = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const distM    = Math.round(route.distance);
        const walkSecs = Math.round(route.duration);

        // Collect all steps across all legs
        currentSteps = [];
        route.legs.forEach(leg => {
            if (leg.steps) currentSteps.push(...leg.steps);
        });

        if (routePolyline) map.removeLayer(routePolyline);

        routePolyline = L.polyline(coords, {
            color:    '#064e3b',
            weight:   6,
            opacity:  0.9,
            lineJoin: 'round',
            lineCap:  'round'
        }).addTo(map);

        // Update nav panel footer
        document.getElementById('nav-total-dist').textContent = formatDist(distM);
        document.getElementById('nav-eta-val').textContent    = formatETA(walkSecs);

        renderStepsList(currentSteps);

        // Speak first step
        if (currentSteps[0] && lastSpokenStep !== 0) {
            lastSpokenStep = 0;
            speak(getManeuverText(currentSteps[0]));
        }

    } catch (err) {
        if (err.name !== 'AbortError') console.warn('OSRM error:', err.message);
        showWarning('⚠️ Could not load full route. Showing straight-line path.');

        const distM = Math.round(userPos.distanceTo(destPos));
        document.getElementById('nav-total-dist').textContent = formatDist(distM);
        document.getElementById('nav-eta-val').textContent    = formatETA(distM / 1.2);
    }

    routeDrawPending = false;
}

// Instant dashed fallback shown while OSRM fetches
function drawFallbackLine(userPos, destPos) {
    if (routePolyline) map.removeLayer(routePolyline);
    routePolyline = L.polyline([userPos, destPos], {
        color:     '#064e3b',
        weight:    5,
        dashArray: '10, 15',
        opacity:   0.75
    }).addTo(map);
}

// ============================================================
//  GPS UPDATE
// ============================================================
function onGPSUpdate(pos) {
    const accuracy = pos.coords.accuracy;
    const userPos  = L.latLng(pos.coords.latitude, pos.coords.longitude);
    const heading  = pos.coords.heading;

    gpsReady = true;

    // Blue dot
    if (!userMarker) {
        userMarker = L.circleMarker(userPos, {
            radius: 10, fillColor: '#2196F3',
            color: 'white', weight: 3,
            fillOpacity: 1, zIndexOffset: 1000
        }).addTo(map);
        userMarker.bindTooltip(`📍 ±${Math.round(accuracy)}m accuracy`, { permanent: false, direction: 'top' });
    } else {
        userMarker.setLatLng(userPos);
        userMarker.setTooltipContent(`📍 ±${Math.round(accuracy)}m accuracy`);
    }

    // Heading arrow (only if device provides heading)
    if (heading !== null && !isNaN(heading)) {
        lastHeading = heading;
        const arrowHtml = `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:24px solid #2196F3;transform:rotate(${heading}deg);opacity:0.9;"></div>`;
        if (!userHeadingMarker) {
            userHeadingMarker = L.marker(userPos, {
                icon: L.divIcon({ className: '', html: arrowHtml, iconSize: [16, 24], iconAnchor: [8, 12] }),
                zIndexOffset: 999
            }).addTo(map);
        } else {
            userHeadingMarker.setLatLng(userPos);
            userHeadingMarker.setIcon(L.divIcon({ className: '', html: arrowHtml, iconSize: [16, 24], iconAnchor: [8, 12] }));
        }
    }

    // Accuracy circle
    if (!accuracyCircle) {
        accuracyCircle = L.circle(userPos, {
            radius: accuracy, color: '#2196F3',
            fillColor: '#2196F3', fillOpacity: 0.08, weight: 1
        }).addTo(map);
    } else {
        accuracyCircle.setLatLng(userPos);
        accuracyCircle.setRadius(accuracy);
    }

    if (!isNavigating || !destinationCoords) return;

    // First GPS fix after nav started — draw route now
    if (!routePolyline) {
        drawFallbackLine(userPos, destinationCoords);
        drawWalkingRoute(userPos, destinationCoords);
        return;
    }

    const distLeft = userPos.distanceTo(destinationCoords);

    // Arrived check
    if (distLeft <= ARRIVED_RADIUS_M) {
        triggerArrival();
        return;
    }

    // Update remaining distance
    document.getElementById('nav-total-dist').textContent = formatDist(Math.round(distLeft));

    // Update turn-by-turn step progress
    if (currentSteps.length) updateCurrentStep(userPos);

    // Redraw route periodically
    drawWalkingRoute(userPos, destinationCoords);
}

// ============================================================
//  ARRIVAL ANIMATION
// ============================================================
function triggerArrival() {
    speak(`You have arrived at ${currentDestName}. Enjoy!`);

    const dest = currentDestName;
    stopNavigation();

    // Show arrival banner
    let banner = document.getElementById('arrival-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'arrival-banner';
        banner.style.cssText = [
            'position:fixed', 'top:50%', 'left:50%',
            'transform:translate(-50%,-50%)',
            'background:#064e3b', 'color:white',
            'padding:30px 40px', 'border-radius:24px',
            'text-align:center', 'z-index:9999',
            'box-shadow:0 10px 40px rgba(0,0,0,0.4)',
            'font-family:Inter,sans-serif',
            'animation:fadeInPop 0.4s ease',
        ].join(';');
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        <div style="font-size:48px;margin-bottom:10px;">🎉</div>
        <div style="font-size:1.4rem;font-weight:800;">You Arrived!</div>
        <div style="font-size:0.9rem;margin-top:6px;opacity:0.85;">${dest}</div>
        <button onclick="document.getElementById('arrival-banner').remove()" style="margin-top:20px;background:#fbbf24;color:#064e3b;border:none;padding:10px 24px;border-radius:50px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">Got it!</button>
    `;

    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
}

// ============================================================
//  GPS ERROR
// ============================================================
function onGPSError(err) {
    const msg = {
        1: '❌ Location access denied. Enable it in browser settings.',
        2: '📡 GPS unavailable. Move outdoors and try again.',
        3: '⏱️ GPS signal slow. Move to an open area.'
    };
    showWarning(msg[err.code] || '❌ GPS error. Check your settings.');
}

// ============================================================
//  LIVE GPS TRACKING
// ============================================================
function startLiveTracking() {
    if (!navigator.geolocation) {
        showWarning('❌ Geolocation not supported by your browser.');
        return;
    }

    const hiAccuracy = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            onGPSUpdate(pos);
            navigator.geolocation.watchPosition(onGPSUpdate, onGPSError, hiAccuracy);
        },
        (err) => {
            onGPSError(err);
            navigator.geolocation.watchPosition(onGPSUpdate, onGPSError, hiAccuracy);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
}

// ============================================================
//  AUTOCOMPLETE SEARCH
// ============================================================
function buildAutocompleteData() {
    autocompleteList = allLocations.map(loc => ({ label: loc.name, loc }));
}

function setupAutocomplete(input) {
    let dropdown = document.getElementById('search-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'search-dropdown';
        dropdown.className = 'search-dropdown hidden';
        input.parentNode.parentNode.appendChild(dropdown);
    }

    input.addEventListener('input', () => {
        const val = input.value.toLowerCase().trim();
        dropdown.innerHTML = '';

        if (!val) {
            dropdown.classList.add('hidden');
            renderMarkers('all');
            return;
        }

        const matches = autocompleteList.filter(({ label, loc }) =>
            label.toLowerCase().includes(val) ||
            (loc.type && loc.type.toLowerCase().includes(val)) ||
            (loc.description && loc.description.toLowerCase().includes(val))
        ).slice(0, 6);

        if (!matches.length) {
            dropdown.classList.add('hidden');
            showWarning(`🔍 No results for "${input.value}".`);
            return;
        }

        matches.forEach(({ label, loc }) => {
            const item = document.createElement('div');
            item.className = 'search-dropdown-item';
            const style = TYPE_STYLE[loc.type] || { emoji: '📍' };
            item.innerHTML = `<span class="dd-icon">${style.emoji}</span><div class="dd-text"><span class="dd-name">${label}</span><span class="dd-type">${loc.type || ''}</span></div>`;
            item.addEventListener('click', () => {
                input.value = label;
                dropdown.classList.add('hidden');
                renderMarkers('all');
                handleLocationSelect(loc);
            });
            dropdown.appendChild(item);
        });

        // Also filter markers on map
        markersLayer.clearLayers();
        matches.forEach(({ loc }) => {
            const marker = L.marker([loc.lat, loc.lng], { icon: makeIcon(loc.type) });
            marker.bindTooltip(loc.name, { permanent: false, direction: 'top', offset: [0, -38] });
            marker.on('click', () => handleLocationSelect(loc));
            markersLayer.addLayer(marker);
        });

        dropdown.classList.remove('hidden');
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) {
            dropdown.classList.add('hidden');
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val   = input.value.toLowerCase().trim();
            const found = allLocations.find(l => l.name.toLowerCase().includes(val));
            dropdown.classList.add('hidden');
            if (found) handleLocationSelect(found);
            else showWarning(`🔍 No results for "${input.value}".`);
        }
    });
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    const searchInput = document.getElementById('map-search');
    setupAutocomplete(searchInput);

    document.getElementById('btn-reset').addEventListener('click', () => {
        map.flyTo([14.2560, 121.4050], 17);
        stopNavigation();
        document.getElementById('room-card').classList.remove('active');
        document.querySelectorAll('.quick-item').forEach(i => i.classList.remove('selected'));
        renderMarkers('all');
        searchInput.value = '';
        const dd = document.getElementById('search-dropdown');
        if (dd) dd.classList.add('hidden');
    });

    document.getElementById('btn-locate').addEventListener('click', () => {
        if (!navigator.geolocation) { showWarning('❌ Geolocation not supported.'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                onGPSUpdate(pos);
                map.flyTo(L.latLng(pos.coords.latitude, pos.coords.longitude), 18);
            },
            () => showWarning('❌ Could not get location. Make sure GPS is enabled.'),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    });
}

// ============================================================
//  WARNING TOAST
// ============================================================
function showWarning(msg) {
    let box = document.getElementById('lu-warning-toast');
    if (!box) {
        box = document.createElement('div');
        box.id = 'lu-warning-toast';
        box.style.cssText = [
            'position:fixed', 'top:76px', 'left:50%',
            'transform:translateX(-50%)',
            'background:#1a2e1f', 'color:#fff',
            'padding:10px 20px', 'border-radius:24px',
            'font-size:13px', 'font-family:Inter,sans-serif',
            'z-index:9999', 'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
            'max-width:340px', 'text-align:center',
            'pointer-events:none', 'transition:opacity 0.3s ease'
        ].join(';');
        document.body.appendChild(box);
    }
    box.innerText = msg;
    box.style.opacity = '1';
    box.style.display = 'block';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
        box.style.opacity = '0';
        setTimeout(() => { box.style.display = 'none'; }, 300);
    }, 4500);
}

// ============================================================
//  BOOT
// ============================================================
initMap();