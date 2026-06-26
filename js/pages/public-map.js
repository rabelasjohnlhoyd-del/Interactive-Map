// ============================================================
//  LU Navigator — public-map.js  (v3 — fixed 0m + route bugs)
//  - "..." shown while route is loading (not 0)
//  - Straight-line distance used as fallback while OSRM loads
//  - OSRM timeout: 8s, then fallback to straight line
//  - Route line always draws (OSRM or fallback dashed)
//  - Live GPS redraws route as you walk
//  - Arrived detection at 15m
// ============================================================

let map;
let userMarker        = null;
let accuracyCircle    = null;
let destinationCoords = null;
let routePolyline     = null;
let markersLayer      = L.layerGroup();
let allLocations      = [];
let isNavigating      = false;
let routeDrawPending  = false;
let currentDestName   = '';

// --- Campus Config ---
const CAMPUS_CENTER      = L.latLng(14.2560, 121.4050);
const CAMPUS_RADIUS_M    = 600;
const GPS_MAX_ACCURACY_M = 80;
const ARRIVED_RADIUS_M   = 15;
const OSRM_TIMEOUT_MS    = 8000; // fallback after 8s

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';

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
    } catch (err) {
        console.error('Error loading buildings.json:', err);
        showWarning('⚠️ Could not load campus data. Please refresh.');
    }

    setupEventListeners();
    startLiveTracking();
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
        const marker = L.marker([loc.lat, loc.lng]);
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
//  START NAVIGATION
// ============================================================
function startNavigation(lat, lng, name) {
    destinationCoords = L.latLng(lat, lng);
    isNavigating      = true;
    currentDestName   = name;

    const toast      = document.getElementById('distance-toast');
    const targetText = document.getElementById('target-name');
    const distEl     = document.getElementById('dist-value');

    if (targetText) targetText.innerText = `Heading to ${name}`;

    // Show "..." while route loads — never show 0
    if (distEl) distEl.innerText = '...';

    if (toast) {
        toast.classList.remove('hidden');
        toast.style.display = 'flex';
    }

    if (!userMarker) {
        showWarning('📡 Waiting for GPS signal. Make sure location is enabled.');
        // Will auto-draw when first GPS fix arrives in startLiveTracking
        return;
    }

    const userPos = userMarker.getLatLng();

    // Campus boundary check
    if (userPos.distanceTo(CAMPUS_CENTER) > CAMPUS_RADIUS_M) {
        showWarning(`📍 You may be outside campus. GPS might be off — try outdoors.`);
    }

    // Show straight-line distance immediately while OSRM loads
    const straightDist = Math.round(userPos.distanceTo(destinationCoords));
    if (distEl) distEl.innerText = formatDist(straightDist);
    drawFallbackLine(userPos, destinationCoords);

    // Then try to get real road route
    drawWalkingRoute(userPos, destinationCoords);
}

// ============================================================
//  STOP NAVIGATION
// ============================================================
function stopNavigation() {
    isNavigating      = false;
    destinationCoords = null;
    currentDestName   = '';

    if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }

    const toast = document.getElementById('distance-toast');
    if (toast) { toast.classList.add('hidden'); toast.style.display = 'none'; }

    const etaEl = document.getElementById('nav-eta');
    if (etaEl) etaEl.remove();
}

// ============================================================
//  DRAW WALKING ROUTE — OSRM with timeout & fallback
// ============================================================
async function drawWalkingRoute(userPos, destPos) {
    if (routeDrawPending) return;
    routeDrawPending = true;

    const url = `${OSRM_BASE}/${userPos.lng},${userPos.lat};${destPos.lng},${destPos.lat}?overview=full&geometries=geojson`;

    try {
        // Fetch with timeout
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

        const res  = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes?.length) {
            throw new Error('No route in OSRM response');
        }

        const route    = data.routes[0];
        const coords   = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const distM    = Math.round(route.distance);
        const walkMins = Math.ceil(route.duration / 60);

        // Replace fallback line with real route
        if (routePolyline) map.removeLayer(routePolyline);

        routePolyline = L.polyline(coords, {
            color:    '#064e3b',
            weight:   6,
            opacity:  0.9,
            lineJoin: 'round',
            lineCap:  'round'
        }).addTo(map);

        // Update distance with real road distance
        const distEl = document.getElementById('dist-value');
        if (distEl) distEl.innerText = formatDist(distM);

        updateETA(walkMins);

    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('OSRM timeout — using straight-line fallback');
        } else {
            console.warn('OSRM error:', err.message);
        }
        // Fallback is already drawn; just update distance label
        const distEl = document.getElementById('dist-value');
        if (distEl && userPos && destPos) {
            distEl.innerText = formatDist(Math.round(userPos.distanceTo(destPos)));
        }
    }

    routeDrawPending = false;
}

