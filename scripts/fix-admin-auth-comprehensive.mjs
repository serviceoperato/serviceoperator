import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'public', 'admin.js');
let n = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const nl = fs.readFileSync(file, 'utf8').includes('\r\n') ? '\r\n' : '\n';

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

n = n.replace(/headers: \{ Authorization: 'Bearer ' \+ getAdminBearer\(\) \}/g, 'headers: adminAuthHeaders()');

n = n.replace(
  /headers: \{\n            Authorization: 'Bearer ' \+ getAdminBearer\(\),\n            'Content-Type': 'application\/json',\n          \}/g,
  'headers: adminAuthHeadersJson()'
);

n = n.replace(
  /headers: \{\n              Authorization: 'Bearer ' \+ token,\n              'Content-Type': 'application\/json',\n            \}/g,
  'headers: adminAuthHeadersJson()'
);

n = n.replace(
  /headers: \{\n          Authorization: 'Bearer ' \+ tok,\n          'Content-Type': 'application\/json',\n        \}/g,
  'headers: adminAuthHeadersJson()'
);

n = n.replace(
  /headers: \{ Authorization: 'Bearer ' \+ tok, 'Content-Type': 'application\/json' \}/g,
  'headers: adminAuthHeadersJson()'
);

n = n.replace(
  /  function voicePipelineAdminHeaders\(\) \{\n    return \{\n      Authorization: 'Bearer ' \+ getAdminBearer\(\),\n    \};\n  \}/,
  `  function voicePipelineAdminHeaders() {
    return adminAuthHeaders();
  }`
);

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
  /    panelTitle\.textContent = 'Edit profile';\n    var adminToken = getAdminBearer\(\);\n    panelBody\.innerHTML =\n      \(adminToken\n        \? ''\n        : '<p class="admin-panel__body mono is-error">Sign in on the Node host \(email \+ password\) to save profile changes\.<\/p>'\) \+\n      '<p class="admin-panel__body mono">Portal user/,
  `    panelTitle.textContent = 'Edit profile';
    panelBody.innerHTML =
      '<p class="admin-panel__body mono">Portal user`
);

