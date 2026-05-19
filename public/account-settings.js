/**
 * Portal account settings page — session gate + profile/security actions.
 */
(function () {
  'use strict';

  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';
  var ACCOUNT_SETTINGS_PATH = '/account-settings';

  var loading = document.getElementById('asLoading');
  var panel = document.getElementById('asSignedIn');
  var profileLede = document.getElementById('asProfileLede');
  var profileMeta = document.getElementById('asProfileMeta');
  var securityLede = document.getElementById('asSecurityLede');
  var errBox = document.getElementById('asErr');
  var openReport = document.getElementById('asOpenReport');
  var changePw = document.getElementById('asChangePw');
  var signOut = document.getElementById('asSignOut');
  var useOther = document.getElementById('asUseOther');

  var resetEmailEnabled = false;

  function getPortalJwt() {
    try {
      return (
        localStorage.getItem(USER_JWT_KEY) ||
        localStorage.getItem(LEGACY_JWT_KEY) ||
        sessionStorage.getItem(USER_JWT_KEY) ||
        sessionStorage.getItem(LEGACY_JWT_KEY) ||
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function looksLikeJwt(tok) {
    return typeof soLooksLikePortalJwt === 'function' ? soLooksLikePortalJwt(tok) : false;
  }

  function clearPortalJwt() {
    try {
      sessionStorage.removeItem(USER_JWT_KEY);
      sessionStorage.removeItem(LEGACY_JWT_KEY);
      sessionStorage.removeItem('so_user_session_id');
      localStorage.removeItem(USER_JWT_KEY);
      localStorage.removeItem(LEGACY_JWT_KEY);
      localStorage.removeItem('so_user_session_id');
    } catch (eClr) {}
  }

  function redirectToLogin(opts) {
    opts = opts || {};
    if (opts.sessionExpired) clearPortalJwt();
    var href =
      typeof soPortalLoginHrefWithNext === 'function'
        ? soPortalLoginHrefWithNext(ACCOUNT_SETTINGS_PATH)
        : '/login.html?next=%2Faccount-settings';
    try {
      var u = new URL(href, window.location.origin);
      if (opts.sessionExpired) u.searchParams.set('reason', 'session_expired');
      window.location.replace(u.pathname + u.search);
    } catch (eRl) {
      window.location.replace(
        href + (opts.sessionExpired ? (href.indexOf('?') >= 0 ? '&' : '?') + 'reason=session_expired' : '')
      );
    }
  }

  function setErr(msg) {
    if (!errBox) return;
    if (!msg) {
      errBox.textContent = '';
      errBox.classList.add('is-hidden');
      return;
    }
    errBox.textContent = msg;
    errBox.classList.remove('is-hidden');
  }

  function decodeJwtEmail(token) {
    return typeof soDecodePortalJwtEmail === 'function' ? soDecodePortalJwtEmail(token) : '';
  }

  function decodeJwtReportSlug(token) {
    return typeof soDecodePortalJwtReportSlug === 'function' ? soDecodePortalJwtReportSlug(token) : '';
  }

  function fetchPortalUserSession(bearer) {
    var url = typeof soApiUrl === 'function' ? soApiUrl('/api/auth/user-session') : '/api/auth/user-session';
    return fetch(url, {
      method: 'GET',
      credentials: typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin',
      headers: { Authorization: 'Bearer ' + bearer },
      cache: 'no-store',
    })
      .then(function (r) {
        var status = r.status;
        return r.text().then(function (text) {
          var j = null;
          try {
            j = text ? JSON.parse(text) : null;
          } catch (eParse) {
            j = null;
          }
          return { ok: r.ok, status: status, json: j };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, json: null };
      });
  }

  function appendMetaField(container, caption, value) {
    var p = document.createElement('p');
    var cap = document.createElement('span');
    cap.className = 'portal-caption';
    cap.textContent = caption;
    p.appendChild(cap);
    p.appendChild(document.createTextNode(' ' + value));
    container.appendChild(p);
  }

  function showSignedIn(sess, fallbackEmail, tok) {
    if (loading) loading.classList.add('is-hidden');
    if (panel) panel.classList.remove('is-hidden');

    var email = (sess && sess.email) || fallbackEmail || '';
    var slug = sess && sess.reportSlug ? String(sess.reportSlug).trim() : '';

    if (profileLede) {
      profileLede.textContent = slug
        ? 'Manage access to your clinic report from here.'
        : 'You are signed in. Your report link appears when your clinic assigns it to your account.';
    }
    if (profileMeta) {
      profileMeta.textContent = '';
      appendMetaField(profileMeta, 'EMAIL', email || '(signed in)');
      if (slug) appendMetaField(profileMeta, 'REPORT SLUG', slug);
      if (sess && sess.isOperator) appendMetaField(profileMeta, 'ROLE', 'Operator portal');
    }

    if (securityLede) {
      securityLede.textContent = resetEmailEnabled
        ? 'Change password via email reset, or sign out of this browser.'
        : 'Sign out to switch accounts. Password reset email may be unavailable on this host—contact support if needed.';
    }

    if (openReport) {
      openReport.onclick = null;
      var reportHref =
        typeof soPortalReportUrl === 'function'
          ? soPortalReportUrl({ reportSlug: slug }, '')
          : slug
            ? '/clinics/report.html?slug=' + encodeURIComponent(slug)
            : '';
      if (slug) {
        openReport.href = reportHref;
        openReport.classList.remove('is-hidden');
      } else {
        openReport.href = '#';
        openReport.classList.remove('is-hidden');
        openReport.onclick = function (e) {
          e.preventDefault();
          setErr('No report has been linked to this account yet.');
        };
      }
    }
  }

  function loadCapabilities() {
    var url =
      typeof soApiUrl === 'function' ? soApiUrl('/api/auth/user-capabilities') : '/api/auth/user-capabilities';
    return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cap) {
        resetEmailEnabled = Boolean(cap && cap.service === 'serviceopera' && cap.passwordResetEmail);
      })
      .catch(function () {
        resetEmailEnabled = false;
      });
  }

  function clearAdminJwt() {
    try {
      localStorage.removeItem('so_admin_jwt');
      sessionStorage.removeItem('so_admin_jwt');
    } catch (eAd) {}
  }

  if (changePw) {
    changePw.addEventListener('click', function () {
      setErr('');
      var next =
        typeof soPortalLoginHrefWithNext === 'function'
          ? soPortalLoginHrefWithNext(ACCOUNT_SETTINGS_PATH)
          : '/login.html?next=%2Faccount-settings';
      if (resetEmailEnabled) {
        try {
          sessionStorage.setItem('so_portal_open_forgot', '1');
        } catch (eSf) {}
      }
      window.location.href = next;
    });
  }

  if (signOut) {
    signOut.addEventListener('click', function () {
      clearPortalJwt();
      clearAdminJwt();
      window.location.href = '/login.html';
    });
  }

  if (useOther) {
    useOther.addEventListener('click', function () {
      clearPortalJwt();
      clearAdminJwt();
      redirectToLogin();
    });
  }

  var tok = getPortalJwt();
  if (!tok || !looksLikeJwt(tok)) {
    redirectToLogin();
    return;
  }

  var tokAtProbe = tok;
  Promise.all([loadCapabilities(), fetchPortalUserSession(tok)]).then(function (results) {
    var x = results[1];
    if (getPortalJwt() !== tokAtProbe) return;

    if (x.status === 401 && x.json && x.json.ok === false) {
      redirectToLogin({ sessionExpired: true });
      return;
    }

    if (x.ok && x.json && x.json.ok && x.json.passwordMustChange) {
      redirectToLogin();
      return;
    }

    if (x.ok && x.json && x.json.ok) {
      showSignedIn(x.json, decodeJwtEmail(tok), tok);
      return;
    }

    showSignedIn(
      { email: decodeJwtEmail(tok), reportSlug: decodeJwtReportSlug(tok) },
      decodeJwtEmail(tok),
      tok
    );
  });
})();
