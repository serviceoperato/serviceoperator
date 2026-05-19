import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

function patchAdminJs() {
  const file = path.join(root, 'public', 'admin.js');
  let n = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  if (!n.includes('function adminAuthHeadersJson()')) {
    n = n.replace(
      /  function adminAuthHeaders\(\) \{\n    var headers = \{\};\n    var token = getAdminBearer\(\);\n    if \(token\) headers\.Authorization = 'Bearer ' \+ token;\n    return headers;\n  \}\n\n  var ADMIN_AUTH_LOOP_KEY/,
      `  function adminAuthHeaders() {
    var headers = {};
    var token = getAdminBearer();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function adminAuthHeadersJson() {
    return Object.assign({ 'Content-Type': 'application/json' }, adminAuthHeaders());
  }

  var ADMIN_AUTH_LOOP_KEY`
    );
  }

  if (!n.includes('window.adminAuthHeaders = adminAuthHeaders')) {
    n = n.replace(
      /  window\.getAdminBearer = getAdminBearer;/,
      `  window.getAdminBearer = getAdminBearer;
  window.adminAuthHeaders = adminAuthHeaders;
  window.adminAuthHeadersJson = adminAuthHeadersJson;`
    );
  }

  const pairs = [
    ["headers: { Authorization: 'Bearer ' + getAdminBearer() }", 'headers: adminAuthHeaders()'],
    ["headers: { Authorization: 'Bearer ' + token }", 'headers: adminAuthHeaders()'],
    ["headers: { Authorization: 'Bearer ' + tok }", 'headers: adminAuthHeaders()'],
    ["headers: { Authorization: 'Bearer ' + jwt }", 'headers: adminAuthHeaders()'],
    [
      `headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          }`,
      'headers: adminAuthHeadersJson()',
    ],
    [
      `headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            }`,
      'headers: adminAuthHeadersJson()',
    ],
    ["headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }", 'headers: adminAuthHeadersJson()'],
    [
      `headers: {
          Authorization: 'Bearer ' + tok,
          'Content-Type': 'application/json',
        }`,
      'headers: adminAuthHeadersJson()',
    ],
    [
      `return {
      Authorization: 'Bearer ' + getAdminBearer(),
    };`,
      'return adminAuthHeaders();',
    ],
  ];
  for (const [from, to] of pairs) {
    while (n.includes(from)) n = n.replace(from, to);
  }

  if (n.includes('var token = getAdminBearer();\n    var manifestReq = token')) {
    n = n.replace(
      /  function loadReportCatalog\(\) \{[\s\S]*?return Promise\.all\(\[manifestChain, auditChain\]\)\.then\(function \(\) \{\n      renderAdminReports\(\);\n    \}\);\n  \}/,
      `  function loadReportCatalog() {
    var manifestChain = fetch(api('/api/admin/report-catalog'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: adminAuthHeaders(),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.j) {
          return fetch('/reports/index.json', { cache: 'no-store' })
            .then(function (r2) {
              return r2.json().then(function (j2) {
                return { ok: r2.ok, j: j2 };
              });
            })
            .then(function (x2) {
              if (!x2.ok || !x2.j) {
                reportCatalog = { clinics: [], hotels: [], properties: [] };
                return;
              }
              reportCatalog = {
                clinics: x2.j.clinics || [],
                hotels: x2.j.hotels || [],
                properties: x2.j.properties || [],
              };
            });
        }
        reportCatalog = {
          clinics: x.j.clinics || [],
          hotels: x.j.hotels || [],
          properties: x.j.properties || [],
        };
      })
      .catch(function () {
        reportCatalog = { clinics: [], hotels: [], properties: [] };
      });

    var auditChain = fetch(api('/api/admin/audit-reports'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: adminAuthHeaders(),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (x.ok && x.j && x.j.ok && Array.isArray(x.j.reports)) {
          auditReportsByVertical = groupAuditReports(x.j.reports);
          auditReportsLoadState = 'ok';
        } else {
          auditReportsByVertical = null;
          auditReportsLoadState = 'error';
        }
      })
      .catch(function () {
        auditReportsByVertical = null;
        auditReportsLoadState = 'error';
      });

    return Promise.all([manifestChain, auditChain]).then(function () {
      renderAdminReports();
    });
  }`
    );
  }

  n = n.replace(
    /  function openUserReportsPanel\(tile\) \{\n    if \(!panel \|\| !panelTitle \|\| !panelBody\) return;\n    panelTitle\.textContent = tile\.label;\n    var token = getAdminBearer\(\);\n    if \(!token\) \{[\s\S]*?      return;\n    \}\n\n    panelBody\.innerHTML =/,
    `  function openUserReportsPanel(tile) {
    if (!panel || !panelTitle || !panelBody) return;
    panelTitle.textContent = tile.label;

    panelBody.innerHTML =`
  );

  n = n.replace(
    /    var tok = getAdminBearer\(\);\n    if \(tok\) \{\n      fetch\(api\('\/api\/admin\/logout'\),/,
    `    fetch(api('/api/admin/logout'),`
  );
  n = n.replace(
    /      headers: \{ Authorization: 'Bearer ' \+ tok \},\n      \}\)\.catch\(function \(\) \{\}\);\n    \}\n    clearStoredAdminJwt\(\);/,
    `      headers: adminAuthHeaders(),
    }).catch(function () {});
    clearStoredAdminJwt();`
  );

  n = n.replace(
    /    var token = getAdminBearer\(\);\n    if \(!token\) \{\n      if \(!isSiteAppearancePanelStale\(\)\) \{\n        applySiteAppearanceMerge\(\{\}\);\n        bumpSiteAppearanceUrlPreviews\(\);\n      \}\n      if \(hintEl\) \{\n        hintEl\.textContent =\n          'Sign in as admin on the Node host to load saved URLs; changes save automatically when signed in\. Below: suggested paths from \/assets\/ on this host\.';\n      \}\n      return;\n    \}\n    if \(hintEl\) hintEl\.textContent = 'Loading saved settings…';/,
    "    if (hintEl) hintEl.textContent = 'Loading saved settings…';"
  );

  n = n.replace(
    /    var serverIcons = \{\};\n    var token = getAdminBearer\(\);\n\n    function fillFromServer\(\)/,
    '    var serverIcons = {};\n\n    function fillFromServer()'
  );

  n = n.replace(
    /    if \(!token\) \{\n      if \(hintEl\) \{\n        hintEl\.textContent =\n          'Sign in as admin on the Node host to load and save\. Visitors read overrides from GET \/api\/site-appearance\.';\n      \}\n      return;\n    \}\n\n    fetch\(api\('\/api\/admin\/site-appearance'\),/,
    "    fetch(api('/api/admin/site-appearance'),"
  );

  fs.writeFileSync(file, n.replace(/\n/g, '\r\n'));
  console.log('admin.js updated');
}

function patchTx(rel) {
  const file = path.join(root, rel);
  let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const old = `  function adminFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign(
      { Authorization: 'Bearer ' + adminJwt() },
      opts.headers || {}
    );`;
  const neu = `  function adminFetch(path, opts) {
    opts = opts || {};
    var headers = {};
    if (typeof window.adminAuthHeaders === 'function') {
      Object.assign(headers, window.adminAuthHeaders());
    } else {
      var jwt = adminJwt();
      if (jwt) headers.Authorization = 'Bearer ' + jwt;
    }
    Object.assign(headers, opts.headers || {});`;
  if (c.includes(old)) {
    c = c.replace(old, neu);
    fs.writeFileSync(file, c.replace(/\n/g, '\r\n'));
    console.log(rel + ' updated');
  } else {
    console.log(rel + ' skip (already patched or pattern missing)');
  }
}

patchAdminJs();
patchTx('public/admin-transcriptions.js');
patchTx('public/admin-tx-dashboard.js');
