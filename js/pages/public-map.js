// ============================================================
//  LU Navigator — public-map.js (v15)
//  Brighter, more vivid map — filter tuned for max visibility
// ============================================================

let map;
let tileLayer         = null;
let userMarker        = null;
let accuracyCircle    = null;
let destinationCoords = null;
let routePolyline     = null;
let routeOutline      = null;
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
let routeRefreshTimer = null;
let isDarkMode        = false;

let lastSpeedPos    = null;
let lastSpeedTime   = null;
let currentSpeedKph = 0;
let currentTravelMode = 'walking';

const CAMPUS_CENTER    = L.latLng(14.2560, 121.4050);
const CAMPUS_RADIUS_M  = 600;
const ARRIVED_RADIUS_M = 15;
const STEP_ADVANCE_M   = 18;
const OSRM_TIMEOUT_MS  = 8000;
const ROUTE_REFRESH_MS = 8000;
const OSRM_BASE        = 'https://router.project-osrm.org/route/v1/foot';

// Known campus gates — used to force routing through the correct entrance
// when OSM road data doesn't reflect actual internal walkways.
const CAMPUS_GATES = [
    { name: 'Gate 1', lat: 14.25557, lng: 121.40067 },
    { name: 'Gate 2', lat: 14.25626, lng: 121.40779 },
];

// User-selected entrance gate preference. 'auto' = let the app pick the
// nearest/most sensible gate automatically. Otherwise, always force routes
// through the named gate regardless of which gate is actually closer.
let preferredGateName = localStorage.getItem('lu-pref-gate') || 'auto';
function getPreferredGateObj() {
    if (preferredGateName === 'auto') return null;
    return CAMPUS_GATES.find(g => g.name === preferredGateName) || null;
}

// Pick the gate closer to the user as a routing waypoint, but only if the
// destination is also reasonably close to that same gate (so we don't force
// a detour for destinations clearly served by the other gate).
function pickRoutingGate(userPos, destPos) {
    // If the user manually selected an entrance gate, always force it.
    const forced = getPreferredGateObj();
    if (forced) return L.latLng(forced.lat, forced.lng);
    if (!CAMPUS_GATES.length) return null;
    let best = null, bestUserDist = Infinity;
    for (const g of CAMPUS_GATES) {
        const gLatLng = L.latLng(g.lat, g.lng);
        const dUser = userPos.distanceTo(gLatLng);
        if (dUser < bestUserDist) { bestUserDist = dUser; best = { ...g, gLatLng, dUser }; }
    }
    if (!best) return null;
    // Only force the waypoint if user is meaningfully close to a gate
    // and the destination isn't already closer to a different gate.
    let destNearestDist = Infinity;
    for (const g of CAMPUS_GATES) {
        const d = destPos.distanceTo(L.latLng(g.lat, g.lng));
        if (d < destNearestDist) destNearestDist = d;
    }
    const destDistToBestGate = destPos.distanceTo(best.gLatLng);
    // If user is within 80m of their nearest gate AND that gate isn't
    // drastically farther from the destination than the destination's
    // own nearest gate, use it as a via-point.
    if (best.dUser <= 80 && destDistToBestGate <= destNearestDist + 250) {
        return best.gLatLng;
    }
    return null;
}

// ── Walking speed constants (realistic campus pedestrian speeds) ──
const WALK_SPEED_MPS   = 1.25;  // avg walking  ~4.5 km/h
const RUN_SPEED_MPS    = 2.8;   // avg running  ~10 km/h
const MOTO_SPEED_MPS   = 8.3;   // motorcycle   ~30 km/h (campus)
const CAR_SPEED_MPS    = 8.3;   // car on campus ~30 km/h

// Remaining route tracking
let remainingDistM     = 0;  // metres left along the actual path
let totalRouteDistM    = 0;  // full route distance from OSRM
let routeCoords        = [];  // full polyline coords of the ACTIVE/main route [[lat,lng],...]
let navStartTime       = null;

// Alternative routes support — main route is bright, others are dimmed.
// When the user's position is closer to an alternate route than the
// current main route, that alternate is promoted to main (brightened)
// and the old main is dimmed in its place.
let allRouteOptions    = [];  // [{ coords:[[lat,lng],...], steps:[...], distance, duration, polyline, outline }]
let activeRouteIndex   = 0;
const ALT_ROUTE_OPACITY     = 0.35;
const ALT_ROUTE_OUTLINE_OP  = 0.25;
const MAIN_ROUTE_OPACITY    = 1;
const ROUTE_SWITCH_MARGIN_M = 12; // alt must be at least this much closer to switch (avoids flicker)

// ── Tile config ───────────────────────────────────────────────
// Light: full brightness, boosted saturation & contrast so
//        roads, parks and buildings pop with vivid colour.
// Dark:  slightly lifted so labels stay readable.
const TILES = {
    light: {
        url:    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        filter: 'brightness(0.78) contrast(1.15) saturate(1.65) hue-rotate(0deg)',
    },
    dark: {
        url:    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        filter: 'brightness(0.92) contrast(1.12) saturate(1.30)',
    },
};

const TRAVEL_MODES = [
    { key: 'walking',    label: 'Walking',    icon: '🚶', maxKph: 7  },
    { key: 'running',    label: 'Running',    icon: '🏃', maxKph: 20 },
    { key: 'motorcycle', label: 'Motorcycle', icon: '🛵', maxKph: 60 },
    { key: 'car',        label: 'In Car',     icon: '🚗', maxKph: Infinity },
];
function detectTravelMode(k) {
    for (const m of TRAVEL_MODES) if (k <= m.maxKph) return m;
    return TRAVEL_MODES[TRAVEL_MODES.length - 1];
}
function updateSpeedBadge(k, m) {
    const b = document.getElementById('nav-speed-badge');
    if (b) b.textContent = `${m.icon} ${Math.round(k)} km/h`;
}

