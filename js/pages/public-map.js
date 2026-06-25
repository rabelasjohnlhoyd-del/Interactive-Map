let map;
let userMarker = null;
let destinationCoords = null;
let polyline = null;
let markersLayer = L.layerGroup(); 
let allLocations = [];

async function initMap() {

    map = L.map('map', { 
        zoomControl: false,
        maxZoom: 19 
    }).setView([14.2560, 121.4050], 17);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    markersLayer.addTo(map);

    // Zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    try {
        const response = await fetch('js/data/buildings.json');
        allLocations = await response.json();
        renderMarkers('all');
    } catch (err) {
        console.error("Error loading JSON:", err);
    }

    setupEventListeners();
    startLiveTracking();
}

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


function handleLocationSelect(loc) {
    if (!loc) return;

  
    const offsetLat = loc.lat - 0.0005; 
    map.flyTo([offsetLat, loc.lng], 18, {
        animate: true,
        duration: 1.5
    });

    // 2. Update Floating Card Elements
    const card = document.getElementById('room-card');
    const titleEl = document.getElementById('card-title');
    const tagEl = document.getElementById('card-tag');
    const descEl = document.getElementById('card-desc');
    const imgEl = document.getElementById('card-img');
    const imgSection = document.querySelector('.card-image-section');

    titleEl.innerText = loc.name;
    tagEl.innerText = loc.type || loc.category || "General";
    descEl.innerText = loc.description || "No description available for this location.";
    
  
    if (loc.image && loc.image.trim() !== "") {
        imgEl.src = loc.image;
        imgSection.style.display = "block";
        imgEl.onerror = () => imgSection.style.display = "none";
    } else {
        imgSection.style.display = "none"; 
    }

    // 4. Show Card
    card.classList.add('active');

    // 5. Setup Direction Button inside card
    const navBtn = document.getElementById('card-nav-btn');
    navBtn.onclick = () => {
        startNavigation(loc.lat, loc.lng, loc.name);
        card.classList.remove('active'); 
    };
}

window.filterMarkers = function(category) {
    renderMarkers(category);
  
    document.getElementById('room-card').classList.remove('active');
    
    document.querySelectorAll('.f-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(category));
    });
};

function startNavigation(lat, lng, name) {
    destinationCoords = L.latLng(lat, lng);
    const toast = document.getElementById('distance-toast');
    const targetText = document.getElementById('target-name');
    
    if (targetText) targetText.innerText = `Heading to ${name}`;
    if (toast) toast.classList.remove('hidden');

    if (userMarker) {
        updateDirectionLine(userMarker.getLatLng(), destinationCoords);
    } else {
        alert("Please enable GPS/Location to see directions.");
    }
}

function updateDirectionLine(userPos, destPos) {
    if (polyline) map.removeLayer(polyline);
    
    polyline = L.polyline([userPos, destPos], {
        color: '#064e3b', 
        weight: 5, 
        dashArray: '10, 15', 
        opacity: 0.8
    }).addTo(map);

    const dist = userPos.distanceTo(destPos);
    const distElement = document.getElementById('dist-value');
    if (distElement) distElement.innerText = Math.round(dist);
}

function startLiveTracking() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(pos => {
        const userPos = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!userMarker) {
            userMarker = L.circleMarker(userPos, { 
                radius: 9, 
                fillColor: '#2196F3', 
                color: 'white', 
                weight: 3, 
                fillOpacity: 1 
            }).addTo(map);
        } else {
            userMarker.setLatLng(userPos);
        }
        if (destinationCoords) updateDirectionLine(userPos, destinationCoords);
    }, (err) => console.warn("GPS Error:", err), { 
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('map-search');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = searchInput.value.toLowerCase().trim();
            const found = allLocations.find(l => l.name.toLowerCase().includes(val));
            if (found) {
                handleLocationSelect(found);
            } else {
                alert("Location not found.");
            }
        }
    });

    // Reset View Button
    document.getElementById('btn-reset').addEventListener('click', () => {
        map.flyTo([14.2560, 121.4050], 17);
        if (polyline) map.removeLayer(polyline);
        document.getElementById('distance-toast').classList.add('hidden');
        document.getElementById('room-card').classList.remove('active');
        destinationCoords = null;
    });

    // Locate Me Button
    document.getElementById('btn-locate').addEventListener('click', () => {
        if (userMarker) {
            map.flyTo(userMarker.getLatLng(), 18);
        } else {
            alert("Waiting for GPS signal...");
        }
    });
}

initMap();