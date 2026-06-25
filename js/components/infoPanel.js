export function renderInfoPanel(data, onNavigate) {
    const container = document.getElementById('info-panel');
    container.innerHTML = ""; 

    // 1. Main Card Wrapper
    const card = document.createElement('div');
    card.className = "info-card-animate info-wrapper-premium";

    // 2. Image Section
    const imgContainer = document.createElement('div');
    imgContainer.className = "info-img-container";

    const img = document.createElement('img');
    img.className = "info-hero-img";
    img.src = data.image || 'assets/images/default-campus.jpg'; 
    img.alt = data.name;

    const badge = document.createElement('span');
    badge.className = "category-badge";
    badge.textContent = data.type ? data.type.toUpperCase() : "LOCATION";

    imgContainer.append(img, badge);

    // 3. Content Section
    const content = document.createElement('div');
    content.className = "info-content";

    const title = document.createElement('h2');
    title.className = "info-title";
    title.textContent = data.name;

    const campusText = document.createElement('small');
    campusText.className = "info-campus-text";
    campusText.textContent = "Laguna University Campus";

    const desc = document.createElement('p');
    desc.className = "info-desc";
    desc.textContent = data.description || "No description available.";

    // 4. Details (Hours)
    const details = document.createElement('div');
    details.className = "info-details";
    details.innerHTML = `<span class="icon-clock">🕒</span> <strong>Hours:</strong> ${data.hours || 'Not Specified'}`;

    // 5. Directions Button
    const navBtn = document.createElement('button');
    navBtn.className = "action-btn-main";
    navBtn.innerHTML = `<span>🚀</span> GET LIVE DIRECTIONS`;
    
    navBtn.onclick = () => onNavigate(data.lat, data.lng, data.name);

    // Assembly
    content.append(title, campusText, desc, details, navBtn);
    card.append(imgContainer, content);
    container.appendChild(card);
}

export function clearInfoPanel() {
    const container = document.getElementById('info-panel');
    container.innerHTML = `
        <div class="sidebar-placeholder">
            <div class="placeholder-icon">📍</div>
            <h3>Explore LU</h3>
            <p>Select a building or room to view its photo and get directions.</p>
        </div>
    `;
}
