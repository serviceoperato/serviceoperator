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

  async function timedJson(path) {
    var t0 = performance.now();
    var url = typeof soApiUrl === 'function' ? soApiUrl(path) : path;
    var cred = typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
    try {
      var r = await fetch(url, { method: 'GET', cache: 'no-store', credentials: cred });
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

  function jwtKeySummary() {
    var keys = [
      { key: 'so_user_jwt', label: 'portal user' },
      { key: 'so_clinic_jwt', label: 'legacy clinic' },
      { key: 'so_admin_jwt', label: 'admin JWT' },
    ];
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var raw = '';
      try {
        raw = sessionStorage.getItem(keys[i].key) || localStorage.getItem(keys[i].key) || '';
      } catch (e) {
        raw = '';
      }
      parts.push(keys[i].label + '=' + (raw ? 'present · len=' + raw.length : 'not set'));
    }
    return parts.join(' · ');
  }

  function readPortalJwt() {
    try {
      return (
        sessionStorage.getItem('so_user_jwt') ||
        sessionStorage.getItem('so_clinic_jwt') ||
        localStorage.getItem('so_user_jwt') ||
        localStorage.getItem('so_clinic_jwt') ||
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function looksLikeJwt(tok) {
    var s = String(tok || '').trim();
    if (!s) return false;
    var parts = s.split('.');
    return parts.length === 3 && parts[0].length > 0 && parts[1].length > 0 && parts[2].length > 0;
  }

  function readLoginProbe() {
    try {
      var raw = sessionStorage.getItem('so_auth_login_probe') || '';
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (eLp) {
      return null;
    }
  }

  function portalJwtStorageSites() {
    var keys = ['so_user_jwt', 'so_clinic_jwt'];
    var ss = false;
    var ls = false;
    for (var i = 0; i < keys.length; i++) {
      try {
        if (sessionStorage.getItem(keys[i])) ss = true;
        if (localStorage.getItem(keys[i])) ls = true;
      } catch (ePs) {}
    }
    return { ss: ss, ls: ls };
  }

  function decodeJwtReportSlug(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length < 2) return '';
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      var json = JSON.parse(atob(payload));
      return typeof json.reportSlug === 'string' ? json.reportSlug.trim() : '';
    } catch (eRs) {
      return '';
    }
  }

  async function timedJsonAuth(urlPath, token) {
    var t0 = performance.now();
    var url = typeof soApiUrl === 'function' ? soApiUrl(urlPath) : urlPath;
    var cred = typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
    try {
      var headers = token ? { Authorization: 'Bearer ' + token } : {};
      var r = await fetch(url, { method: 'GET', cache: 'no-store', credentials: cred, headers: headers });
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

  var EXPECTED_POSTGRES_TABLES = ['portal_users', 'portal_pending_registrations'];
  var EXPECTED_POSTGRES_PROFILE_COLUMNS = [
    'display_name',
    'gender',
    'is_active',
    'is_admin',
    'is_plus',
    'spend_cents',
    'earned_cents',
    'last_login_at',
    'last_login_ip',
    'country',
    'updated_at',
  ];
  var REFERENCE_NODE_ORIGINS = ['https://serviceoperato-backend-production.up.railway.app'];

  async function timedJsonAbsolute(url) {
    var t0 = performance.now();
    try {
      var r = await fetch(url, { method: 'GET', cache: 'no-store', mode: 'cors' });
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

  async function probeReferenceUserStore(pageOrigin) {
    var out = [];
    for (var i = 0; i < REFERENCE_NODE_ORIGINS.length; i++) {
      var refOrigin = String(REFERENCE_NODE_ORIGINS[i] || '').replace(/\/$/, '');
      if (!refOrigin || refOrigin === pageOrigin) continue;
      var probe = await timedJsonAbsolute(refOrigin + '/api/debug/user-store');
      out.push({ origin: refOrigin, probe: probe });
      if (probe.json && probe.json.storage) return out;
    }
    return out;
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

    /* —— Browser storage (not server PostgreSQL) —— */
    lines.push({ cat: 'STORE', text: '01 · localStorage roundtrip: ' + dbRoundtrip() });
    var lsKeys = storageKeys(localStorage);
    lines.push({ cat: 'STORE', text: '02 · localStorage key count: ' + lsKeys.length });
    lines.push({ cat: 'STORE', text: '03 · localStorage keys: ' + (lsKeys.join(', ') || '(empty)') });
    var th = '';
    try {
      th = localStorage.getItem('so-theme') || '(not set)';
    } catch (e) {
      th = '(read error)';
    }
    lines.push({ cat: 'STORE', text: '04 · localStorage so-theme: ' + th });
    var ssKeys = storageKeys(sessionStorage);
    lines.push({ cat: 'STORE', text: '05 · sessionStorage key count: ' + ssKeys.length });
    lines.push({ cat: 'STORE', text: '06 · sessionStorage keys: ' + (ssKeys.join(', ') || '(empty)') });
    lines.push({ cat: 'STORE', text: '07 · IndexedDB in window: ' + ('indexedDB' in window ? 'yes' : 'no') });
    lines.push({ cat: 'STORE', text: '08 · navigator.cookieEnabled: ' + (navigator.cookieEnabled ? 'yes' : 'no') });
    lines.push({
      cat: 'STORE',
      text:
        '08b · note: [STORE] rows are browser-only. Server PostgreSQL / Railway tables are reported in [DB] rows 69+.',
    });

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

    var jackAppear = await timedJson('/api/site-appearance');
    var jackJ = jackAppear.json || {};
    var jackUrlRaw = typeof jackJ.jackAvatarUrl === 'string' ? jackJ.jackAvatarUrl : '(not string)';
    var jackUrlSnip = jackUrlRaw.length > 140 ? jackUrlRaw.slice(0, 140) + '…' : jackUrlRaw;
    lines.push({
      cat: 'FE',
      text:
        '53b · GET /api/site-appearance jackAvatarUrl: HTTP ' +
        jackAppear.status +
        ' · ' +
        jackAppear.ms +
        ' ms · raw≈' +
        jackUrlSnip,
    });
    var resolveJack = '';
    try {
      resolveJack =
        typeof window.__soResolveSitePublicAssetUrl === 'function'
          ? String(window.__soResolveSitePublicAssetUrl('/assets/jack-avatar.png') || '(empty)')
          : '(no __soResolveSitePublicAssetUrl)';
    } catch (eR) {
      resolveJack = 'err: ' + (eR && eR.message ? eR.message : String(eR));
    }
    var resolveJackDisp = resolveJack.length > 160 ? resolveJack.slice(0, 160) + '…' : resolveJack;
    lines.push({ cat: 'FE', text: '53c · __soResolveSitePublicAssetUrl(/assets/jack-avatar.png): ' + resolveJackDisp });
    var metaApi = '';
    try {
      var mo = document.querySelector('meta[name="so-api-origin"]');
      metaApi = mo && mo.getAttribute('content') ? mo.getAttribute('content').trim() : '(no meta)';
    } catch (eM) {
      metaApi = 'n/a';
    }
    lines.push({ cat: 'FE', text: '53d · meta so-api-origin: ' + (metaApi.length > 120 ? metaApi.slice(0, 120) + '…' : metaApi) });
    var jackImgs = document.querySelectorAll('[data-so-jack-avatar] img.so-b2b__jack-photo');
    var jackImg0 = jackImgs.length ? jackImgs[0] : null;
    if (!jackImg0) {
      lines.push({
        cat: 'FE',
        text: '53e · jack-photo: (no [data-so-jack-avatar] img.so-b2b__jack-photo in DOM) · count=0',
      });
    } else {
      var jSrc = '';
      try {
        jSrc = new URL(jackImg0.currentSrc || jackImg0.src, window.location.href).href;
      } catch (eJ) {
        jSrc = jackImg0.getAttribute('src') || '(src?)';
      }
      var jNat =
        jackImg0.naturalWidth && jackImg0.naturalHeight
          ? jackImg0.naturalWidth + '×' + jackImg0.naturalHeight
          : '(not decoded)';
      lines.push({
        cat: 'FE',
        text:
          '53e · jack-photo: inDOM=yes · count=' +
          jackImgs.length +
          ' · resolved=' +
          (jSrc.length > 140 ? jSrc.slice(0, 140) + '…' : jSrc) +
          ' · complete=' +
          (jackImg0.complete ? 'yes' : 'no') +
          ' · natural=' +
          jNat +
          ' · load-error-class=' +
          (jackImg0.classList && jackImg0.classList.contains('so-b2b__jack-photo--load-error') ? 'yes' : 'no'),
      });
    }
    var decoRoot = document.documentElement;
    var decoCs = window.getComputedStyle(decoRoot);
    var trUrlProp = (decoCs.getPropertyValue('--so-hero-deco-tr-url') || '').trim();
    var blUrlProp = (decoCs.getPropertyValue('--so-hero-deco-bl-url') || '').trim();
    lines.push({
      cat: 'FE',
      text:
        '53f · hero deco (--so-hero-deco-* on html): tr-url=' +
        (trUrlProp.length > 80 ? trUrlProp.slice(0, 80) + '…' : trUrlProp) +
        ' · tr-op=' +
        (decoCs.getPropertyValue('--so-hero-deco-tr-opacity') || '?').trim() +
        ' · bl-url=' +
        (blUrlProp.length > 80 ? blUrlProp.slice(0, 80) + '…' : blUrlProp) +
        ' · bl-op=' +
        (decoCs.getPropertyValue('--so-hero-deco-bl-opacity') || '?').trim(),
    });

    (function pushHeroBlDiagnostics() {
      var htmlCs = window.getComputedStyle(decoRoot);
      var rawBlUrl = (htmlCs.getPropertyValue('--so-hero-deco-bl-url') || '').trim();
      var blUrlDisp = rawBlUrl;
      if (/^url\(/i.test(rawBlUrl)) {
        blUrlDisp = rawBlUrl
          .replace(/^url\(\s*/i, '')
          .replace(/\s*\)\s*$/, '')
          .trim();
        if (
          (blUrlDisp.charAt(0) === '"' && blUrlDisp.charAt(blUrlDisp.length - 1) === '"') ||
          (blUrlDisp.charAt(0) === "'" && blUrlDisp.charAt(blUrlDisp.length - 1) === "'")
        ) {
          blUrlDisp = blUrlDisp.slice(1, -1).trim();
        }
      }
      if (blUrlDisp.length > 100) blUrlDisp = blUrlDisp.slice(0, 100) + '…';
      var blVarOp = (htmlCs.getPropertyValue('--so-hero-deco-bl-opacity') || '').trim() || '(unset)';
      lines.push({
        cat: 'FE',
        text: '53g · hero BL (computed on html): --so-hero-deco-bl-url≈' + (blUrlDisp || '(empty)') + ' · --so-hero-deco-bl-opacity=' + blVarOp,
      });
      var blNodes = document.querySelectorAll('.so-b2b__hero-deco--bl');
      lines.push({
        cat: 'FE',
        text: '53h · .so-b2b__hero-deco--bl: inDOM=' + (blNodes.length ? 'yes' : 'no') + ' · count=' + blNodes.length,
      });
      var bl0 = blNodes.length ? blNodes[0] : null;
      var vh = window.innerHeight;
      if (!bl0) {
        lines.push({ cat: 'FE', text: '53i · hero BL geometry: n/a (no element)' });
      } else {
        var r = bl0.getBoundingClientRect();
        var distBottom = Math.round(vh - r.bottom);
        lines.push({
          cat: 'FE',
          text:
            '53i · hero BL rect: bottom=' +
            Math.round(r.bottom) +
            ' · innerHeight=' +
            vh +
            ' · px above viewport bottom=' +
            distBottom,
        });
      }
      var metaAo = '';
      try {
        var mAo = document.querySelector('meta[name="so-api-origin"]');
        metaAo = mAo && mAo.getAttribute('content') ? mAo.getAttribute('content').trim() : '(no meta)';
      } catch (eAo) {
        metaAo = 'n/a';
      }
      var fnOrigin = '';
      try {
        fnOrigin =
          typeof soApiOrigin === 'function' ? String(soApiOrigin() || '(empty)') : '(no soApiOrigin)';
      } catch (eFn) {
        fnOrigin = 'err: ' + (eFn && eFn.message ? eFn.message : String(eFn));
      }
      var metaShort = metaAo.length > 72 ? metaAo.slice(0, 72) + '…' : metaAo;
      var fnShort = fnOrigin.length > 72 ? fnOrigin.slice(0, 72) + '…' : fnOrigin;
      lines.push({ cat: 'FE', text: '53j · so-api-origin: meta=' + metaShort + ' · soApiOrigin()=' + fnShort });
      var jackWrap = document.querySelector('[data-so-jack-avatar]');
      var jackLoaded = jackWrap && jackWrap.hasAttribute('data-so-jack-loaded') ? 'present' : 'absent';
      lines.push({
        cat: 'FE',
        text: '53k · jack wrap [data-so-jack-avatar]: ' + (jackWrap ? 'inDOM=yes' : 'inDOM=no') + ' · data-so-jack-loaded=' + jackLoaded,
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
  lines.push({ cat: 'STORE', text: '67 · storage estimate: ' + storageEstimate });
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
      ' ms · adminPasswordConfigured=' +
      (ac.adminPasswordConfigured != null ? String(ac.adminPasswordConfigured) : 'n/a') +
      ' · otpEnabled(deprecated)=' +
      (ac.otpEnabled != null ? String(ac.otpEnabled) : 'n/a') +
      ' · userPasswordResetEmail=' +
      (ac.userPasswordResetEmail != null
        ? String(ac.userPasswordResetEmail)
        : ac.clinicPasswordResetEmail != null
          ? String(ac.clinicPasswordResetEmail)
          : 'n/a') +
      apiProbeNote(adminCap.status, ac, 'service') +
      (adminCap.status === 200 && ac.service === 'serviceopera' && ac.adminPasswordConfigured === false
        ? ' · note=set ADMIN_PASSWORD_HASH on Node (see README)'
        : ''),
  });

  var storeProbe = await timedJson('/api/debug/user-store');
  var storeJson = storeProbe.json || {};
  var store = storeJson.storage || null;
  var deploy = storeJson.deploy || null;
  var storeSource = 'same-origin';
  var referenceProbes = [];

  if (!store) {
    referenceProbes = await probeReferenceUserStore(origin);
    for (var rp = 0; rp < referenceProbes.length; rp++) {
      var ref = referenceProbes[rp];
      if (ref.probe && ref.probe.json && ref.probe.json.storage) {
        store = ref.probe.json.storage;
        deploy = ref.probe.json.deploy || null;
        storeJson = ref.probe.json;
        storeSource = ref.origin;
        break;
      }
    }
  }

  lines.push({
    cat: 'DB',
    text:
      '69 · API /api/debug/user-store (this page): HTTP ' +
      storeProbe.status +
      ' · ' +
      storeProbe.ms +
      ' ms' +
      (storeProbe.ok ? ' · ok' : ' · fail') +
      (storeProbe.status === 404
        ? ' · note=Node API not running on this hostname'
        : storeJson.service === 'serviceopera' && storeProbe.json && storeProbe.json.storage
          ? ' · note=server user store summary'
          : storeProbe.err
            ? ' · ' + storeProbe.err
            : ''),
  });
  lines.push({
    cat: 'DB',
    text:
      '70 · server database visible on this page: ' +
      (storeProbe.status === 200 && storeProbe.json && storeProbe.json.storage ? 'yes' : 'no'),
  });
  if (storeProbe.status !== 200 || !storeProbe.json || !storeProbe.json.storage) {
    for (var rpi = 0; rpi < referenceProbes.length; rpi++) {
      var refRow = referenceProbes[rpi];
      var refProbe = refRow.probe || {};
      var refStore = refProbe.json && refProbe.json.storage ? refProbe.json.storage : null;
      lines.push({
        cat: 'DB',
        text:
          '71 · reference Node probe ' +
          refRow.origin +
          '/api/debug/user-store: HTTP ' +
          (refProbe.status || 0) +
          ' · ' +
          (refProbe.ms != null ? refProbe.ms : 'n/a') +
          ' ms' +
          (refStore
            ? ' · backend=' + refStore.backend + ' · tables=' + (refStore.tables || EXPECTED_POSTGRES_TABLES).join(', ')
            : refProbe.err
              ? ' · ' + refProbe.err
              : ' · note=remote Node API not reachable from browser (CORS/network)'),
      });
    }
    if (!referenceProbes.length) {
      lines.push({
        cat: 'DB',
        text:
          '71 · reference Node probe: skipped (no alternate Node origin configured for this page)',
      });
    }
  }
  if (store) {
    lines.push({
      cat: 'DB',
      text:
        '72 · user store source: ' +
        storeSource +
        ' · backend=' +
        store.backend +
        (store.backend === 'postgres'
          ? ' · persistence=PostgreSQL'
          : ' · persistence=JSON files under DATA_DIR'),
    });
  } else {
    lines.push({
      cat: 'DB',
      text:
        '72 · user store source: unavailable · expected PostgreSQL tables when Node + DATABASE_URL: ' +
        EXPECTED_POSTGRES_TABLES.join(', '),
    });
  }
  if (deploy) {
    lines.push({
      cat: 'DB',
      text:
        '73 · deploy user store backend: ' +
        (deploy.userStoreBackend || 'n/a') +
        ' · DATABASE_URL on server: ' +
        (deploy.databaseUrlConfigured ? 'configured' : 'not set (JSON fallback)') +
        ' · Node ' +
        (deploy.nodeVersion || 'n/a'),
    });
    lines.push({
      cat: 'DB',
      text:
        '74 · deploy DATA_DIR: ' +
        (deploy.dataDir || 'n/a') +
        ' · selfRegister=' +
        (deploy.portalSelfRegister != null ? String(deploy.portalSelfRegister) : 'n/a') +
        ' · resend=' +
        (deploy.resendConfigured != null ? String(deploy.resendConfigured) : 'n/a') +
        ' · confirmEmail=' +
        (deploy.registrationConfirmEmail != null ? String(deploy.registrationConfirmEmail) : 'n/a') +
        ' · adminEmailConfigured=' +
        (deploy.adminEmailConfigured != null ? String(deploy.adminEmailConfigured) : 'n/a'),
    });
  }
  if (store) {
    lines.push({
      cat: 'DB',
      text:
        '75 · confirmed users: ' +
        store.confirmedUserCount +
        ' · pending registrations: ' +
        store.pendingRegistrationCount,
    });
    if (store.backend === 'postgres') {
      lines.push({
        cat: 'DB',
        text:
          '76 · Postgres tables: ' +
          (store.tables && store.tables.length ? store.tables.join(', ') : EXPECTED_POSTGRES_TABLES.join(', ')),
      });
      lines.push({
        cat: 'DB',
        text:
          '77 · portal_users profile columns: ' +
          (store.profileColumns && store.profileColumns.length
            ? store.profileColumns.join(', ')
            : EXPECTED_POSTGRES_PROFILE_COLUMNS.join(', ')),
      });
      lines.push({
        cat: 'DB',
        text:
          '78 · Postgres row counts: confirmed=' +
          store.confirmedUserCount +
          ' · pending=' +
          store.pendingRegistrationCount +
          (store.confirmedUserCount === 0 && store.pendingRegistrationCount === 0
            ? ' · note=tables exist; no user rows yet'
            : ''),
      });
    } else {
      lines.push({
        cat: 'DB',
        text:
          '76 · DATA_DIR: ' +
          (store.dataDir || 'n/a') +
          ' · writable=' +
          (store.writable != null ? String(store.writable) : 'n/a'),
      });
      lines.push({
        cat: 'DB',
        text:
          '77 · accounts file: ' +
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
          '78 · pending file: ' +
          (store.pendingFileStats && store.pendingFileStats.exists ? 'present' : 'missing') +
          ' · bytes=' +
          (store.pendingFileStats ? store.pendingFileStats.bytes : 'n/a'),
      });
    }
  } else if (storeProbe.status === 404) {
    lines.push({
      cat: 'DB',
      text:
        '75 · server PostgreSQL: not visible from this page origin · expected tables: ' +
        EXPECTED_POSTGRES_TABLES.join(', '),
    });
    lines.push({
      cat: 'DB',
      text:
        '76 · expected portal_users columns: ' + EXPECTED_POSTGRES_PROFILE_COLUMNS.join(', '),
    });
    lines.push({
      cat: 'DB',
      text:
        '77 · user accounts are not saved in browser storage; they require the Node server (node server.mjs) and DATABASE_URL or a persistent DATA_DIR volume on Railway.',
    });
  }

  lines.push({
    cat: 'AUTH',
    text:
      '77 · browser JWT keys: ' +
      jwtKeySummary(),
  });
  var portalJwt = readPortalJwt();
  var sessionProbe = await timedJsonAuth('/api/auth/user-session', portalJwt);
  lines.push({
    cat: 'AUTH',
    text:
      '78 · API /api/auth/user-session: HTTP ' +
      sessionProbe.status +
      ' · ' +
      sessionProbe.ms +
      ' ms' +
      (sessionProbe.json && sessionProbe.json.ok && sessionProbe.json.email
        ? ' · email=' + sessionProbe.json.email + ' · reportSlug=' + sessionProbe.json.reportSlug
        : portalJwt
          ? ' · note=JWT present but session rejected or expired'
          : ' · note=no portal JWT in sessionStorage/localStorage'),
  });
  lines.push({
    cat: 'AUTH',
    text:
      '79 · auth routes (same origin): POST /api/auth/user-register · POST /api/auth/user-verify-email · POST /api/auth/user-login · POST /api/auth/user-login-otp · GET /api/auth/user-capabilities',
  });
  lines.push({
    cat: 'AUTH',
    text:
      '80 · admin routes: GET /api/admin/capabilities · POST /api/admin/login · POST /api/admin/bootstrap-from-portal · GET /api/admin/work-queue · GET/PUT /api/admin/site-appearance (body.icons optional map) · POST /api/admin/site-appearance/upload · POST /api/admin/site-appearance/delete-upload · PATCH /api/user-accounts/:id',
  });

  /* —— AUTH/login diagnostics ([AUTH-L]) —— */
  var urlAuthParams = new URLSearchParams(window.location.search);
  var slugAuth = (urlAuthParams.get('slug') || '').trim();
  var nextAuth = (urlAuthParams.get('next') || '').trim();
  var loginProbe = readLoginProbe();
  lines.push({
    cat: 'AUTH-L',
    text:
      '01 · last login POST (this tab): ' +
      (loginProbe
        ? 'HTTP ' +
          (loginProbe.status != null ? loginProbe.status : '?') +
          ' · path=' +
          (loginProbe.path || '?') +
          ' · tokenLen=' +
          (loginProbe.tokenLen != null ? loginProbe.tokenLen : 0) +
          ' · okHttp=' +
          (loginProbe.okHttp != null ? String(loginProbe.okHttp) : 'n/a') +
          ' · at=' +
          (loginProbe.at || '?') +
          (loginProbe.err ? ' · err=' + loginProbe.err : '')
        : '(none — sign in on login.html then reopen DEBUG here or on the report page)'),
  });
  var jwtSites = portalJwtStorageSites();
  var jwtShape = portalJwt ? (looksLikeJwt(portalJwt) ? 'valid-shape' : 'malformed') : 'missing';
  lines.push({
    cat: 'AUTH-L',
    text:
      '02 · portal JWT now: len=' +
      (portalJwt ? portalJwt.length : 0) +
      ' · shape=' +
      jwtShape +
      ' · sessionStorage=' +
      (jwtSites.ss ? 'yes' : 'no') +
      ' · localStorage=' +
      (jwtSites.ls ? 'yes' : 'no') +
      (portalJwt ? ' · jwt.reportSlug=' + (decodeJwtReportSlug(portalJwt) || '(none in payload)') : ''),
  });
  var sessIdSs = false;
  var sessIdLs = false;
  try {
    sessIdSs = !!sessionStorage.getItem('so_user_session_id');
    sessIdLs = !!localStorage.getItem('so_user_session_id');
  } catch (eSid) {}
  lines.push({
    cat: 'AUTH-L',
    text:
      '03 · so_user_session_id: sessionStorage=' +
      (sessIdSs ? 'yes' : 'no') +
      ' · localStorage=' +
      (sessIdLs ? 'yes' : 'no'),
  });
  lines.push({
    cat: 'AUTH-L',
    text:
      '04 · URL auth params: slug=' +
      (slugAuth || '(none)') +
      ' · next=' +
      (nextAuth ? (nextAuth.length > 96 ? nextAuth.slice(0, 96) + '…' : nextAuth) : '(none)') +
      ' · path=' +
      path,
  });
  var reportSlugProbe = slugAuth || decodeJwtReportSlug(portalJwt);
  var reportDataProbe = { ok: false, status: 0, ms: 0, json: null };
  if (reportSlugProbe) {
    reportDataProbe = await timedJsonAuth(
      '/api/clinics/report-data?slug=' + encodeURIComponent(reportSlugProbe),
      portalJwt
    );
  }
  lines.push({
    cat: 'AUTH-L',
    text:
      '05 · GET /api/clinics/report-data?slug=' +
      (reportSlugProbe || '(no slug)') +
      ': HTTP ' +
      reportDataProbe.status +
      ' · ' +
      reportDataProbe.ms +
      ' ms' +
      (reportDataProbe.status === 401
        ? ' · note=gate expected without JWT or slug mismatch'
        : reportDataProbe.ok
          ? ' · note=authorized'
          : reportSlugProbe
            ? ' · note=check slug file on server'
            : ''),
  });
  var pageHost = '';
  try {
    pageHost = window.location.hostname ? String(window.location.hostname).toLowerCase() : '';
  } catch (ePh) {}
  var apiOriginFn = '';
  try {
    apiOriginFn =
      typeof soApiOrigin === 'function' ? String(soApiOrigin() || '').trim() : '(no soApiOrigin)';
  } catch (eAo) {
    apiOriginFn = 'err';
  }
  var apiOriginHost = '';
  if (apiOriginFn && apiOriginFn.indexOf('http') === 0) {
    try {
      apiOriginHost = new URL(apiOriginFn).hostname.toLowerCase();
    } catch (eOh) {}
  }
  var credMode = typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
  var crossApi =
    apiOriginFn && apiOriginFn.indexOf('http') === 0
      ? apiOriginHost !== pageHost
        ? 'yes'
        : 'no'
      : 'no (same-origin /api)';
  lines.push({
    cat: 'AUTH-L',
    text:
      '06 · API client routing: pageOrigin=' +
      origin +
      ' · soApiOrigin()=' +
      (apiOriginFn || '(empty → same-origin /api)') +
      ' · soApiCredentials=' +
      credMode +
      ' · crossOriginApi=' +
      crossApi,
  });
  var probeHost = loginProbe && loginProbe.pageHost ? String(loginProbe.pageHost).toLowerCase() : '';
  var apexWww =
    pageHost === 'serviceopera.to' || pageHost === 'www.serviceopera.to'
      ? probeHost && probeHost !== pageHost
        ? 'mismatch · loginHost=' + probeHost + ' · now=' + pageHost + ' (JWT is per-origin — use one hostname)'
        : pageHost === 'www.serviceopera.to'
          ? 'www'
          : pageHost === 'serviceopera.to'
            ? 'apex'
            : pageHost
      : pageHost || 'n/a';
  lines.push({
    cat: 'AUTH-L',
    text: '07 · hostname (apex/www): ' + apexWww + ' · document.referrer=' + (document.referrer || '(none)'),
  });
  lines.push({
    cat: 'AUTH-L',
    text:
      '08 · split Railway / proxy: proxiedApi=' +
      (ac.proxiedApi != null ? String(ac.proxiedApi) : 'n/a') +
      ' · apiUpstream=' +
      (ac.apiUpstream
        ? String(ac.apiUpstream).replace(/\/+$/, '')
        : '(this Node serves /api locally)') +
      (store && store.backend === 'json-files' && store.confirmedUserCount === 0
        ? ' · warning=user-store on this origin is empty json-files — set SERVICEOPERA_API_UPSTREAM to the Postgres backend or DATABASE_URL here'
        : storeSource && storeSource !== origin && store
          ? ' · note=user-store read from reference ' + storeSource
          : ''),
  });
  var loginLinkHref = '';
  try {
    var loginLinkEl = document.getElementById('demoAuthLoginLink');
    if (loginLinkEl && loginLinkEl.getAttribute('href')) {
      loginLinkHref = loginLinkEl.getAttribute('href');
    }
  } catch (eLl) {}
  lines.push({
    cat: 'AUTH-L',
    text:
      '09 · report gate login link: ' +
      (loginLinkHref
        ? loginLinkHref.length > 140
          ? loginLinkHref.slice(0, 140) + '…'
          : loginLinkHref
        : path.indexOf('/clinics/report') >= 0
          ? '(#demoAuthLoginLink missing)'
          : '(n/a — not on clinics/report.html)'),
  });
  lines.push({
    cat: 'AUTH-L',
    text:
      '10 · login→report handoff: probe.pageOrigin=' +
      (loginProbe && loginProbe.pageOrigin ? loginProbe.pageOrigin : 'n/a') +
      ' · probe.apiOrigin=' +
      (loginProbe && loginProbe.apiOrigin ? loginProbe.apiOrigin : 'n/a') +
      ' · probe.slug=' +
      (loginProbe && loginProbe.slug ? loginProbe.slug : 'n/a') +
      ' · probe.next=' +
      (loginProbe && loginProbe.next
        ? loginProbe.next.length > 72
          ? loginProbe.next.slice(0, 72) + '…'
          : loginProbe.next
        : 'n/a') +
      ' · user-session=' +
      sessionProbe.status +
      (sessionProbe.status === 401 && portalJwt
        ? ' · likely=JWT from different API host/secret or user missing in this origin’s store'
        : ''),
  });

  lines.push({
    cat: 'OPS',
    text:
      '81 · register flow: POST /api/auth/user-register (email only) → portal_pending_registrations → email link register.html?onboard=… → POST /api/auth/user-complete-onboarding → portal_users + portal JWT → report',
  });
  lines.push({
    cat: 'OPS',
    text:
      '82 · Admin APIs: POST /api/admin/login (operator password, hashed env); bootstrap-from-portal mints admin JWT when ADMIN_EMAIL matches a portal session. Operator UI: /admin/users (and /admin/activity, …).',
  });
  if (store && store.backend === 'postgres') {
    lines.push({
      cat: 'OPS',
      text:
        '83 · Postgres health: backend=postgres · confirmed=' +
        store.confirmedUserCount +
        ' · pending=' +
        store.pendingRegistrationCount +
        (store.confirmedUserCount === 0 && store.pendingRegistrationCount === 0
          ? ' · note=schema ready; run a real signup to populate rows'
          : ''),
    });
  } else if (store && store.backend === 'json-files') {
    lines.push({
      cat: 'OPS',
      text:
        '83 · JSON store health: confirmed=' +
        store.confirmedUserCount +
        ' · pending=' +
        store.pendingRegistrationCount +
        ' · set DATABASE_URL on Railway Node service for PostgreSQL persistence',
    });
  } else if (storeProbe.status === 404) {
    lines.push({
      cat: 'OPS',
      text:
        '83 · deploy fix: run node server.mjs on the public hostname (Dockerfile/railway.toml), reference ${{Postgres.DATABASE_URL}} on the backend service, redeploy, then reload this panel.',
    });
  }
  lines.push({
    cat: 'OPS',
    text:
      '84 · production hosts (reference): backend serviceoperato-backend-production.up.railway.app · frontend serviceoperato-frontend-production.up.railway.app · both should answer GET /api/version with HTTP 200',
  });
  lines.push({
    cat: 'BE',
    text:
      '85 · this page origin serves /api/*: ' +
      (verProbe.status === 200 && verProbe.json && verProbe.json.version
        ? 'yes · version=' + verProbe.json.version
        : verProbe.status === 404
          ? 'no · static-only or wrong Railway start command'
          : 'unknown · HTTP ' + verProbe.status),
  });
  lines.push({
    cat: 'OPS',
    text:
      '86 · portal capabilities: selfRegister=' +
      (cc.selfRegister != null ? String(cc.selfRegister) : 'n/a') +
      ' · registrationConfirmEmail=' +
      (cc.registrationConfirmEmail != null ? String(cc.registrationConfirmEmail) : 'n/a') +
      ' · passwordResetEmail=' +
      (cc.passwordResetEmail != null ? String(cc.passwordResetEmail) : 'n/a'),
  });

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
      '<p class="debug-panel__sub mono">STORE = browser storage only · FE = browser · BE = same-origin HTTP · DB = server PostgreSQL / user store · OPS = deploy/Railway · AUTH = portal JWT/session · <strong>AUTH-L</strong> = login/report handoff (10 rows after sign-in). Rows 01–08b: localStorage/sessionStorage (not Railway tables). Rows 69–78: <code>/api/debug/user-store</code> plus reference Node probe when this host is static-only. On <code>login.html</code>, <strong>[PW]</strong> rows too. Select the text below and copy (Ctrl+C), or use the button.</p>' +
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

    var verUrl =
      typeof soApiUrl === 'function' ? soApiUrl('/api/version') : new URL('/api/version', window.location.origin).href;
    fetch(verUrl, { cache: 'no-store', credentials: typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin' })
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
