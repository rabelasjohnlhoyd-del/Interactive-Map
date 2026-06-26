// ============================================================
// SIDEBAR.JS — Sidebar behavior component
// File:  js/components/sidebar.js
//
// Handles:
//   - Mobile sidebar toggle (hamburger open/close)
//   - Overlay backdrop click to close
//   - Auto-highlight active nav link based on current page
//   - Dark mode persistence (applied before paint)
//
// Works on all admin/superadmin pages.
// No configuration needed — just include this script.
// ============================================================

// ── Apply saved theme before paint (prevents flash) ──────────
(function applyThemeEarly() {
  const saved = localStorage.getItem('lu-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle();
  highlightActiveLink();
});

// ── Mobile sidebar toggle ─────────────────────────────────────
function initSidebarToggle() {
  const sidebar      = document.getElementById('sidebar');
  const toggleBtn    = document.getElementById('sidebarToggle');
  const overlay      = document.getElementById('sidebarOverlay');

  if (!sidebar) return;

  // Create overlay if it doesn't exist
  let backdropEl = overlay;
  if (!backdropEl) {
    backdropEl = document.createElement('div');
    backdropEl.id        = 'sidebarOverlay';
    backdropEl.className = 'sidebar-backdrop';
    backdropEl.style.cssText = `
      display:none;
      position:fixed;inset:0;
      background:rgba(0,0,0,0.45);
      z-index:99;
      backdrop-filter:blur(2px);
    `;
    document.body.appendChild(backdropEl);
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdropEl.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdropEl.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Hamburger button
  if (toggleBtn) {
    toggleBtn.style.display = '';
    toggleBtn.addEventListener('click', openSidebar);
  }

  // Backdrop click
  backdropEl.addEventListener('click', closeSidebar);

  // Close on nav link click (mobile UX)
  sidebar.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Show toggle button on small screens
  function handleResize() {
    if (toggleBtn) {
      toggleBtn.style.display = window.innerWidth <= 768 ? '' : 'none';
    }
    if (window.innerWidth > 768) closeSidebar();
  }

  window.addEventListener('resize', handleResize);
  handleResize();
}

// ── Auto-highlight active nav link ───────────────────────────
function highlightActiveLink() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = (link.getAttribute('href') || '').split('/').pop();
    if (href === currentPage) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      // Don't remove if already set in HTML (some pages set it manually)
      // Only remove if it was auto-set
      if (!link.dataset.manualActive) {
        link.classList.remove('active');
      }
    }
  });
}

// ── Dark mode toggle ──────────────────────────────────────────
// Overrides the inline toggleTheme() on pages that load this file
function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('lu-theme', isDark ? 'light' : 'dark');
}

// ── Expose globally ───────────────────────────────────────────
window.toggleTheme = toggleTheme;