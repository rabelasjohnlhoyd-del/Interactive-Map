// ============================================================
// LOGIN PAGE — Frontend Logic
// File:  js/pages/login.js
// Page:  index.html
//
// Backend hook (WE CALL this — backend implements it):
//   - loginUser(email, password)
//       Expected to return a Promise that resolves with
//       { role: "admin" | "superadmin", name: "..." }
//       or rejects with an Error/string message on failure.
//
// ⚠️ ASSUMED ELEMENT IDs — index.html was not shared with me yet,
// so this file expects the following IDs to exist on the page.
// If your actual index.html uses different IDs, just tell me
// (or send me the file) and I'll adjust this to match exactly:
//
//   <form id="loginForm">              (optional — works without it too)
//     <input id="loginEmail" type="email">
//     <input id="loginPassword" type="password">
//     <button id="loginBtn" type="submit">Log In</button>
//   </form>
//   <div id="loginError" class="hidden"></div>
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const form          = document.getElementById('loginForm');
  const emailInput    = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn      = document.getElementById('loginBtn');
  const btnText       = document.getElementById('loginBtnText');
  const errorBox      = document.getElementById('loginError');
  const errorMsg      = document.getElementById('loginErrorMsg');

  if (!emailInput || !passwordInput || !loginBtn) {
    console.error('[login.js] Could not find emailInput / passwordInput / loginBtn — check element IDs in index.html.');
    return;
  }

  // Submit via <form> or Enter key (index.html already has onsubmit="return false")
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogin();
    });
  }

  // Also support Enter key on password field
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  function showError(message) {
    errorMsg.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function clearError() {
    errorBox.classList.add('hidden');
  }

  function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    if (isLoading) {
      btnText.innerHTML = '<span class="login-spinner"></span> Signing in…';
      loginBtn.classList.add('loading');
    } else {
      btnText.textContent = 'Sign In';
      loginBtn.classList.remove('loading');
    }
  }

  function handleLogin() {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;

    clearError();

    if (!email || !password) {
      showError('Please fill in all fields.');
      return;
    }

    setLoading(true);

    Promise.resolve(loginUser(email, password))
      .then((result) => {
        const role = ((result && result.role) || '').toLowerCase().replace(/[_\s]/g, '');
        if (role === 'superadmin') {
          window.location.href = 'superadmin/dashboard.html';
        } else if (role === 'admin') {
          window.location.href = 'admin/dashboard.html';
        } else {
          showError('Unrecognized account role. Please contact the system administrator.');
        }
      })
      .catch((err) => {
        const message = (err && err.message) || err || 'Invalid email or password.';
        showError(typeof message === 'string' ? message : 'Login failed. Please try again.');
      })
      .finally(() => setLoading(false));
  }
});

/* ============================================================
   DEV-ONLY MOCK — lets you test the redirect flow before the
   backend's real loginUser() is wired in. Delete this whole
   block once the real one is connected (it auto-disables itself
   anyway once a real loginUser exists, since this only defines
   a fallback when none is present).

   Test accounts:
     admin@lu.edu.ph     / admin123     -> admin/dashboard.html
     superadmin@lu.edu.ph / super123    -> superadmin/dashboard.html
============================================================ */
if (typeof loginUser === 'undefined') {
  window.loginUser = function (email, password) {
    console.warn('[DEV] loginUser() not yet connected — using mock auth.');
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email === 'admin@lu.edu.ph' && password === 'admin123') {
          resolve({ role: 'admin', name: 'Juan Dela Cruz' });
        } else if (email === 'superadmin@lu.edu.ph' && password === 'super123') {
          resolve({ role: 'superadmin', name: 'Pedro Reyes' });
        } else {
          reject('Invalid email or password.');
        }
      }, 600);
    });
  };
}