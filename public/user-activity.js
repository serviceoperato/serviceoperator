(function () {
  'use strict';

  var SESSION_KEY = 'so_user_session_id';
  var JWT_KEYS = ['so_user_jwt', 'so_clinic_jwt'];
  var pageEnteredAt = Date.now();
  var currentPath = window.location.pathname + window.location.search;
  var sentLeave = false;

  function getJwt() {
    try {
      for (var i = 0; i < JWT_KEYS.length; i++) {
        var k = JWT_KEYS[i];
        var token = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (token) return token;
      }
    } catch (e) {}
    return '';
  }

  function getSessionId() {
    try {
      return localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function postEvents(events, useBeacon) {
    var jwt = getJwt();
    var sessionId = getSessionId();
    if (!jwt || !sessionId || !events || !events.length) return;
    var payload = JSON.stringify({ sessionId: sessionId, events: events });
    fetch(typeof soApiUrl === 'function' ? soApiUrl('/api/auth/user-activity') : '/api/auth/user-activity', {
      method: 'POST',
      credentials: typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin',
      headers: {
        Authorization: 'Bearer ' + jwt,
        'Content-Type': 'application/json',
      },
      body: payload,
      keepalive: !!useBeacon,
    }).catch(function () {});
  }

  function sendPageView() {
    postEvents([
      {
        type: 'page_view',
        path: currentPath,
        at: new Date().toISOString(),
        detail: { referrer: document.referrer || null, title: document.title || null },
      },
    ]);
  }

  function sendPageLeave() {
    if (sentLeave) return;
    sentLeave = true;
    var durationMs = Math.max(0, Date.now() - pageEnteredAt);
    postEvents(
      [
        {
          type: 'page_leave',
          path: currentPath,
          durationMs: durationMs,
          at: new Date().toISOString(),
        },
      ],
      true
    );
  }

  if (!getJwt() || !getSessionId()) return;

  sendPageView();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendPageLeave();
  });
  window.addEventListener('pagehide', sendPageLeave);
  window.addEventListener('beforeunload', sendPageLeave);
})();