const MANEUVER_SVG = {
    straight:      `<svg viewBox="0 0 24 24" fill="white"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`,
    left:          `<svg viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
    right:         `<svg viewBox="0 0 24 24" fill="white"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" transform="scale(-1,1) translate(-24,0)"/></svg>`,
    'slight-left': `<svg viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" transform="rotate(-45 12 12)"/></svg>`,
    'slight-right':`<svg viewBox="0 0 24 24" fill="white"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" transform="rotate(45 12 12) scale(-1,1) translate(-24,0)"/></svg>`,
    'sharp-left':  `<svg viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" transform="rotate(45 12 12)"/></svg>`,
    'sharp-right': `<svg viewBox="0 0 24 24" fill="white"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" transform="rotate(-45 12 12) scale(-1,1) translate(-24,0)"/></svg>`,
    uturn:         `<svg viewBox="0 0 24 24" fill="white"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`,
    arrive:        `<svg viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    depart:        `<svg viewBox="0 0 24 24" fill="white"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/></svg>`,
    roundabout:    `<svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`,
};
function getManeuverSVG(step) {
    const mod=(step.maneuver?.modifier||'').replace(' ','-'), t=step.maneuver?.type||'straight';
    if (t==='arrive')  return MANEUVER_SVG.arrive;
    if (t==='depart')  return MANEUVER_SVG.depart;
    if (t==='roundabout'||t==='rotary') return MANEUVER_SVG.roundabout;
    if (t==='uturn')   return MANEUVER_SVG.uturn;
    return MANEUVER_SVG[mod]||MANEUVER_SVG.straight;
}
function getManeuverEmoji(step) {
    const mod=step.maneuver?.modifier||'', t=step.maneuver?.type||'';
    if (t==='arrive')  return '🏁';
    if (t==='depart')  return '🚶';
    if (t==='roundabout'||t==='rotary') return '🔄';
    if (t==='uturn')   return '↩️';
    if (mod==='left'||mod==='sharp left')   return '↰';
    if (mod==='right'||mod==='sharp right') return '↱';
    if (mod==='slight left')  return '↖';
    if (mod==='slight right') return '↗';
    return '⬆';
}
function getManeuverText(step) {
    const t=step.maneuver?.type||'', mod=step.maneuver?.modifier||'';
    const on=step.name?` on ${step.name}`:'';
    if (t==='depart')  return 'Start walking'+on;
    if (t==='arrive')  return `Arrive at ${currentDestName}`;
    if (t==='roundabout'||t==='rotary') return 'Take the roundabout';
    if (t==='uturn')   return 'Make a U-turn';
    if (mod==='straight'||t==='straight') return 'Continue straight'+on;
    if (mod==='left')         return 'Turn left'+on;
    if (mod==='right')        return 'Turn right'+on;
    if (mod==='slight left')  return 'Keep slightly left'+on;
    if (mod==='slight right') return 'Keep slightly right'+on;
    if (mod==='sharp left')   return 'Turn sharp left'+on;
    if (mod==='sharp right')  return 'Turn sharp right'+on;
    return 'Continue'+on;
}
function formatDist(m) {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    if (m >= 100)  return `${Math.round(m / 10) * 10} m`;
    return `${Math.round(m)} m`;
}

// Accurate speed selector: prefers real GPS speed, falls back to mode default
function getSpeedMps(travelMode, measuredKph) {
    if (measuredKph > 0.8) return measuredKph / 3.6;
    switch (travelMode) {
        case 'running':    return 2.8;   // ~10 km/h
        case 'motorcycle': return 8.3;   // ~30 km/h campus limit
        case 'car':        return 8.3;
        default:           return 1.25;  // walking ~4.5 km/h
    }
}

// Walk along the saved routeCoords to find true remaining distance
function calcRemainingDist(userPos) {
    if (!routeCoords.length) {
        return destinationCoords ? userPos.distanceTo(destinationCoords) : 0;
    }
    let minDist = Infinity, minIdx = 0;
    for (let i = 0; i < routeCoords.length; i++) {
        const d = userPos.distanceTo(L.latLng(routeCoords[i][0], routeCoords[i][1]));
        if (d < minDist) { minDist = d; minIdx = i; }
    }
    let rem = 0;
    for (let i = minIdx; i < routeCoords.length - 1; i++) {
        rem += L.latLng(routeCoords[i][0], routeCoords[i][1])
                 .distanceTo(L.latLng(routeCoords[i + 1][0], routeCoords[i + 1][1]));
    }
    return Math.max(rem, 0);
}

function formatETA(seconds) {
    const m = Math.ceil(seconds / 60);
    if (m < 1)  return '< 1 min';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatArrivalClock(seconds) {
    const arr = new Date(Date.now() + seconds * 1000);
    let h = arr.getHours(), min = arr.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(min).padStart(2, '0')} ${ampm}`;
}

function updateETADisplay(remainingMetres) {
    const speedMps = getSpeedMps(currentTravelMode, currentSpeedKph);
    const secs     = remainingMetres / speedMps;
    const etaEl    = document.getElementById('nav-eta-val');
    const distEl   = document.getElementById('nav-total-dist');
    if (etaEl) etaEl.textContent = `${formatETA(secs)} (${formatArrivalClock(secs)})`;
    if (distEl) distEl.textContent = formatDist(Math.round(remainingMetres));
}

let lastSpokenStep=-1, preferredVoice=null;
function loadVoice() {
    if (!window.speechSynthesis) return;
    const try_=()=>{
        const v=window.speechSynthesis.getVoices();
        preferredVoice=v.find(x=>x.lang==='en-PH')||v.find(x=>x.lang.startsWith('en')&&x.name.toLowerCase().includes('female'))||v.find(x=>x.lang.startsWith('en'))||null;
    };
    if (window.speechSynthesis.getVoices().length) try_();
    else window.speechSynthesis.addEventListener('voiceschanged',try_,{once:true});
}
function speak(text) {
    if (!speechEnabled||!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang='en-PH'; u.rate=1.05; u.pitch=1.0; u.volume=1.0;
    if (preferredVoice) u.voice=preferredVoice;
    window.speechSynthesis.speak(u);
}

function applyTheme(dark) {
    isDarkMode = dark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('lu-theme', dark ? 'dark' : 'light');

    const cfg = dark ? TILES.dark : TILES.light;
    const pane = map.getPane('tilePane');

    // Load new tile layer underneath, then crossfade
    const newLayer = L.tileLayer(cfg.url, {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
        opacity: 0,
    }).addTo(map);
    newLayer.setZIndex(0);

    // Once enough tiles are ready, fade old out / new in
    const doSwap = () => {
        if (tileLayer) {
            const oldLayer = tileLayer;
            let op = 1;
            const fadeOut = setInterval(() => {
                op = Math.max(0, op - 0.15);
                oldLayer.setOpacity(op);
                if (op <= 0) { clearInterval(fadeOut); map.removeLayer(oldLayer); }
            }, 16);
        }
        let op2 = 0;
        const fadeIn = setInterval(() => {
            op2 = Math.min(1, op2 + 0.15);
            newLayer.setOpacity(op2);
            if (op2 >= 1) clearInterval(fadeIn);
        }, 16);
        tileLayer = newLayer;
        pane.style.filter = cfg.filter;
    };

    newLayer.once('load', doSwap);
    // Fallback: swap anyway after 600ms if tiles are slow
    setTimeout(() => { if (tileLayer !== newLayer) doSwap(); }, 600);

    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        btn.innerHTML = dark
            ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg> Light Mode`
            : `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0zM7.05 18.36l-1.06 1.06a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0z"/></svg> Dark Mode`;
    }
    const activePill = document.querySelector('.f-pill.active');
    renderMarkers(activePill ? activePill.dataset.filter : 'all');
}
window.toggleTheme=function(){applyTheme(!isDarkMode);};

async function initMap() {
    map=L.map('map',{zoomControl:false,maxZoom:19}).setView([14.2560,121.4050],17);
    const savedTheme=localStorage.getItem('lu-theme')||'light';
    isDarkMode=savedTheme==='dark';
    document.documentElement.setAttribute('data-theme',savedTheme);
    const cfg=isDarkMode?TILES.dark:TILES.light;
    tileLayer=L.tileLayer(cfg.url,{attribution:'© OpenStreetMap contributors © CARTO',subdomains:'abcd',maxZoom:19}).addTo(map);
    map.getPane('tilePane').style.filter=cfg.filter;
    markersLayer.addTo(map);
    L.control.zoom({position:'bottomright'}).addTo(map);
    try {
        const res=await fetch('js/data/buildings.json');
        allLocations=await res.json();
        window._allBuildings=allLocations;
        renderMarkers('all');
        buildAutocompleteData();
    } catch(err) {
        console.error('Error loading buildings.json:',err);
        showToast('⚠️ Could not load campus data. Please refresh.','error');
    }
    window._mapInstance=map;
    loadVoice();
    injectNavPanel();
    injectGateSelector();
    setupEventListeners();
    startLiveTracking();
    setTimeout(()=>applyTheme(isDarkMode),100);
}

