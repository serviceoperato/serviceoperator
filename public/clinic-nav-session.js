/**
 * Clinic report JWT lives in sessionStorage (so_clinic_jwt). When present, the
 * header should not show "Log in" — show sign-out instead.
 */
(function () {
  var CLINIC_JWT_KEY = 'so_clinic_jwt';

  function getClinicJwt() {
    try {
      return sessionStorage.getItem(CLINIC_JWT_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function bindNav() {
    var el = document.getElementById('navClinicAuth');
    if (!el) return;
    if (!getClinicJwt()) return;
    el.textContent = 'Sign out';
    el.setAttribute('href', '#');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Sign out of clinic report access');
    el.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        sessionStorage.removeItem(CLINIC_JWT_KEY);
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
