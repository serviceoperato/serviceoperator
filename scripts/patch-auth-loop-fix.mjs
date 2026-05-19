import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

function patchAdminJs() {
  const file = path.join(root, 'public', 'admin.js');
  let c = fs.readFileSync(file, 'utf8');

  if (!c.includes('return tryRestoreCookieOnlyOperatorSession')) {
    c = c.replace(
      `    .then(function (restored) {
      if (restored) return true;
      return tryRestorePortalOperatorSession();
    })
    .then(function (restored) {
      if (restored) {
        revealAdminBootAfterPaint();
        return;
      }
      if (capabilitiesFromOurServer && capabilitiesHttpOk) {
        redirectToUnifiedLogin();`,
      `    .then(function (restored) {
      if (restored) return true;
      return tryRestorePortalOperatorSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return tryRestoreCookieOnlyOperatorSession();
    })
    .then(function (restored) {
      if (restored) {
        revealAdminBootAfterPaint();
        return;
      }
      if (capabilitiesFromOurServer && capabilitiesHttpOk) {
        redirectToUnifiedLogin();`
    );
  }

  c = c.replace(
    /\/\*\* HttpOnly operator cookie without localStorage JWT .*? \*\//,
    '/** HttpOnly operator cookie without localStorage JWT — server HTML gate already passed. */'
  );

  fs.writeFileSync(file, c);
  console.log('admin.js patched');
}

function patchLoginHtml() {
  const file = path.join(root, 'public', 'login.html');
  let c = fs.readFileSync(file, 'utf8');

  const oldBlock = `    var adminTok = getAdminJwtLogin();
    var portalTok = getPortalJwtLogin();
    var adminP =
      adminTok && looksLikeJwt(adminTok)
        ? fetchAdminUserSession(adminTok)
        : Promise.resolve({ ok: false, status: 0, json: null });

    adminP.then(function (adm) {`;

  const newBlock = `    var adminTok = getAdminJwtLogin();
    var portalTok = getPortalJwtLogin();
    var wantAdminShellNext =
      nextPath &&
      typeof soPortalIsAdminShellNextPath === 'function' &&
      soPortalIsAdminShellNextPath(nextPath);
    var cookieP = wantAdminShellNext
      ? fetchAdminCookieSession()
      : Promise.resolve({ ok: false, status: 0, json: null });
    var adminP =
      adminTok && looksLikeJwt(adminTok)
        ? fetchAdminUserSession(adminTok)
        : Promise.resolve({ ok: false, status: 0, json: null });

    cookieP.then(function (ck) {
      if (ck && ck.ok && ck.json && ck.json.ok) {
        var cookieDest = resolveSignedInDestination();
        try {
          window.location.replace(cookieDest);
        } catch (eCk) {
          window.location.href = cookieDest;
        }
        return;
      }
      adminP.then(function (adm) {`;

  if (c.includes(oldBlock) && !c.includes('wantAdminShellNext')) {
    c = c.replace(oldBlock, newBlock);
    c = c.replace(
      `        redirectAfterPortalLogin(lj);
      });
    });
  }`,
      `        redirectAfterPortalLogin(lj);
      });
      });
    });
  }`
    );
  }

  const oldPortalRedirect = `        if (
          nextPath &&
          typeof soPortalIsAdminShellNextPath === 'function' &&
          soPortalIsAdminShellNextPath(nextPath) &&
          (x.json.isOperator || decodeJwtIsOperatorLogin(portalTok))
        ) {
          try {
            window.location.replace(nextPath);
          } catch (eAdmNext) {
            window.location.href = nextPath;
          }
          return;
        }`;

  const newPortalRedirect = `        if (
          nextPath &&
          typeof soPortalIsAdminShellNextPath === 'function' &&
          soPortalIsAdminShellNextPath(nextPath) &&
          (x.json.isOperator || decodeJwtIsOperatorLogin(portalTok))
        ) {
          return fetchAdminUserSession(portalTok).then(function () {
            try {
              window.location.replace(nextPath);
            } catch (eAdmNext) {
              window.location.href = nextPath;
            }
          });
        }`;

  if (c.includes(oldPortalRedirect)) {
    c = c.replace(oldPortalRedirect, newPortalRedirect);
  }

  fs.writeFileSync(file, c);
  console.log('login.html patched');
}

patchAdminJs();
patchLoginHtml();
