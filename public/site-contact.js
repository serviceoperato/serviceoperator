/**
 * Public contact email for marketing footers and mailto links.
 * Operator/admin email stays server-side (ADMIN_EMAIL); optional override via GET /api/site-config.
 */
(function (global) {
  'use strict';

  var DEFAULT_PUBLIC_CONTACT = 'hello@serviceopera.to';
  var publicEmail = DEFAULT_PUBLIC_CONTACT;

  function setPublicContactEmail(addr) {
    var a = String(addr || '').trim();
    if (a && a.indexOf('@') > 0) publicEmail = a;
  }

  function publicContactEmail() {
    return publicEmail;
  }

  function contactMailto(subject, body) {
    var q = [];
    if (subject) q.push('subject=' + encodeURIComponent(String(subject)));
    if (body) q.push('body=' + encodeURIComponent(String(body)));
    return 'mailto:' + publicEmail + (q.length ? '?' + q.join('&') : '');
  }

  function maskEmail(email) {
    var e = String(email || '').trim();
    var at = e.indexOf('@');
    if (at <= 0) return e ? '(redacted)' : '';
    return '***' + e.slice(at);
  }

  function loadFromApi() {
    var url =
      typeof global.soApiUrl === 'function'
        ? global.soApiUrl('/api/site-config')
        : '/api/site-config';
    return fetch(url, { cache: 'default', credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (j && j.publicContactEmail) setPublicContactEmail(j.publicContactEmail);
        return publicEmail;
      })
      .catch(function () {
        return publicEmail;
      });
  }

  function applyMailtoAnchors(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('a[data-so-contact-mailto]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var subj = el.getAttribute('data-so-subject') || '';
      var body = el.getAttribute('data-so-body') || '';
      el.setAttribute('href', contactMailto(subj, body));
    }
  }

  global.SoSiteContact = {
    setPublicContactEmail: setPublicContactEmail,
    publicContactEmail: publicContactEmail,
    contactMailto: contactMailto,
    maskEmail: maskEmail,
    loadFromApi: loadFromApi,
    applyMailtoAnchors: applyMailtoAnchors,
  };

  if (typeof document !== 'undefined') {
    loadFromApi().then(function () {
      applyMailtoAnchors(document);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