// Straight-line dashed fallback (shown immediately while OSRM loads)
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
//  HELPERS
// ============================================================
function formatDist(meters) {
    return meters >= 1000
        ? `${(meters / 1000).toFixed(1)}km`
        : `${meters}m`;
}

function updateETA(walkMins) {
    let etaEl = document.getElementById('nav-eta');
    if (!etaEl) {
        const toastBody = document.querySelector('.toast-body');
        if (toastBody) {
            etaEl    = document.createElement('div');
            etaEl.id = 'nav-eta';
            etaEl.style.cssText = 'font-size:11px;opacity:0.75;margin-top:2px;';
            toastBody.appendChild(etaEl);
        }
    }
    if (etaEl) etaEl.innerText = walkMins <= 1 ? '~1 min walk' : `~${walkMins} min walk`;
}

// ============================================================
//  LIVE GPS — redraws route as you walk
// ============================================================
function startLiveTracking() {
    if (!navigator.geolocation) {
        showWarning('❌ Geolocation not supported by your browser.');
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            const accuracy = pos.coords.accuracy;

            if (accuracy > GPS_MAX_ACCURACY_M) {
                showWarning(`📡 GPS weak (±${Math.round(accuracy)}m). Move outdoors for better signal.`);
                return;
            }

            const userPos = L.latLng(pos.coords.latitude, pos.coords.longitude);

            // Blue dot
            if (!userMarker) {
                userMarker = L.circleMarker(userPos, {
                    radius: 10, fillColor: '#2196F3',
                    color: 'white', weight: 3,
                    fillOpacity: 1, zIndexOffset: 1000
                }).addTo(map);
            } else {
                userMarker.setLatLng(userPos);
            }

            // Accuracy ring
            if (!accuracyCircle) {
                accuracyCircle = L.circle(userPos, {
                    radius: accuracy, color: '#2196F3',
                    fillColor: '#2196F3', fillOpacity: 0.10, weight: 1
                }).addTo(map);
            } else {
                accuracyCircle.setLatLng(userPos);
                accuracyCircle.setRadius(accuracy);
            }

            // If navigation just started but had no GPS yet — draw now
            if (isNavigating && destinationCoords && !routePolyline) {
                const straightDist = Math.round(userPos.distanceTo(destinationCoords));
                const distEl       = document.getElementById('dist-value');
                if (distEl) distEl.innerText = formatDist(straightDist);
                drawFallbackLine(userPos, destinationCoords);
                drawWalkingRoute(userPos, destinationCoords);
                return;
            }

            // Live redraw while navigating
            if (isNavigating && destinationCoords) {
                const distLeft = userPos.distanceTo(destinationCoords);

                if (distLeft <= ARRIVED_RADIUS_M) {
                    showWarning('🎉 You have arrived!');
                    stopNavigation();
                    return;
                }

                // Update distance label in real time (straight-line while OSRM loads)
                const distEl = document.getElementById('dist-value');
                if (distEl && distEl.innerText === '...') {
                    distEl.innerText = formatDist(Math.round(distLeft));
                }

                drawWalkingRoute(userPos, destinationCoords);
            }
        },
        (err) => {
            const msg = {
                1: '❌ Location access denied. Enable it in browser settings.',
                2: '📡 GPS unavailable. Move outdoors and try again.',
                3: '⏱️ GPS timed out. Retrying...'
            };
            showWarning(msg[err.code] || '❌ GPS error. Check your settings.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    const searchInput = document.getElementById('map-search');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val   = searchInput.value.toLowerCase().trim();
            const found = allLocations.find(l => l.name.toLowerCase().includes(val));
            found
                ? handleLocationSelect(found)
                : showWarning(`🔍 No results for "${searchInput.value}".`);
        }
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        map.flyTo([14.2560, 121.4050], 17);
        stopNavigation();
        document.getElementById('room-card').classList.remove('active');
        document.querySelectorAll('.quick-item').forEach(i => i.classList.remove('selected'));
    });

    document.getElementById('btn-locate').addEventListener('click', () => {
        navigator.geolocation
            ? navigator.geolocation.getCurrentPosition(
                (pos) => map.flyTo(L.latLng(pos.coords.latitude, pos.coords.longitude), 18),
                ()    => showWarning('❌ Could not get location. Make sure GPS is enabled.'),
                { enableHighAccuracy: true }
              )
            : showWarning('❌ Geolocation not supported.');
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