n = n.replace(
  /    if \(profileForm && !adminToken\) \{\n      profileForm\.querySelectorAll\('input, select, button'\)\.forEach\(function \(el\) \{\n        el\.disabled = true;\n      \}\);\n    \}\n    if \(profileForm\) \{/,
  `    if (profileForm) {`
);

n = n.replace(
  /          var token = getAdminBearer\(\);\n          if \(!token\) \{\n            window\.alert\('Sign in on the Node host with operator credentials first\.'\);\n            return;\n          \}\n          btn\.disabled = true;/,
  `          btn.disabled = true;`
);

n = n.replace(
  /      var tok = getAdminBearer\(\);\n      if \(!tok\) \{\n        return Promise\.resolve\(\{\n          ok: false,\n          j: \{ error: 'Not signed in as admin; cannot save site appearance\.' \},\n        \}\);\n      \}\n      return fetch\(api\('\/api\/admin\/site-appearance'\), \{\n        method: 'PUT',\n        credentials: apiCred\(\),\n        cache: 'no-store',\n        headers: \{\n          Authorization: 'Bearer ' \+ tok,\n          'Content-Type': 'application\/json',\n        \},/,
  `      return fetch(api('/api/admin/site-appearance'), {
        method: 'PUT',
        credentials: apiCred(),
        cache: 'no-store',
        headers: adminAuthHeadersJson(),`
);

n = n.replace(
  /          var tok = getAdminBearer\(\);\n          function mergeSavedIntoForm\(j\) \{/,
  `          function mergeSavedIntoForm(j) {`
);

n = n.replace(
  /          if \(!tok\) \{\n            mergeSavedIntoForm\(x\.j\);\n            return x;\n          \}\n          return fetch\(api\('\/api\/admin\/site-appearance'\), \{\n            method: 'GET',\n            credentials: apiCred\(\),\n            cache: 'no-store',\n            headers: \{ Authorization: 'Bearer ' \+ tok \},\n          \}\)/,
  `          return fetch(api('/api/admin/site-appearance'), {
            method: 'GET',
            credentials: apiCred(),
            cache: 'no-store',
            headers: adminAuthHeaders(),
          })`
);

n = n.replace(
  /      var tok = getAdminBearer\(\);\n      if \(!tok\) \{\n        return Promise\.resolve\(\{\n          ok: false,\n          j: \{ error: 'Not signed in as admin; cannot save site appearance\.' \},\n        \}\);\n      \}\n      var domPayload = collectSiteAppearancePayloadFromDom\(\);/,
  `      var domPayload = collectSiteAppearancePayloadFromDom();`
);

n = n.replace(
  /        var tok = getAdminBearer\(\);\n        if \(!tok\) \{\n          if \(hintEl\) hintEl\.textContent = 'Sign in as admin to upload images to this server\.';\n          fin\.value = '';\n          return;\n        \}\n        if \(hintEl\) hintEl\.textContent = 'Uploading…';/,
  `        if (hintEl) hintEl.textContent = 'Uploading…';`
);

n = n.replace(
  /        var tok = getAdminBearer\(\);\n        if \(!tok\) \{\n          if \(hintEl\) hintEl\.textContent = 'Sign in as admin to remove uploaded files from this server\.';\n          return;\n        \}\n        var current = String\(urlInput\.value \|\| ''\)\.trim\(\);/,
  `        var current = String(urlInput.value || '').trim();`
);

n = n.replace(
  /        var tok = getAdminBearer\(\);\n        if \(!tok\) return;\n        var domPayload = collectSiteAppearancePayloadFromDom\(\);/,
  `        var domPayload = collectSiteAppearancePayloadFromDom();`
);

n = n.replace(
  /    var token = getAdminBearer\(\);\n    if \(!token\) \{\n      if \(!isSiteAppearancePanelStale\(\)\) \{\n        applySiteAppearanceMerge\(\{\}\);\n        bumpSiteAppearanceUrlPreviews\(\);\n      \}\n      if \(hintEl\) \{\n        hintEl\.textContent =\n          'Sign in as admin on the Node host to load saved URLs; changes save automatically when signed in\. Below: suggested paths from \/assets\/ on this host\.';\n      \}\n      return;\n    \}\n    if \(hintEl\) hintEl\.textContent = 'Loading saved settings…';\n    fetch\(api\('\/api\/admin\/site-appearance'\), \{\n      method: 'GET',\n      credentials: apiCred\(\),\n      cache: 'no-store',\n      headers: \{ Authorization: 'Bearer ' \+ token \},\n    \}\)/,
  `    if (hintEl) hintEl.textContent = 'Loading saved settings…';
    fetch(api('/api/admin/site-appearance'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: adminAuthHeaders(),
    })`
);

n = n.replace(
  /    var serverIcons = \{\};\n    var token = getAdminBearer\(\);\n\n    function fillFromServer\(\) \{[\s\S]*?    if \(!token\) \{\n      if \(hintEl\) \{\n        hintEl\.textContent =\n          'Sign in as admin on the Node host to load and save\. Visitors read overrides from GET \/api\/site-appearance\.';\n      \}\n      return;\n    \}\n\n    fetch\(api\('\/api\/admin\/site-appearance'\), \{\n      method: 'GET',\n      credentials: apiCred\(\),\n      cache: 'no-store',\n      headers: \{ Authorization: 'Bearer ' \+ token \},\n    \}\)/,
  `    var serverIcons = {};

    function fillFromServer() {
      rows.forEach(function (row) {
        var el = document.getElementById('soIcon-' + row.key);
        if (!el) return;
        var v = serverIcons[row.key];
        el.value = typeof v === 'string' ? v : '';
      });
    }

    fetch(api('/api/admin/site-appearance'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: adminAuthHeaders(),
    })`
);

n = n.replace(
  /      var jwt = readStoredAdminJwt\(\);\n      if \(!jwt\) \{\n        window\.location\.href = '\/admin\/users';\n        return;\n      \}\n      fetch\(api\('\/api\/admin\/places-page-token'\), \{\n        method: 'POST',\n        credentials: apiCred\(\),\n        cache: 'no-store',\n        headers: \{ Authorization: 'Bearer ' \+ jwt \},\n      \}\)/,
  `      fetch(api('/api/admin/places-page-token'), {
        method: 'POST',
        credentials: apiCred(),
        cache: 'no-store',
        headers: adminAuthHeaders(),
      })`
);

n = n.replace(
  /    var tok = getAdminBearer\(\);\n    if \(tok\) \{\n      fetch\(api\('\/api\/admin\/logout'\), \{\n        method: 'POST',\n        credentials: apiCred\(\),\n        headers: \{ Authorization: 'Bearer ' \+ tok \},\n      \}\)\.catch\(function \(\) \{\}\);\n    \}/,
  `    fetch(api('/api/admin/logout'), {
      method: 'POST',
      credentials: apiCred(),
      headers: adminAuthHeaders(),
    }).catch(function () {});`
);

n = n.replace(
  /    var token = getAdminBearer\(\);\n    fetch\(api\('\/api\/user-accounts'\), \{\n      method: 'GET',\n      credentials: apiCred\(\),\n      headers: \{ Authorization: 'Bearer ' \+ token \},\n    \}\)/,
  `    fetch(api('/api/user-accounts'), {
      method: 'GET',
      credentials: apiCred(),
      headers: adminAuthHeaders(),
    })`
);

if (nl === '\r\n') n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(file, n);
console.log('admin.js comprehensive auth fix applied');
