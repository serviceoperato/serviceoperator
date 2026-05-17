/**
 * Loader — always fetches the current visual dashboard bundle (bypasses stale SW/cache).
 */
(function () {
  'use strict';
  if (window.TX_DASHBOARD_UI_REV >= 5 && typeof window.initAdminTranscriptions === 'function') {
    return;
  }
  var v = Date.now();
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/app-version.json', false);
    xhr.send(null);
    if (xhr.status === 200) {
      var j = JSON.parse(xhr.responseText);
      if (j && j.version) v = j.version;
    }
  } catch (e) {
    /* use timestamp */
  }
  var s = document.createElement('script');
  s.src = '/admin-tx-dashboard.js?v=' + encodeURIComponent(String(v));
  s.async = false;
  document.head.appendChild(s);
})();
