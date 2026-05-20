/**
 * Public contact UX: audit request form (no default public inbox / mailto).
 * Operator email stays server-side (OPERATOR_CONTACT_EMAIL / ADMIN_EMAIL).
 * Optional override: GET /api/site-config → contactFormUrl, publicContactEmail (if configured).
 */
(function (global) {
  'use strict';

  var DEFAULT_CONTACT_FORM = '/clinics/010/';
  var contactFormPath = DEFAULT_CONTACT_FORM;
  var publicEmail = '';

  function setContactFormUrl(path) {
    var p = String(path || '').trim();
    if (p && p.charAt(0) === '/') contactFormPath = p;
  }

  function setPublicContactEmail(addr) {
    var a = String(addr || '').trim();
    publicEmail = a && a.indexOf('@') > 0 ? a : '';
  }

  function contactFormUrl() {
    return contactFormPath;
  }

  function publicContactEmail() {
    return publicEmail;
  }

  /** Returns mailto only when PUBLIC_CONTACT_EMAIL is configured; otherwise the audit form URL. */
  function contactMailto(subject, body) {
    if (!publicEmail) return contactFormUrl();
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
        if (j && j.contactFormUrl) setContactFormUrl(j.contactFormUrl);
        if (j && j.publicContactEmail) setPublicContactEmail(j.publicContactEmail);
        return contactFormUrl();
      })
      .catch(function () {
        return contactFormUrl();
      });
  }

  function applyContactAnchors(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('a[data-so-contact-form], a[data-so-contact-mailto]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('href', contactFormUrl());
    }
  }

  global.SoSiteContact = {
    setContactFormUrl: setContactFormUrl,
    setPublicContactEmail: setPublicContactEmail,
    contactFormUrl: contactFormUrl,
    publicContactEmail: publicContactEmail,
    contactMailto: contactMailto,
    maskEmail: maskEmail,
    loadFromApi: loadFromApi,
    applyContactAnchors: applyContactAnchors,
    applyMailtoAnchors: applyContactAnchors,
  };

  if (typeof document !== 'undefined') {
    loadFromApi().then(function () {
      applyContactAnchors(document);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
