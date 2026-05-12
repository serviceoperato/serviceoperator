/**
 * Portal user JWT in sessionStorage. Prefer so_user_jwt; so_clinic_jwt is legacy.
 */
(function () {
  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';

  function getPortalJwt() {
    try {
      return sessionStorage.getItem(USER_JWT_KEY) || sessionStorage.getItem(LEGACY_JWT_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function bindNav() {
    var el = document.getElementById('navPortalAuth') || document.getElementById('navClinicAuth');
    if (!el) return;
    if (!getPortalJwt()) return;
    el.textContent = 'Sign out';
    el.setAttribute('href', '#');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Sign out');
    el.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        sessionStorage.removeItem(USER_JWT_KEY);
        sessionStorage.removeItem(LEGACY_JWT_KEY);
      } catch (err) {}
      window.location.href = '/login.html';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindNav);
  } else {
    bindNav();
  }
})();
