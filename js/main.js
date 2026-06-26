// ============================================================
// MAIN.JS — Shared utility functions
// Loaded on every page. Contains only reusable helpers.
// Each page has its own page-specific script in js/pages/.
// ============================================================

/* --- Dark mode persistence (applied before paint) --- */
(function applyThemeEarly() {
  const saved = localStorage.getItem('lu-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

/* --- Toggle dark mode (called by theme toggle buttons) --- */
function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('lu-theme', isDark ? 'light' : 'dark');
}

/* --- XSS-safe HTML escaping --- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* --- Debounce (for search inputs) --- */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* --- Expose globally --- */
window.toggleTheme = toggleTheme;
window.escapeHtml  = escapeHtml;
window.debounce    = debounce;