const TYPE_STYLE_LIGHT={office:{color:'#0d47a1',emoji:'🏢'},classroom:{color:'#1565c0',emoji:'📚'},lab:{color:'#6a1b9a',emoji:'🔬'},gym:{color:'#bf360c',emoji:'🏋️'},gate:{color:'#00695c',emoji:'🚪'},canteen:{color:'#ad1457',emoji:'🍴'},landmark:{color:'#37474f',emoji:'🗿'}};
const TYPE_STYLE_DARK= {office:{color:'#90caf9',emoji:'🏢'},classroom:{color:'#9fa8da',emoji:'📚'},lab:{color:'#ce93d8',emoji:'🔬'},gym:{color:'#ffab91',emoji:'🏋️'},gate:{color:'#80cbc4',emoji:'🚪'},canteen:{color:'#f48fb1',emoji:'🍴'},landmark:{color:'#b0bec5',emoji:'🗿'}};
let TYPE_STYLE=TYPE_STYLE_LIGHT;

function makeIcon(type,name) {
    TYPE_STYLE=isDarkMode?TYPE_STYLE_DARK:TYPE_STYLE_LIGHT;
    let s={...(TYPE_STYLE[type]||{color:'#37474f',emoji:'📍'})};
    if (name){const n=name.toLowerCase();if(n.includes('pool'))s.emoji='🏊';else if(n.includes('san luis'))s.emoji='🏀';else if(n.includes('multi'))s.emoji='🏐';}
    const shadow=isDarkMode?'0 3px 12px rgba(0,0,0,0.85),0 1px 4px rgba(0,0,0,0.6)':'0 3px 10px rgba(0,0,0,0.55),0 1px 3px rgba(0,0,0,0.35)';
    return L.divIcon({className:'',html:`<div style="position:relative;width:34px;height:44px;"><div style="width:34px;height:34px;background:${s.color};border:3.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:${shadow};"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;padding-bottom:2px;">${s.emoji}</div></div></div>`,iconSize:[34,44],iconAnchor:[17,44],popupAnchor:[0,-46]});
}
function makeDestIcon() {
    return L.divIcon({className:'',html:`<div style="position:relative;width:38px;height:50px;"><div style="width:38px;height:38px;background:#c62828;border:4px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 14px rgba(198,40,40,0.7),0 1px 4px rgba(0,0,0,0.4);"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;padding-bottom:2px;">📍</div></div></div>`,iconSize:[38,50],iconAnchor:[19,50],popupAnchor:[0,-52]});
}
let destMarker=null;

function renderMarkers(category) {
    markersLayer.clearLayers();
    const filtered=category==='all'?allLocations:allLocations.filter(l=>l.type===category);
    filtered.forEach(loc=>{
        const m=L.marker([loc.lat,loc.lng],{icon:makeIcon(loc.type,loc.name)});
        m.bindTooltip(loc.name,{permanent:false,direction:'top',offset:[0,-46],className:'lu-tooltip'});
        m.on('click',()=>handleLocationSelect(loc));
        markersLayer.addLayer(m);
    });
}

