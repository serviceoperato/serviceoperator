/**
 * Debug panel: storage (as "DB"), browser ("frontend"), same-origin HTTP ("backend").
 */
(function () {
  var DOCK_ID = 'soDebugDock';
  var PANEL_ID = 'soDebugPanel';
  var BTN_ID = 'soDebugFab';
  var LS_PROBE = '__so_debug_probe__';

  function mm(q) {
    try {
      return window.matchMedia(q).matches ? 'yes' : 'no';
    } catch (e) {
      return 'n/a';
    }
  }

  function storageKeys(store) {
    try {
      var keys = [];
      for (var i = 0; i < store.length; i++) keys.push(store.key(i));
      return keys;
    } catch (e) {
      return [];
    }
  }

  function dbRoundtrip() {
    try {
      var v = String(Date.now());
      localStorage.setItem(LS_PROBE, v);
      var ok = localStorage.getItem(LS_PROBE) === v;
      localStorage.removeItem(LS_PROBE);
      return ok ? 'OK (read/write/delete)' : 'FAIL (mismatch)';
    } catch (e) {
      return 'FAIL: ' + (e && e.message ? e.message : String(e));
    }
  }

  function httpProbe(url, method) {
    return fetch(url, {
      method: method || 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(function (r) {
        return { ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '' };
      })
      .catch(function (e) {
        return { ok: false, status: 0, err: e && e.message ? e.message : String(e) };
      });
  }

  async function timed(name, url, method) {
    var t0 = performance.now();
    var r = await httpProbe(url, method);
    var ms = Math.round(performance.now() - t0);
    var tail = r.err ? ' · ' + r.err : r.ct ? ' · ' + r.ct.slice(0, 48) : '';
    return { line: name + ': HTTP ' + r.status + ' · ' + ms + ' ms' + (r.ok ? ' · ok' : ' · fail') + tail };
  }

  async function timedJson(name, url) {
    var t0 = performance.now();
    try {
      var r = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
      var ms = Math.round(performance.now() - t0);
      var j = null;
      try {
        j = await r.json();
      } catch (e2) {
        j = null;
      }
      return { ok: r.ok, status: r.status, ms: ms, json: j };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        ms: Math.round(performance.now() - t0),
        json: null,
        err: e && e.message ? e.message : String(e),
      };
    }
  }

  function envSafeArea() {
    var probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    var cs = window.getComputedStyle(probe);
    var out =
      'top=' +
      cs.paddingTop +
      ' · right=' +
      cs.paddingRight +
      ' · bottom=' +
      cs.paddingBottom +
      ' · left=' +
      cs.paddingLeft;
    probe.remove();
    return out;
  }

  async function buildLines() {
    var lines = [];
    var origin = window.location.origin;
    var path = window.location.pathname;

    /* —— DB (local persistence) —— */
    lines.push({ cat: 'DB', text: '01 · localStorage roundtrip: ' + dbRoundtrip() });
    var lsKeys = storageKeys(localStorage);
    lines.push({ cat: 'DB', text: '02 · localStorage key count: ' + lsKeys.length });
    lines.push({ cat: 'DB', text: '03 · localStorage keys: ' + (lsKeys.join(', ') || '(empty)') });
    var th = '';
    try {
      th = localStorage.getItem('so-theme') || '(not set)';
    } catch (e) {
      th = '(read error)';
    }
    lines.push({ cat: 'DB', text: '04 · localStorage so-theme: ' + th });
    var ssKeys = storageKeys(sessionStorage);
    lines.push({ cat: 'DB', text: '05 · sessionStorage key count: ' + ssKeys.length });
    lines.push({ cat: 'DB', text: '06 · sessionStorage keys: ' + (ssKeys.join(', ') || '(empty)') });
    lines.push({ cat: 'DB', text: '07 · IndexedDB in window: ' + ('indexedDB' in window ? 'yes' : 'no') });
    lines.push({ cat: 'DB', text: '08 · navigator.cookieEnabled: ' + (navigator.cookieEnabled ? 'yes' : 'no') });

    /* —— FRONTEND —— */
    lines.push({ cat: 'FE', text: '09 · data-theme: ' + (document.documentElement.getAttribute('data-theme') || '(unset)') });
    lines.push({ cat: 'FE', text: '10 · viewport: ' + window.innerWidth + '×' + window.innerHeight });
    lines.push({ cat: 'FE', text: '11 · screen: ' + screen.width + '×' + screen.height });
    lines.push({ cat: 'FE', text: '12 · devicePixelRatio: ' + window.devicePixelRatio });
    lines.push({ cat: 'FE', text: '13 · maxTouchPoints: ' + navigator.maxTouchPoints });
    lines.push({ cat: 'FE', text: '14 · navigator.onLine: ' + navigator.onLine });
    lines.push({ cat: 'FE', text: '15 · navigator.language: ' + navigator.language });
    lines.push({
      cat: 'FE',
      text: '16 · navigator.languages: ' + (navigator.languages ? navigator.languages.join(', ') : 'n/a'),
    });
    lines.push({
      cat: 'FE',
      text: '17 · userAgent (trim): ' + String(navigator.userAgent).slice(0, 140) + (navigator.userAgent.length > 140 ? '…' : ''),
    });
    lines.push({ cat: 'FE', text: '18 · navigator.platform: ' + (navigator.platform || 'n/a') });
    var tz = 'n/a';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'n/a';
    } catch (e) {}
    lines.push({ cat: 'FE', text: '19 · timeZone (IANA): ' + tz });
    lines.push({ cat: 'FE', text: '20 · timezoneOffset (min): ' + new Date().getTimezoneOffset() });
    lines.push({ cat: 'FE', text: '21 · document.visibilityState: ' + document.visibilityState });
    lines.push({ cat: 'FE', text: '22 · document.referrer: ' + (document.referrer || '(none)') });
    lines.push({ cat: 'FE', text: '23 · document.readyState: ' + document.readyState });
    lines.push({ cat: 'FE', text: '24 · DOM nodes (*): ' + document.getElementsByTagName('*').length });
    lines.push({ cat: 'FE', text: '25 · <script> count: ' + document.querySelectorAll('script').length });
    lines.push({ cat: 'FE', text: '26 · stylesheet count: ' + document.querySelectorAll('link[rel="stylesheet"]').length });
    lines.push({ cat: 'FE', text: '27 · <img> count: ' + document.querySelectorAll('img').length });
    lines.push({ cat: 'FE', text: '28 · prefers-reduced-motion: ' + mm('(prefers-reduced-motion: reduce)') });
    lines.push({ cat: 'FE', text: '29 · prefers-color-scheme dark: ' + mm('(prefers-color-scheme: dark)') });
    lines.push({ cat: 'FE', text: '30 · prefers-color-scheme light: ' + mm('(prefers-color-scheme: light)') });
    lines.push({ cat: 'FE', text: '31 · screen.colorDepth: ' + screen.colorDepth });
    lines.push({
      cat: 'FE',
      text: '32 · screen.orientation: ' + (screen.orientation && screen.orientation.type ? screen.orientation.type : 'n/a'),
    });
    lines.push({
      cat: 'FE',
      text: '33 · hardwareConcurrency: ' + (typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 'n/a'),
    });
    lines.push({
      cat: 'FE',
      text: '34 · deviceMemory (GB): ' + (navigator.deviceMemory != null ? String(navigator.deviceMemory) : 'n/a'),
    });
    var mem = '';
    try {
      if (performance.memory) {
        mem =
          'used ' +
          Math.round(performance.memory.usedJSHeapSize / 1048576) +
          ' MB · limit ' +
          Math.round(performance.memory.jsHeapSizeLimit / 1048576) +
          ' MB';
      } else mem = 'n/a (no performance.memory)';
    } catch (e) {
      mem = 'n/a';
    }
    lines.push({ cat: 'FE', text: '35 · JS heap (Chrome): ' + mem });
    var conn = '';
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c) {
        conn = [c.effectiveType, c.downlink != null ? c.downlink + ' Mbps' : '', c.rtt != null ? c.rtt + ' ms rtt' : '']
          .filter(Boolean)
          .join(' · ');
      } else conn = 'n/a';
    } catch (e) {
      conn = 'n/a';
    }
    lines.push({ cat: 'FE', text: '36 · Network Information API: ' + conn });
    lines.push({ cat: 'FE', text: '37 · crypto.subtle: ' + (window.crypto && crypto.subtle ? 'yes' : 'no') });
    lines.push({ cat: 'FE', text: '38 · window.history.length: ' + window.history.length });
    var paint = 'n/a';
    try {
      var pe = performance.getEntriesByType('paint');
      if (pe && pe.length) {
        paint = pe
          .map(function (e) {
            return e.name + '=' + Math.round(e.startTime) + 'ms';
          })
          .join(' · ');
      }
    } catch (e) {}
    lines.push({ cat: 'FE', text: '39 · Paint timing: ' + paint });
    var nav = 'n/a';
    try {
      var nt = performance.getEntriesByType('navigation')[0];
      if (nt) nav = 'type=' + nt.type + ' · domComplete≈' + Math.round(nt.domComplete) + 'ms';
    } catch (e) {}
    lines.push({ cat: 'FE', text: '40 · Navigation timing: ' + nav });
    lines.push({
      cat: 'FE',
      text: '41 · Service worker API: ' + ('serviceWorker' in navigator ? 'present' : 'absent'),
    });
    lines.push({
      cat: 'FE',
      text: '42 · document.title length: ' + (document.title ? document.title.length : 0),
    });

    /* —— BACKEND (host statico / CDN) —— */
    var r1 = await timed('43 · Backend GET /', origin + '/', 'GET');
    lines.push({ cat: 'BE', text: r1.line });
    var r2 = await timed('44 · Backend GET /robots.txt', origin + '/robots.txt', 'GET');
    lines.push({ cat: 'BE', text: r2.line });
    var r3 = await timed('45 · Backend GET /sitemap.xml', origin + '/sitemap.xml', 'GET');
    lines.push({ cat: 'BE', text: r3.line });
    var r4 = await timed('46 · Backend HEAD /', origin + '/', 'HEAD');
    lines.push({ cat: 'BE', text: r4.line });

    lines.push({ cat: 'BE', text: '47 · page URL: ' + window.location.href });
    lines.push({ cat: 'BE', text: '48 · origin: ' + origin });
    lines.push({ cat: 'BE', text: '49 · pathname: ' + path });
    lines.push({
      cat: 'BE',
      text: '50 · ISO timestamp (client): ' + new Date().toISOString(),
    });

    function brandLogoAlphaProbe(img) {
      if (!img || !img.complete || !img.naturalWidth) return 'n/a (incomplete)';
      try {
        var cv = document.createElement('canvas');
        var w = Math.min(16, img.naturalWidth);
        var h = Math.min(16, img.naturalHeight);
        cv.width = w;
        cv.height = h;
        var xctx = cv.getContext('2d');
        if (!xctx) return 'n/a (no 2d context)';
        xctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, w, h);
        var d = xctx.getImageData(0, 0, 1, 1).data;
        return 'TL rgba ' + d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3] + ' (alpha<255 ⇒ decoded transparency)';
      } catch (e) {
        return 'n/a (' + (e && e.message ? e.message : String(e)) + ')';
      }
    }

    (function pushBrandLogoDiagnostics() {
      var img = document.querySelector('img.brand-logo');
      if (!img) {
        lines.push({ cat: 'FE', text: '51 · brand-logo: (no img.brand-logo in DOM)' });
        lines.push({ cat: 'FE', text: '52 · brand-logo computed: n/a' });
        lines.push({ cat: 'FE', text: '53 · brand-logo parent / alpha probe: n/a' });
        return;
      }
      var fname = '';
      try {
        var u = new URL(img.currentSrc || img.src, window.location.href);
        fname = u.pathname.split('/').pop() || u.href;
      } catch (e2) {
        fname = img.getAttribute('src') || '';
      }
      var nat = img.naturalWidth && img.naturalHeight ? img.naturalWidth + '×' + img.naturalHeight : '(not decoded)';
      lines.push({
        cat: 'FE',
        text:
          '51 · brand-logo file: ' +
          fname +
          ' · complete=' +
          (img.complete ? 'yes' : 'no') +
          ' · natural=' +
          nat,
      });
      var cs = window.getComputedStyle(img);
      lines.push({
        cat: 'FE',
        text:
          '52 · brand-logo computed: background=' +
          cs.backgroundColor +
          ' · mix-blend=' +
          cs.mixBlendMode +
          ' · opacity=' +
          cs.opacity,
      });
      var par = img.parentElement;
      var ps = par ? window.getComputedStyle(par) : null;
      var parDesc = par
        ? '<' + par.tagName.toLowerCase() + (par.className ? '.' + String(par.className).trim().replace(/\s+/g, '.') : '') + '>'
        : '(none)';
      lines.push({
        cat: 'FE',
        text:
          '53 · brand-logo parent ' +
          parDesc +
          ': bg=' +
          (ps ? ps.backgroundColor : 'n/a') +
          ' · radius=' +
          (ps ? ps.borderRadius : 'n/a') +
          ' · ' +
          brandLogoAlphaProbe(img),
      });
    })();

  var rootEl = document.documentElement;
  var rootCs = window.getComputedStyle(rootEl);
  var bodyCs = window.getComputedStyle(document.body);
  var docClientW = rootEl.clientWidth;
  var docScrollW = rootEl.scrollWidth;
  var overflowX = docScrollW > docClientW + 1;
  lines.push({
    cat: 'FE',
    text:
      '54 · layout overflow-x: ' +
      (overflowX ? 'yes' : 'no') +
      ' · doc clientW=' +
      docClientW +
      ' · scrollW=' +
      docScrollW +
      ' · Δ=' +
      (docScrollW - docClientW) +
      'px · scrollX=' +
      window.scrollX,
  });
  lines.push({
    cat: 'FE',
    text:
      '55 · overflow CSS: html overflow-x=' +
      rootCs.overflowX +
      ' · body overflow-x=' +
      bodyCs.overflowX +
      ' · body overflow-y=' +
      bodyCs.overflowY,
  });
  var vv = window.visualViewport;
  lines.push({
    cat: 'FE',
    text: vv
      ? '56 · visualViewport: ' +
        Math.round(vv.width) +
        '×' +
        Math.round(vv.height) +
        ' · scale=' +
        vv.scale +
        ' · offsetTop=' +
        Math.round(vv.offsetTop) +
        ' · offsetLeft=' +
        Math.round(vv.offsetLeft)
      : '56 · visualViewport: n/a',
  });
  lines.push({ cat: 'FE', text: '57 · safe-area (env): ' + envSafeArea() });
  lines.push({
    cat: 'FE',
    text:
      '58 · display-mode standalone: ' +
      mm('(display-mode: standalone)') +
      ' · prefers-contrast more: ' +
      mm('(prefers-contrast: more)'),
  });
  var logos = document.querySelectorAll('img.brand-logo');
  var logoSrcs = [];
  for (var li = 0; li < logos.length; li++) {
    try {
      logoSrcs.push(new URL(logos[li].currentSrc || logos[li].src, window.location.href).pathname);
    } catch (e3) {
      logoSrcs.push(logos[li].getAttribute('src') || '(src?)');
    }
  }
  lines.push({
    cat: 'FE',
    text:
      '59 · brand-logo count: ' +
      logos.length +
      (logoSrcs.length ? ' · paths: ' + logoSrcs.join(', ') : ''),
  });
  lines.push({
    cat: 'FE',
    text:
      '60 · canvas --ink: ' +
      rootCs.getPropertyValue('--ink').trim() +
      ' · body background: ' +
      bodyCs.backgroundColor,
  });
  lines.push({ cat: 'FE', text: '64 · secure context: ' + (window.isSecureContext ? 'yes' : 'no') });
  lines.push({ cat: 'FE', text: '65 · document.hasFocus: ' + (document.hasFocus() ? 'yes' : 'no') });
  lines.push({
    cat: 'FE',
    text:
      '66 · document.fonts: status=' +
      (document.fonts ? document.fonts.status : 'n/a') +
      ' · count=' +
      (document.fonts ? document.fonts.size : 'n/a'),
  });
  var storageEstimate = 'n/a';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      var est = await navigator.storage.estimate();
      var usageMb = est && est.usage != null ? Math.round(est.usage / 1048576) : null;
      var quotaMb = est && est.quota != null ? Math.round(est.quota / 1048576) : null;
      storageEstimate =
        'usage≈' +
        (usageMb != null ? usageMb + ' MB' : 'n/a') +
        ' · quota≈' +
        (quotaMb != null ? quotaMb + ' MB' : 'n/a');
    }
  } catch (e4) {
    storageEstimate = 'n/a (' + (e4 && e4.message ? e4.message : String(e4)) + ')';
  }
  lines.push({ cat: 'DB', text: '67 · storage estimate: ' + storageEstimate });
  var swController = 'n/a';
  try {
    if ('serviceWorker' in navigator) {
      swController = navigator.serviceWorker.controller ? 'active' : 'none';
    } else {
      swController = 'unsupported';
    }
  } catch (e5) {
    swController = 'n/a';
  }
  lines.push({ cat: 'FE', text: '68 · service worker controller: ' + swController });

  function apiProbeNote(status, json, serviceKey) {
    if (status === 404) {
      return ' · note=static-only or wrong Railway start (need node server.mjs / Dockerfile)';
    }
    if (!status) return ' · note=network error';
    if (status !== 200) return ' · note=unexpected HTTP ' + status;
    if (!json || json[serviceKey] !== 'serviceopera') {
      return ' · note=HTTP 200 but not ServiceOpera Node JSON (CDN/static?)';
    }
    return ' · note=Node API OK';
  }

  var verProbe = await timedJson('/api/version');
  lines.push({
    cat: 'BE',
    text:
      '61 · API /api/version: HTTP ' +
      verProbe.status +
      ' · ' +
      verProbe.ms +
      ' ms' +
      (verProbe.ok ? ' · ok' : ' · fail') +
      (verProbe.json && verProbe.json.version ? ' · version=' + verProbe.json.version : verProbe.err ? ' · ' + verProbe.err : '') +
      (verProbe.status === 404
        ? ' · note=static-only or wrong Railway start (need node server.mjs / Dockerfile)'
        : verProbe.ok && verProbe.json && verProbe.json.version
          ? ' · note=Node API OK'
          : verProbe.ok
            ? ' · note=HTTP 200 but unexpected JSON'
            : ''),
  });
  var portalCap = await timedJson('/api/auth/user-capabilities');
  var cc = portalCap.json || {};
  lines.push({
    cat: 'BE',
    text:
      '62 · API user-capabilities: HTTP ' +
      portalCap.status +
      ' · ' +
      portalCap.ms +
      ' ms · service=' +
      (cc.service != null ? cc.service : 'n/a') +
      ' · passwordResetEmail=' +
      (cc.passwordResetEmail != null ? String(cc.passwordResetEmail) : 'n/a') +
      apiProbeNote(portalCap.status, cc, 'service') +
      (portalCap.status === 200 && cc.service === 'serviceopera' && cc.passwordResetEmail === false
        ? ' · resend=RESEND_API_KEY unset on Node service'
        : ''),
  });
  var adminCap = await timedJson('/api/admin/capabilities');
  var ac = adminCap.json || {};
  lines.push({
    cat: 'BE',
    text:
      '63 · API admin-capabilities: HTTP ' +
      adminCap.status +
      ' · ' +
      adminCap.ms +
      ' ms · otpEnabled=' +
      (ac.otpEnabled != null ? String(ac.otpEnabled) : 'n/a') +
      ' · userPasswordResetEmail=' +
      (ac.userPasswordResetEmail != null
        ? String(ac.userPasswordResetEmail)
        : ac.clinicPasswordResetEmail != null
          ? String(ac.clinicPasswordResetEmail)
          : 'n/a') +
      apiProbeNote(adminCap.status, ac, 'service') +
      (adminCap.status === 200 && ac.service === 'serviceopera' && ac.otpEnabled === false
        ? ' · resend=RESEND_API_KEY unset on Node service'
        : ''),
  });

  var storeProbe = await timedJson('/api/debug/user-store');
  var storeJson = storeProbe.json || {};
  var store = storeJson.storage || null;
  lines.push({
    cat: 'DB',
    text:
      '69 · API /api/debug/user-store: HTTP ' +
      storeProbe.status +
      ' · ' +
      storeProbe.ms +
      ' ms' +
      (storeProbe.ok ? ' · ok' : ' · fail') +
      (storeProbe.status === 404
        ? ' · note=Node API not running; user_accounts.json is not reachable from this host'
        : storeJson.service === 'serviceopera' && store
          ? ' · note=server JSON user store'
          : storeProbe.err
            ? ' · ' + storeProbe.err
            : ''),
  });
  if (store) {
    lines.push({
      cat: 'DB',
      text:
        '70 · user store backend: ' +
        store.backend +
        ' · DATA_DIR=' +
        store.dataDir +
        ' · writable=' +
        store.writable,
    });
    lines.push({
      cat: 'DB',
      text:
        '71 · confirmed users: ' +
        store.confirmedUserCount +
        ' · pending registrations: ' +
        store.pendingRegistrationCount,
    });
    lines.push({
      cat: 'DB',
      text:
        '72 · accounts file: ' +
        (store.accountsFileStats && store.accountsFileStats.exists ? 'present' : 'missing') +
        ' · bytes=' +
        (store.accountsFileStats ? store.accountsFileStats.bytes : 'n/a') +
        (store.accountsFileStats && store.accountsFileStats.mtimeIso
          ? ' · mtime=' + store.accountsFileStats.mtimeIso
          : ''),
    });
    lines.push({
      cat: 'DB',
      text:
        '73 · pending file: ' +
        (store.pendingFileStats && store.pendingFileStats.exists ? 'present' : 'missing') +
        ' · bytes=' +
        (store.pendingFileStats ? store.pendingFileStats.bytes : 'n/a'),
    });
  } else if (storeProbe.status === 404) {
    lines.push({
      cat: 'DB',
      text:
        '70 · user accounts are not saved in the browser; they require the Node server and a persistent DATA_DIR volume on Railway.',
    });
  }

    /* —— Portal password reset (login.html only) —— */
    var onPortalLogin = /\/login\.html$/i.test(path) || path === '/login' || path.endsWith('/login.html');
    if (onPortalLogin) {
      lines.push({
        cat: 'PW',
        text:
          '01 · Reset password via email: the browser calls POST /api/auth/user-request-reset on the same origin. Requires the Node backend (server.mjs), not a static-only host.',
      });
      var apiMissing = verProbe.status === 404 || portalCap.status === 404;
      if (apiMissing) {
        lines.push({
          cat: 'PW',
          text:
            '02 · Issue detected: [BE] rows 61–62 return HTTP 404 ⇒ this URL does not expose /api/*. The HTML page loads, but Express is not running here: no reset email can be sent.',
        });
        lines.push({
          cat: 'PW',
          text:
            '03 · Fix (Railway): run a service that starts `node server.mjs` (repo Dockerfile + `railway.toml` startCommand). Do not publish only `public/` as a static site on the URL used for login.',
        });
      } else if (portalCap.status === 200 && cc.service === 'serviceopera' && cc.passwordResetEmail === false) {
        lines.push({
          cat: 'PW',
          text:
            '02 · API reachable but passwordResetEmail=false: set RESEND_API_KEY and RESEND_FROM (verified sender in Resend) on the Node service, redeploy, and reload.',
        });
      } else if (portalCap.status === 200 && cc.service === 'serviceopera' && cc.passwordResetEmail === true) {
        lines.push({
          cat: 'PW',
          text:
            '02 · API and reset email configured (passwordResetEmail=true). If no mail arrives: check spam, wrong email, or inspect Resend / Railway deploy logs.',
        });
      } else {
        lines.push({
          cat: 'PW',
          text:
            '02 · Mixed state: user-capabilities HTTP ' +
            portalCap.status +
            ' · service=' +
            (cc.service != null ? String(cc.service) : 'n/a') +
            ' · passwordResetEmail=' +
            (cc.passwordResetEmail != null ? String(cc.passwordResetEmail) : 'n/a'),
        });
      }
      lines.push({
        cat: 'PW',
        text:
          '04 · Workaround: Jack can set a new password in Admin → Users until the domain points at the Node service with active APIs.',
      });
    }

    return lines;
  }

  function mount() {
    if (document.getElementById(BTN_ID)) return;

    var dock = document.createElement('div');
    dock.id = DOCK_ID;
    dock.className = 'debug-dock';

    var fab = document.createElement('button');
    fab.id = BTN_ID;
    fab.type = 'button';
    fab.className = 'debug-fab mono';
    fab.textContent = '';
    fab.setAttribute('aria-label', 'Show or hide debug information');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', PANEL_ID);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'debug-panel is-hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Debug report');
    panel.innerHTML =
      '<div class="debug-panel__card">' +
      '<div class="debug-panel__head">' +
      '<span class="mono debug-panel__title" id="soDebugTitle">— DEBUG · … checks</span>' +
      '<button type="button" class="debug-panel__close mono" data-debug-close aria-label="Close panel"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '</div>' +
      '<p class="debug-panel__sub mono">DB = local storage · FE = browser · BE = HTTP to this host. Rows 51–53: <code>img.brand-logo</code>. Rows 54–60: layout, viewport, safe-area, theme. Rows 61–63: <code>/api/version</code> and capabilities (Resend / login). Rows 64–68: secure context, focus, fonts, storage estimate, service worker. Rows 69–73: server user JSON store (<code>/api/debug/user-store</code>). On <code>login.html</code>, <strong>[PW]</strong> rows (password-reset diagnostics) appear too. Select the text below and copy (Ctrl+C), or use the button.</p>' +
      '<div class="debug-panel__status mono" id="soDebugStatus">Running…</div>' +
      '<pre class="debug-panel__out mono" id="soDebugOut" tabindex="0"></pre>' +
      '<div class="debug-panel__actions">' +
      '<button type="button" class="btn btn--ghost mono debug-panel__copy" id="soDebugCopy">Copy report</button>' +
      '</div></div>';

    dock.appendChild(fab);
    dock.appendChild(panel);
    document.body.appendChild(dock);

    function applyAppVersion(ver) {
      if (!ver) return;
      var v = String(ver).trim();
      if (!v) return;
      fab.textContent = v;
      fab.removeAttribute('title');
      fab.setAttribute('aria-label', 'Show or hide debug information (version ' + v + ')');
    }

    fetch(new URL('/api/version', window.location.origin), { cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (j && j.version) applyAppVersion(j.version);
        else {
          fab.textContent = '';
          fab.setAttribute('title', 'Debug information');
        }
      })
      .catch(function () {
        fab.textContent = '';
        fab.setAttribute('title', 'Debug information');
      });

    var out = document.getElementById('soDebugOut');
    var status = document.getElementById('soDebugStatus');

    function close() {
      panel.classList.add('is-hidden');
      fab.setAttribute('aria-expanded', 'false');
    }

    function open() {
      panel.classList.remove('is-hidden');
      fab.setAttribute('aria-expanded', 'true');
      status.textContent = 'Running tests…';
      out.textContent = '';
      buildLines()
        .then(function (lines) {
          status.textContent = 'Complete · ' + lines.length + ' lines';
          var titleEl = document.getElementById('soDebugTitle');
          var vv = fab.textContent ? fab.textContent.trim() : '';
          if (titleEl) {
            titleEl.textContent = vv ? '— DEBUG v' + vv + ' · ' + lines.length + ' checks' : '— DEBUG · ' + lines.length + ' checks';
          }
          out.textContent = lines
            .map(function (row) {
              return '[' + row.cat + '] ' + row.text;
            })
            .join('\n');
        })
        .catch(function (e) {
          status.textContent = 'Error collecting data';
          out.textContent = String(e && e.message ? e.message : e);
        });
    }

    fab.addEventListener('click', function () {
      if (panel.classList.contains('is-hidden')) open();
      else close();
    });

    panel.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-debug-close]')) close();
    });

    document.getElementById('soDebugCopy').addEventListener('click', function () {
      var t = out.textContent || '';
      if (!t) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(
          function () {
            status.textContent = 'Copied to clipboard';
          },
          function () {
            status.textContent = 'Copy failed';
          }
        );
      } else {
        status.textContent = 'Clipboard API unavailable';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.classList.contains('is-hidden')) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