function getOpenStatus(hoursStr) {
    if (!hoursStr) return null;
    const h=hoursStr.toLowerCase();
    if (h.includes('24/7')||h.includes('open area')||h.includes('resident')) return {open:true,label:hoursStr};
    if (h.includes('depends')) return {open:null,label:'Schedule Varies'};
    const now=new Date(),nowMins=now.getHours()*60+now.getMinutes();
    const match=hoursStr.match(/(\d+):(\d+)\s*(AM|PM)\s*[-–]\s*(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let [,sh,sm,sap,eh,em,eap]=match;
    sh=+sh;sm=+sm;eh=+eh;em=+em;
    if (sap.toUpperCase()==='PM'&&sh!==12) sh+=12;
    if (sap.toUpperCase()==='AM'&&sh===12) sh=0;
    if (eap.toUpperCase()==='PM'&&eh!==12) eh+=12;
    if (eap.toUpperCase()==='AM'&&eh===12) eh=0;
    return {open:nowMins>=sh*60+sm&&nowMins<eh*60+em,label:hoursStr};
}

function getFavorites(){try{return JSON.parse(localStorage.getItem('lu-favorites')||'[]');}catch{return[];}}
function toggleFavorite(id){let f=getFavorites(),idx=f.indexOf(id);if(idx>-1)f.splice(idx,1);else f.push(id);localStorage.setItem('lu-favorites',JSON.stringify(f));return idx===-1;}
function isFavorite(id){return getFavorites().includes(id);}
function addRecentlyViewed(loc){try{let r=JSON.parse(localStorage.getItem('lu-recent')||'[]');r=r.filter(x=>x.id!==loc.id);r.unshift({id:loc.id,name:loc.name,type:loc.type,lat:loc.lat,lng:loc.lng});if(r.length>5)r=r.slice(0,5);localStorage.setItem('lu-recent',JSON.stringify(r));}catch{}}

function buildFloorsHTML(floors) {
    if (!floors||!floors.length) return `<div class="card-no-floors">No floor information available.</div>`;
    return floors.map((floor,idx)=>{
        const fac=floor.faculty?`<div class="card-faculty"><div class="card-faculty-avatar">${floor.faculty.photo?`<img src="${floor.faculty.photo}" alt="${floor.faculty.name}" onerror="this.parentNode.innerHTML='${floor.faculty.name.charAt(0)}'"/>`:floor.faculty.name.charAt(0)}</div><div class="card-faculty-info"><span class="card-faculty-name">${floor.faculty.name}</span><span class="card-faculty-pos">${floor.faculty.position||''}</span></div></div>`:'';
        const rooms=(floor.rooms&&floor.rooms.length)?`<div class="card-rooms-list">${floor.rooms.map(r=>`<div class="card-room-item ${r.isFaculty?'is-faculty':''}"><span class="card-room-icon">${r.isFaculty?'👨‍🏫':'🚪'}</span><div class="card-room-body"><span class="card-room-name">${r.name}</span>${r.description?`<span class="card-room-desc">${r.description}</span>`:''}</div>${r.isFaculty?'<span class="card-room-badge">Faculty</span>':''}</div>`).join('')}</div>`:'';
        const col=floor.colleges?`<div class="card-floor-college">${floor.colleges}</div>`:'';
        return `<div class="card-floor-item ${idx===0?'open':''}"><div class="card-floor-header" onclick="toggleCardFloor(this)"><div class="card-floor-header-left"><span class="card-floor-icon">🏢</span><span class="card-floor-name">${floor.name}</span></div><span class="card-floor-chevron">›</span></div><div class="card-floor-body">${col}${fac}${rooms}</div></div>`;
    }).join('');
}
window.toggleCardFloor=function(h){const item=h.parentElement,open=item.classList.contains('open');item.parentElement.querySelectorAll('.card-floor-item').forEach(e=>e.classList.remove('open'));if(!open)item.classList.add('open');};
window.switchCardTab=function(btn,id){const c=btn.closest('.room-card');c.querySelectorAll('.card-tab-btn').forEach(b=>b.classList.remove('active'));c.querySelectorAll('.card-tab-pane').forEach(p=>p.classList.remove('active'));btn.classList.add('active');c.querySelector(`#${id}`)?.classList.add('active');};

function handleLocationSelect(loc) {
    if (!loc) return;
    addRecentlyViewed(loc);
    map.flyTo([loc.lat-0.0003,loc.lng],18,{animate:true,duration:1.2});
    const card=document.getElementById('room-card');
    const typeLabel={office:'Office',classroom:'Classroom',lab:'Laboratory',gym:'Gym / Sports',gate:'Gate',canteen:'Canteen',landmark:'Landmark'}[loc.type]||loc.type||'Location';
    const status=getOpenStatus(loc.hours);
    const favored=isFavorite(loc.id||loc.name);
    const hasFloors=loc.floors&&loc.floors.length>0;
    let statusBadge='';
    if (status){
        if (status.open===true)       statusBadge=`<span class="card-status open">● Open Now</span>`;
        else if (status.open===false) statusBadge=`<span class="card-status closed">● Closed</span>`;
        else                          statusBadge=`<span class="card-status varies">● ${status.label}</span>`;
    }
    const imgHTML=(loc.image&&loc.image.trim())?`<img id="card-img" src="${loc.image}" alt="${loc.name}" onerror="this.parentNode.style.display='none'">`:'';
    const floorsTab=hasFloors?`<button class="card-tab-btn" onclick="switchCardTab(this,'card-tab-floors')">🏢 Floors</button>`:'';
    const floorsPane=hasFloors?`<div class="card-tab-pane" id="card-tab-floors">${buildFloorsHTML(loc.floors)}</div>`:'';
    const safeId=(loc.id||loc.name).replace(/'/g,"\\'");
    const safeName=loc.name.replace(/'/g,"\\'");
    card.innerHTML=`
        <div class="card-drag-handle"></div>
        ${loc.image?`<div class="card-image-section"><button class="close-card-btn" onclick="closeCard()">✕</button><button class="card-fav-btn ${favored?'active':''}" onclick="handleFavBtn(this,'${safeId}','${safeName}')">${favored?'❤️':'🤍'}</button>${imgHTML}</div>`:`<div class="card-no-image-header"><button class="close-card-btn" onclick="closeCard()">✕</button><button class="card-fav-btn ${favored?'active':''}" onclick="handleFavBtn(this,'${safeId}','${safeName}')">${favored?'❤️':'🤍'}</button></div>`}
        <div class="card-details">
            <div class="card-details-top">
                <h2>${loc.name}</h2>
                <div class="card-meta-row"><span class="room-tag">${typeLabel}</span>${statusBadge}</div>
                ${loc.hours?`<div class="card-hours"><svg viewBox="0 0 24 24" width="13" height="13" fill="#6b7280" style="vertical-align:middle;margin-right:4px"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>${loc.hours}</div>`:''}
            </div>
            <div class="card-tabs"><button class="card-tab-btn active" onclick="switchCardTab(this,'card-tab-info')">Info</button>${floorsTab}</div>
            <div class="card-tab-content">
                <div class="card-tab-pane active" id="card-tab-info"><p id="card-desc">${loc.description||'No description available.'}</p>${loc.tags?.length?`<div class="card-tags-row">${loc.tags.map(t=>`<span class="card-chip">${t}</span>`).join('')}</div>`:''}</div>
                ${floorsPane}
            </div>
            <div class="card-actions">
                <button class="nav-btn" onclick="startNavigation(${loc.lat},${loc.lng},'${safeName}');closeCard();">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M21.71 11.29l-9-9a1 1 0 00-1.42 0l-9 9a1 1 0 000 1.42l9 9a1 1 0 001.42 0l9-9a1 1 0 000-1.42zM14 14.5V12h-4v3H8v-4a1 1 0 011-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>
                    <span>Directions</span>
                </button>
            </div>
        </div>`;
    card.classList.remove('active');
    requestAnimationFrame(()=>requestAnimationFrame(()=>card.classList.add('active')));
}
window.closeCard=function(){document.getElementById('room-card').classList.remove('active');};
window.handleFavBtn=function(btn,id,name){const n=toggleFavorite(id);btn.textContent=n?'❤️':'🤍';btn.classList.toggle('active',n);showToast(n?'Saved to Favorites':'Removed from Favorites');};
window.filterMarkers=function(cat,btn){renderMarkers(cat);document.getElementById('room-card').classList.remove('active');document.querySelectorAll('.f-pill').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');};

function injectNavPanel() {
    if (document.getElementById('nav-panel')) return;
    const p=document.createElement('div');
    p.id='nav-panel'; p.className='nav-panel hidden';
    p.innerHTML=`
        <div class="nav-banner" id="nav-banner">
            <div class="nav-banner-icon" id="nav-turn-icon"><svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></div>
            <div class="nav-banner-body">
                <div class="nav-dist-to-turn" id="nav-step-dist">—</div>
                <div class="nav-step-text" id="nav-step-text">Starting navigation…</div>
            </div>
            <div class="nav-banner-btns">
                <button class="nav-icon-btn" id="nav-voice-btn" title="Toggle Voice"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></button>
                <button class="nav-icon-btn" id="nav-close-btn" title="Exit Navigation"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
            </div>
        </div>
        <div class="nav-next-turn" id="nav-next-turn" style="display:none">
            <span class="nav-next-label">Then</span>
            <span class="nav-next-icon" id="nav-next-icon">↰</span>
            <span class="nav-next-text" id="nav-next-text">—</span>
        </div>
        <div class="nav-footer">
            <div class="nav-footer-eta"><span class="nav-eta-time" id="nav-eta-val">—</span><span class="nav-eta-label">ETA</span></div>
            <div class="nav-footer-mid"><span class="nav-total-dist" id="nav-total-dist">—</span><span class="nav-dest-label" id="nav-dest-name">—</span></div>
            <div class="nav-footer-speed"><span class="nav-speed-val" id="nav-speed-badge">0</span><span class="nav-speed-unit">km/h</span></div>
        </div>
        <div class="nav-progress-bar"><div class="nav-progress-fill" id="nav-progress-fill" style="width:0%"></div></div>
        <div id="nav-steps-list" style="display:none"></div>`;
    document.querySelector('.main-content').appendChild(p);
    document.getElementById('nav-close-btn').addEventListener('click',stopNavigation);
    document.getElementById('nav-voice-btn').addEventListener('click',()=>{
        speechEnabled=!speechEnabled;
        const btn=document.getElementById('nav-voice-btn');
        btn.classList.toggle('muted',!speechEnabled);
        btn.innerHTML=speechEnabled
            ?`<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`
            :`<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
        showToast(speechEnabled?'Voice guidance on':'Voice guidance off');
        if (speechEnabled&&currentSteps[currentStepIndex]) speak(getManeuverText(currentSteps[currentStepIndex]));
    });
}

// Floating pill control letting the user force navigation through a
// specific campus entrance gate, or leave it on 'Auto' to let the app pick.
function injectGateSelector() {
    let wrap = document.getElementById('gate-selector');
    const gates = ['auto', ...CAMPUS_GATES.map(g => g.name)];
    const html = gates.map(name => {
        const label = name === 'auto' ? '🧭 Auto' : `🚪 ${name}`;
        const isActive = preferredGateName === name;
        return `<button class="gate-pill" data-gate="${name}" style="border:none;background:${isActive ? '#1565c0' : 'transparent'};color:${isActive ? 'white' : 'var(--text-primary,#202124)'};padding:7px 14px;border-radius:50px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;">${label}</button>`;
    }).join('');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'gate-selector';
        wrap.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:850;background:var(--card-bg,white);border-radius:50px;padding:5px;box-shadow:0 4px 16px rgba(0,0,0,0.25);display:flex;gap:4px;font-family:Roboto,Inter,sans-serif;';
        document.body.appendChild(wrap);
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('.gate-pill').forEach(btn => {
        btn.addEventListener('click', () => setPreferredGate(btn.dataset.gate));
    });
}
window.setPreferredGate = function(name) {
    preferredGateName = name;
    localStorage.setItem('lu-pref-gate', name);
    injectGateSelector();
    showToast(name === 'auto' ? '🧭 Auto-select entrance gate' : `🚪 Routing via ${name}`);
    if (isNavigating && userMarker && destinationCoords) {
        drawWalkingRoute(userMarker.getLatLng(), destinationCoords);
    }
};

function showNavPanel(){document.getElementById('nav-panel')?.classList.remove('hidden');const t=document.getElementById('distance-toast');if(t){t.classList.add('hidden');t.style.display='none';}document.getElementById('room-card')?.classList.remove('active');}
function hideNavPanel(){document.getElementById('nav-panel')?.classList.add('hidden');}

function renderStepsList(steps){const list=document.getElementById('nav-steps-list');if(!list)return;list.innerHTML='';steps.forEach((s,i)=>{const d=document.createElement('div');d.className=`nav-step-item${i===0?' active':''}`;d.id=`step-item-${i}`;list.appendChild(d);});}

function updateCurrentStep(userPos) {
    if (!currentSteps.length) return;
    let ni=currentStepIndex,nd=Infinity;
    for (let i=currentStepIndex;i<currentSteps.length;i++){const s=currentSteps[i];if(!s.maneuver?.location)continue;const[lng,lat]=s.maneuver.location,d=userPos.distanceTo(L.latLng(lat,lng));if(d<nd){nd=d;ni=i;}}
    if (nd<STEP_ADVANCE_M&&ni+1<currentSteps.length) ni++;
    if (ni!==currentStepIndex){currentStepIndex=ni;if(currentStepIndex!==lastSpokenStep){lastSpokenStep=currentStepIndex;speak(getManeuverText(currentSteps[currentStepIndex]));}document.querySelectorAll('.nav-step-item').forEach((el,i)=>{el.classList.toggle('active',i===currentStepIndex);el.classList.toggle('done',i<currentStepIndex);});}
    const step=currentSteps[currentStepIndex];
    if (step){
        document.getElementById('nav-turn-icon').innerHTML=getManeuverSVG(step);
        document.getElementById('nav-step-text').textContent=getManeuverText(step);
        document.getElementById('nav-step-dist').textContent=formatDist(nd<9999?nd:step.distance);
        const next=currentSteps[currentStepIndex+1],nextEl=document.getElementById('nav-next-turn');
        if (next&&next.maneuver?.type!=='arrive'){document.getElementById('nav-next-icon').textContent=getManeuverEmoji(next);document.getElementById('nav-next-text').textContent=getManeuverText(next);nextEl.style.display='flex';}
        else{nextEl.style.display='none';}
    }
    const fill=document.getElementById('nav-progress-fill');
    if (fill) fill.style.width=`${currentSteps.length>1?Math.min(100,(currentStepIndex/(currentSteps.length-1))*100):0}%`;
}

function startNavigation(lat,lng,name) {
    destinationCoords=L.latLng(lat,lng);isNavigating=true;currentDestName=name;currentStepIndex=0;lastSpokenStep=-1;
    if (destMarker) map.removeLayer(destMarker);
    destMarker=L.marker([lat,lng],{icon:makeDestIcon(),zIndexOffset:1500}).addTo(map);
    document.getElementById('nav-dest-name').textContent=name;
    document.getElementById('nav-total-dist').textContent='…';
    document.getElementById('nav-eta-val').textContent='…';
    document.getElementById('nav-step-dist').textContent='…';
    document.getElementById('nav-step-text').textContent=`To ${name}`;
    showNavPanel();
    speak(`Starting navigation to ${name}`);
    if (gpsReady&&userMarker){
        const u=userMarker.getLatLng();
        map.flyTo(u,18,{animate:true,duration:1.2});
        if (u.distanceTo(CAMPUS_CENTER)>CAMPUS_RADIUS_M) showToast('You may be outside campus.','warn');
        drawFallbackLine(u,destinationCoords);
        drawWalkingRoute(u,destinationCoords);
    } else if (navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos=>{onGPSUpdate(pos);const fp=L.latLng(pos.coords.latitude,pos.coords.longitude);map.flyTo(fp,18,{animate:true,duration:1.2});drawFallbackLine(fp,destinationCoords);drawWalkingRoute(fp,destinationCoords);},()=>showToast('📡 Could not get your location.','warn'),{enableHighAccuracy:true,timeout:8000,maximumAge:3000});
    }
}

function stopNavigation(){
    isNavigating=false;destinationCoords=null;currentDestName='';currentSteps=[];currentStepIndex=0;
    routeCoords=[];totalRouteDistM=0;remainingDistM=0;navStartTime=null;
    clearTimeout(routeRefreshTimer);
    clearRouteLayers();
    activeRouteIndex=0;
    if(destMarker){map.removeLayer(destMarker);destMarker=null;}
    window.speechSynthesis?.cancel();
    hideNavPanel();
}

// Force a second OSRM route by inserting a midpoint detour waypoint offset
// perpendicular to the direct line. Used only as a last-resort fallback when
// neither campus gate could produce a usable second route.
async function fetchForcedAlternative(userPos, destPos, viaGate) {
    try {
        const lat1 = userPos.lat, lng1 = userPos.lng;
        const lat2 = destPos.lat, lng2 = destPos.lng;
        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;
        // Perpendicular offset direction
        const dLat = lat2 - lat1, dLng = lng2 - lng1;
        const len = Math.sqrt(dLat*dLat + dLng*dLng) || 0.0001;
        const offsetScale = 0.0009; // ~80-100m detour, tuned for campus scale
        const perpLat = -(dLng / len) * offsetScale;
        const perpLng =  (dLat / len) * offsetScale;
        const detourLat = midLat + perpLat;
        const detourLng = midLng + perpLng;

        const waypoints = viaGate
            ? `${lng1},${lat1};${detourLng},${detourLat};${viaGate.lng},${viaGate.lat};${lng2},${lat2}`
            : `${lng1},${lat1};${detourLng},${detourLat};${lng2},${lat2}`;
        const url = `${OSRM_BASE}/${waypoints}?overview=full&geometries=geojson&steps=true&annotations=false`;
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes?.length) return data.routes[0];
    } catch (err) {
        console.warn('Forced alternative route failed:', err.message);
    }
    return null;
}

// Fetch a route forced through a specific gate (used to always offer a
// route-via-Gate-1 and a route-via-Gate-2 option side by side).
async function fetchRouteViaGate(userPos, destPos, gate) {
    try {
        const waypoints = `${userPos.lng},${userPos.lat};${gate.lng},${gate.lat};${destPos.lng},${destPos.lat}`;
        const url = `${OSRM_BASE}/${waypoints}?overview=full&geometries=geojson&steps=true&annotations=false`;
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes?.length) return { route: data.routes[0], gate };
    } catch (err) {
        console.warn(`Route via ${gate.name} failed:`, err.message);
    }
    return null;
}

// Returns true if two route coordinate arrays are essentially the same path
// (used to avoid showing two visually-identical "alternatives").
function routesAreNearDuplicate(coordsA, coordsB) {
    if (!coordsA?.length || !coordsB?.length) return false;
    const sampleIdx = [0, Math.floor(coordsA.length / 2), coordsA.length - 1];
    let closeCount = 0;
    for (const i of sampleIdx) {
        const p = L.latLng(coordsA[i][0], coordsA[i][1]);
        const d = nearestDistToRoute(p, coordsB);
        if (d < 15) closeCount++;
    }
    return closeCount === sampleIdx.length;
}

async function drawWalkingRoute(userPos,destPos) {
    if (routeDrawPending) return;
    routeDrawPending=true;
    const viaGate = pickRoutingGate(userPos, destPos);
    const waypoints = viaGate
        ? `${userPos.lng},${userPos.lat};${viaGate.lng},${viaGate.lat};${destPos.lng},${destPos.lat}`
        : `${userPos.lng},${userPos.lat};${destPos.lng},${destPos.lat}`;
    const url=`${OSRM_BASE}/${waypoints}?overview=full&geometries=geojson&steps=true&annotations=false&alternatives=true`;
    try {
        const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),OSRM_TIMEOUT_MS);
        const res=await fetch(url,{signal:ctrl.signal});clearTimeout(timer);
        const data=await res.json();
        if (data.code!=='Ok'||!data.routes?.length) throw new Error('No route');

        // Clear any previous route layers
        clearRouteLayers();

        // Start with whatever OSRM's default query returned (main + any native alternatives)
        let routesData = data.routes.map(r => ({ route: r, gateName: viaGate ? null : null }));

        // Only offer a route forced through a gate if that gate is actually
        // plausible — i.e. it's reasonably close to the USER or reasonably
        // close to the DESTINATION. This stops far-away/irrelevant gates
        // (e.g. forcing a Gate 1 detour when both user and destination are
        // next to Gate 2) from ever being considered as route options.
        const GATE_RELEVANCE_M = 280; // how close to user/dest a gate must be to be considered
        const relevantGates = CAMPUS_GATES.filter(g => {
            const gLatLng = L.latLng(g.lat, g.lng);
            const dUser = userPos.distanceTo(gLatLng);
            const dDest = destPos.distanceTo(gLatLng);
            return dUser <= GATE_RELEVANCE_M || dDest <= GATE_RELEVANCE_M;
        });
        const gateRoutePromises = relevantGates.map(g => fetchRouteViaGate(userPos, destPos, g));
        const gateResults = (await Promise.all(gateRoutePromises)).filter(Boolean);

        gateResults.forEach(({ route, gate }) => {
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
            // Skip if this gate route is basically identical to one we already have
            const isDup = routesData.some(rd => {
                const existingCoords = rd.route.geometry.coordinates.map(c => [c[1], c[0]]);
                return routesAreNearDuplicate(coords, existingCoords);
            });
            if (!isDup) routesData.push({ route, gateName: gate.name });
        });

        // Last-resort: if we still only have one usable route (e.g. gate
        // fetches failed or duplicated), force a detour-based alternative.
        if (routesData.length < 2) {
            const forcedAlt = await fetchForcedAlternative(userPos, destPos, viaGate);
            if (forcedAlt) routesData.push({ route: forcedAlt, gateName: null });
        }

        allRouteOptions = routesData.map(({ route, gateName }) => {
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
            const steps  = [];
            route.legs.forEach(l => { if (l.steps) steps.push(...l.steps); });
            return { coords, steps, distance: Math.round(route.distance), duration: Math.round(route.duration), gateName, polyline: null, outline: null };
        });
        // If the user manually picked an entrance gate, always use the route
        // from the primary request (already forced through that gate) as the
        // main route, instead of auto-picking by shortest distance.
        const forcedGateForSelection = getPreferredGateObj();
        if (forcedGateForSelection) {
            activeRouteIndex = 0;
        } else {
            // Use the shortest-distance route as the main (dark) route, regardless of source order
            activeRouteIndex = allRouteOptions.reduce((bestIdx, opt, i, arr) =>
                opt.distance < arr[bestIdx].distance ? i : bestIdx, 0);
        }

        const routeColor    = isDarkMode ? '#60a5fa' : '#1565c0';
        const outlineColor  = isDarkMode ? '#0a0f1a' : '#0b1f3a';
        const altColor       = isDarkMode ? '#3b5a78' : '#7a93ad';
        const altOutlineColor= isDarkMode ? '#05080d' : '#1a2733';

        // Draw every route; the active one bright, the rest dimmed/transparent.
        allRouteOptions.forEach((opt, i) => {
            const isMain = i === activeRouteIndex;
            opt.outline = L.polyline(opt.coords, {
                color: isMain ? outlineColor : altOutlineColor,
                weight: isMain ? 12 : 9,
                opacity: isMain ? 1 : ALT_ROUTE_OUTLINE_OP,
                lineJoin: 'round', lineCap: 'round',
            }).addTo(map);
            opt.polyline = L.polyline(opt.coords, {
                color: isMain ? routeColor : altColor,
                weight: isMain ? 7 : 5,
                opacity: isMain ? MAIN_ROUTE_OPACITY : ALT_ROUTE_OPACITY,
                lineJoin: 'round', lineCap: 'round',
                className: 'route-line' + (isMain ? ' route-line-main' : ' route-line-alt'),
            }).addTo(map);
            if (!isMain) {
                // Clicking an alternative promotes it to the main route immediately
                opt.polyline.on('click', () => promoteRoute(i, true));
                opt.polyline.on('mouseover', () => opt.polyline.setStyle({ opacity: Math.min(1, ALT_ROUTE_OPACITY + 0.25) }));
                opt.polyline.on('mouseout',  () => { if (i !== activeRouteIndex) opt.polyline.setStyle({ opacity: ALT_ROUTE_OPACITY }); });
            }
        });

        applyActiveRouteState();
    } catch(err){
        if (err.name!=='AbortError') console.warn('OSRM error:',err.message);
        const d=Math.round(userPos.distanceTo(destPos));
        routeCoords = [];  // no path data, fall back to straight-line
        updateETADisplay(d);
        document.getElementById('nav-step-dist').textContent=formatDist(d);
    }
    routeDrawPending=false;
    if (isNavigating){clearTimeout(routeRefreshTimer);routeRefreshTimer=setTimeout(()=>{if(isNavigating&&userMarker&&destinationCoords)drawWalkingRoute(userMarker.getLatLng(),destinationCoords);},ROUTE_REFRESH_MS);}
}

// Remove all current route polylines/outlines from the map
function clearRouteLayers(){
    allRouteOptions.forEach(opt => {
        if (opt.polyline) map.removeLayer(opt.polyline);
        if (opt.outline)  map.removeLayer(opt.outline);
    });
    allRouteOptions = [];
    if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
    if (routeOutline)  { map.removeLayer(routeOutline);  routeOutline  = null; }
}

// Sync routeCoords/currentSteps/ETA/steps-list to whichever route is active
function applyActiveRouteState(){
    const active = allRouteOptions[activeRouteIndex];
    if (!active) return;
    routeCoords      = active.coords;
    totalRouteDistM  = active.distance;
    remainingDistM   = active.distance;
    navStartTime     = Date.now();
    currentSteps     = active.steps;
    routePolyline    = active.polyline;
    routeOutline     = active.outline;
    updateETADisplay(active.distance);
    renderStepsList(currentSteps);
    if (currentSteps[0] && lastSpokenStep!==0){
        lastSpokenStep=0;
        document.getElementById('nav-turn-icon').innerHTML=getManeuverSVG(currentSteps[0]);
        document.getElementById('nav-step-text').textContent=getManeuverText(currentSteps[0]);
        document.getElementById('nav-step-dist').textContent=formatDist(currentSteps[0].distance);
        speak(getManeuverText(currentSteps[0]));
    }
}

// Visually swap which route is "main" (bright) vs "alternative" (dim)
function promoteRoute(newIndex, announce){
    if (newIndex===activeRouteIndex || !allRouteOptions[newIndex]) return;
    const routeColor    = isDarkMode ? '#60a5fa' : '#1565c0';
    const outlineColor  = isDarkMode ? '#0a0f1a' : '#0b1f3a';
    const altColor       = isDarkMode ? '#3b5a78' : '#7a93ad';
    const altOutlineColor= isDarkMode ? '#05080d' : '#1a2733';

    // Dim the old main
    const old = allRouteOptions[activeRouteIndex];
    if (old) {
        old.polyline.setStyle({ color: altColor, weight: 5, opacity: ALT_ROUTE_OPACITY, className: 'route-line route-line-alt' });
        old.outline.setStyle({ color: altOutlineColor, weight: 9, opacity: ALT_ROUTE_OUTLINE_OP });
        old.polyline.bringToBack();
        old.outline.bringToBack();
        old.polyline.off('click').on('click', () => promoteRoute(allRouteOptions.indexOf(old), true));
    }

    // Brighten the new main
    const fresh = allRouteOptions[newIndex];
    fresh.polyline.setStyle({ color: routeColor, weight: 7, opacity: MAIN_ROUTE_OPACITY, className: 'route-line route-line-main' });
    fresh.outline.setStyle({ color: outlineColor, weight: 12, opacity: 1 });
    fresh.polyline.off('click');
    fresh.outline.bringToFront();
    fresh.polyline.bringToFront();

    activeRouteIndex = newIndex;
    currentStepIndex = 0; lastSpokenStep = -1;
    applyActiveRouteState();
    if (announce) speak('Switching to this route');
}

// Find the shortest distance from userPos to any segment of a route's coords
function nearestDistToRoute(userPos, coords){
    if (!coords || !coords.length) return Infinity;
    let min = Infinity;
    for (let i=0;i<coords.length;i++){
        const d = userPos.distanceTo(L.latLng(coords[i][0], coords[i][1]));
        if (d < min) min = d;
    }
    return min;
}

// Called on every GPS update: if the user is now walking noticeably closer
// to an alternative route than the current main route, promote it.
function checkRoutePromotion(userPos){
    if (allRouteOptions.length < 2) return;
    const currentDist = nearestDistToRoute(userPos, allRouteOptions[activeRouteIndex]?.coords);
    let bestIdx = activeRouteIndex, bestDist = currentDist;
    allRouteOptions.forEach((opt, i) => {
        if (i === activeRouteIndex) return;
        const d = nearestDistToRoute(userPos, opt.coords);
        if (d < bestDist - ROUTE_SWITCH_MARGIN_M) { bestDist = d; bestIdx = i; }
    });
    if (bestIdx !== activeRouteIndex) promoteRoute(bestIdx, true);
}

function drawFallbackLine(userPos,destPos){
    if (routePolyline) map.removeLayer(routePolyline);
    if (routeOutline)  map.removeLayer(routeOutline);
    const routeColor   = isDarkMode?'#60a5fa':'#1565c0';
    const outlineColor = isDarkMode?'#0a0f1a':'#0b1f3a';
    routeOutline  = L.polyline([userPos,destPos],{color:outlineColor,weight:10,opacity:0.9,dashArray:'12,18'}).addTo(map);
    routePolyline = L.polyline([userPos,destPos],{color:routeColor,  weight:6, opacity:1,  dashArray:'10,16'}).addTo(map);
}

function onGPSUpdate(pos){
    const acc=pos.coords.accuracy,userPos=L.latLng(pos.coords.latitude,pos.coords.longitude);
    const heading=pos.coords.heading,gpsSpeed=pos.coords.speed;
    gpsReady=true;
    let spd=0;
    if (gpsSpeed!==null&&!isNaN(gpsSpeed)&&gpsSpeed>=0) spd=gpsSpeed*3.6;
    else if (lastSpeedPos&&lastSpeedTime){const dt=(Date.now()-lastSpeedTime)/1000;if(dt>0&&dt<10)spd=(userPos.distanceTo(lastSpeedPos)/dt)*3.6;}
    lastSpeedPos=userPos;lastSpeedTime=Date.now();
    currentSpeedKph=currentSpeedKph*0.4+spd*0.6;  // responsive smoothing
    const mode=detectTravelMode(currentSpeedKph);
    if (mode.key!==currentTravelMode){currentTravelMode=mode.key;if(isNavigating)speak(`You appear to be ${mode.label.toLowerCase()}`);}
    updateSpeedBadge(currentSpeedKph,mode);
    const hd=(heading!==null&&!isNaN(heading))?heading:lastHeading;
    if (heading!==null&&!isNaN(heading)) lastHeading=heading;
    const dotColor =isDarkMode?'#60a5fa':'#4285F4';
    const ringColor=isDarkMode?'rgba(96,165,250,0.4)':'rgba(66,133,244,0.3)';
    const bgColor  =isDarkMode?'rgba(20,20,30,0.85)':'white';
    const dotHtml=`<div style="position:relative;width:24px;height:24px;"><div style="position:absolute;top:50%;left:50%;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:28px solid ${ringColor};transform-origin:bottom center;transform:translate(-50%,-100%) rotate(${hd}deg);margin-top:-14px;"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22px;height:22px;background:${bgColor};border-radius:50%;box-shadow:0 0 0 3px ${ringColor},0 2px 8px rgba(0,0,0,0.3);"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:13px;height:13px;background:${dotColor};border-radius:50%;"></div></div>`;
    if (!userMarker){userMarker=L.marker(userPos,{icon:L.divIcon({className:'',html:dotHtml,iconSize:[24,24],iconAnchor:[12,12]}),zIndexOffset:1000}).addTo(map);}
    else{userMarker.setLatLng(userPos);userMarker.setIcon(L.divIcon({className:'',html:dotHtml,iconSize:[24,24],iconAnchor:[12,12]}));}
    if (!accuracyCircle){accuracyCircle=L.circle(userPos,{radius:acc,color:dotColor,fillColor:dotColor,fillOpacity:0.06,weight:1}).addTo(map);}
    else{accuracyCircle.setLatLng(userPos);accuracyCircle.setRadius(acc);}
    if (!isNavigating||!destinationCoords) return;
    checkRoutePromotion(userPos);
    const distLeft = calcRemainingDist(userPos);
    if (userPos.distanceTo(destinationCoords)<=ARRIVED_RADIUS_M){triggerArrival();return;}
    updateETADisplay(distLeft);
    if (currentSteps.length) updateCurrentStep(userPos);
}

function triggerArrival(){
    speak(`You have arrived at ${currentDestName}. Enjoy!`);
    const dest=currentDestName;stopNavigation();
    let b=document.getElementById('arrival-banner');
    if(!b){b=document.createElement('div');b.id='arrival-banner';b.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card-bg,white);color:var(--text-primary,#202124);padding:32px 40px;border-radius:24px;text-align:center;z-index:9999;box-shadow:0 12px 48px rgba(0,0,0,0.25);font-family:Roboto,Inter,sans-serif;animation:fadeInPop 0.4s cubic-bezier(.34,1.56,.64,1);';document.body.appendChild(b);}
    b.innerHTML=`<div style="font-size:52px;margin-bottom:12px;">📍</div><div style="font-size:1.3rem;font-weight:700;">You've arrived!</div><div style="font-size:0.88rem;margin-top:6px;opacity:0.55;">${dest}</div><button onclick="document.getElementById('arrival-banner').remove()" style="margin-top:22px;background:#064e3b;color:white;border:none;padding:11px 28px;border-radius:50px;font-weight:600;cursor:pointer;font-size:0.9rem;">Done</button>`;
    setTimeout(()=>{if(b.parentNode)b.remove();},9000);
}

function onGPSError(err){const msg={1:'❌ Location access denied.',2:'📡 GPS unavailable.',3:'⏱️ GPS signal slow.'};showToast(msg[err.code]||'❌ GPS error.','error');}

function startLiveTracking(){
    if(!navigator.geolocation){showToast('❌ Geolocation not supported.','error');return;}
    const opts={enableHighAccuracy:true,timeout:15000,maximumAge:0};
    navigator.geolocation.getCurrentPosition(pos=>{onGPSUpdate(pos);navigator.geolocation.watchPosition(onGPSUpdate,onGPSError,opts);},err=>{onGPSError(err);navigator.geolocation.watchPosition(onGPSUpdate,onGPSError,opts);},{enableHighAccuracy:true,timeout:10000,maximumAge:5000});
}

function buildAutocompleteData(){autocompleteList=allLocations.map(loc=>({label:loc.name,loc}));}

function setupAutocomplete(input){
    let dd=document.getElementById('search-dropdown');
    if(!dd){dd=document.createElement('div');dd.id='search-dropdown';dd.className='search-dropdown hidden';input.parentNode.parentNode.appendChild(dd);}
    input.addEventListener('input',()=>{
        const val=input.value.toLowerCase().trim();dd.innerHTML='';
        if(!val){dd.classList.add('hidden');renderMarkers('all');return;}
        const matches=autocompleteList.filter(({label,loc})=>label.toLowerCase().includes(val)||(loc.type&&loc.type.toLowerCase().includes(val))||(loc.description&&loc.description.toLowerCase().includes(val))).slice(0,7);
        if(!matches.length){dd.classList.add('hidden');showToast(`No results for "${input.value}"`);return;}
        matches.forEach(({label,loc})=>{
            const item=document.createElement('div');item.className='search-dropdown-item';
            TYPE_STYLE=isDarkMode?TYPE_STYLE_DARK:TYPE_STYLE_LIGHT;
            const s=TYPE_STYLE[loc.type]||{emoji:'📍'};
            item.innerHTML=`<span class="dd-icon">${s.emoji}</span><div class="dd-text"><span class="dd-name">${label}</span><span class="dd-type">${loc.type||''}</span></div><svg class="dd-arrow" viewBox="0 0 24 24" width="16" height="16" fill="#9aa0a6"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>`;
            item.addEventListener('click',()=>{input.value=label;dd.classList.add('hidden');renderMarkers('all');handleLocationSelect(loc);});
            dd.appendChild(item);
        });
        markersLayer.clearLayers();
        matches.forEach(({loc})=>{const m=L.marker([loc.lat,loc.lng],{icon:makeIcon(loc.type,loc.name)});m.bindTooltip(loc.name,{permanent:false,direction:'top',offset:[0,-46],className:'lu-tooltip'});m.on('click',()=>handleLocationSelect(loc));markersLayer.addLayer(m);});
        dd.classList.remove('hidden');
    });
    document.addEventListener('click',e=>{if(!dd.contains(e.target)&&e.target!==input)dd.classList.add('hidden');});
    input.addEventListener('keypress',e=>{if(e.key==='Enter'){const val=input.value.toLowerCase().trim(),found=allLocations.find(l=>l.name.toLowerCase().includes(val));dd.classList.add('hidden');if(found)handleLocationSelect(found);else showToast(`No results for "${input.value}")`);}});
}

function setupEventListeners(){
    const si=document.getElementById('map-search');
    setupAutocomplete(si);
    document.getElementById('btn-reset').addEventListener('click',()=>{map.flyTo([14.2560,121.4050],17);stopNavigation();closeCard();renderMarkers('all');si.value='';document.getElementById('search-dropdown')?.classList.add('hidden');});
    document.getElementById('btn-locate').addEventListener('click',()=>{if(!navigator.geolocation){showToast('❌ Geolocation not supported.','error');return;}navigator.geolocation.getCurrentPosition(pos=>{onGPSUpdate(pos);map.flyTo(L.latLng(pos.coords.latitude,pos.coords.longitude),18);},()=>showToast('❌ Could not get location.','error'),{enableHighAccuracy:true,timeout:10000,maximumAge:5000});});
}

function showToast(msg,type='info'){
    let box=document.getElementById('lu-toast');
    if(!box){box=document.createElement('div');box.id='lu-toast';box.style.cssText='position:fixed;top:76px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:6px;font-size:13px;font-family:Roboto,Inter,sans-serif;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:340px;text-align:center;pointer-events:none;transition:opacity 0.3s ease;font-weight:500;';document.body.appendChild(box);}
    box.style.background=type==='error'?'#c5221f':type==='warn'?'#e37400':'#323232';
    box.style.color='white';box.innerText=msg;box.style.opacity='1';box.style.display='block';
    clearTimeout(box._timer);
    box._timer=setTimeout(()=>{box.style.opacity='0';setTimeout(()=>{box.style.display='none';},300);},4000);
}
window.showWarning=showToast;

window.startNavigation=startNavigation;
window.stopNavigation=stopNavigation;
window.showNavPanel=showNavPanel;
window.hideNavPanel=hideNavPanel;
window.closeCard=closeCard;

initMap();
