/**
 * Portal JWT helpers. ServiceOpera signs HMAC tokens as body.sig (2 segments);
 * some flows may still use header.payload.sig (3 segments). Client must accept both.
 */
(function (g) {
  'use strict';

  function splitToken(tok) {
    var s = String(tok || '').trim();
    return s ? s.split('.') : [];
  }

  function jwtPayloadSegment(tok) {
    var parts = splitToken(tok);
    if (parts.length === 2 && parts[0] && parts[1]) return parts[0];
    if (parts.length === 3 && parts[1]) return parts[1];
    return '';
  }

  function looksLikePortalJwt(tok) {
    var parts = splitToken(tok);
    if (parts.length === 2) return parts[0].length > 0 && parts[1].length > 0;
    if (parts.length === 3) return parts[0].length > 0 && parts[1].length > 0 && parts[2].length > 0;
    return false;
  }

  function portalJwtShapeLabel(tok) {
    if (!String(tok || '').trim()) return 'missing';
    var parts = splitToken(tok);
    if (parts.length === 2 && parts[0] && parts[1]) return 'serviceopera-2part';
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) return 'jwt-3part';
    return 'malformed';
  }

  function decodePortalJwtPayload(tok) {
    var seg = jwtPayloadSegment(tok);
    if (!seg) return null;
    try {
      var payload = seg.replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      return JSON.parse(atob(payload));
    } catch (e) {
      return null;
    }
  }

  function decodePortalJwtReportSlug(tok) {
    var json = decodePortalJwtPayload(tok);
    return json && typeof json.reportSlug === 'string' ? json.reportSlug.trim() : '';
  }

  function decodePortalJwtEmail(tok) {
    var json = decodePortalJwtPayload(tok);
    return json && typeof json.email === 'string' ? json.email : '';
  }

  function decodePortalJwtIsOperator(tok) {
    var json = decodePortalJwtPayload(tok);
    return !!(json && json.isOperator === true);
  }

  g.soPortalJwtPayloadSegment = jwtPayloadSegment;
  g.soLooksLikePortalJwt = looksLikePortalJwt;
  g.soPortalJwtShapeLabel = portalJwtShapeLabel;
  g.soDecodePortalJwtPayload = decodePortalJwtPayload;
  g.soDecodePortalJwtReportSlug = decodePortalJwtReportSlug;
  g.soDecodePortalJwtEmail = decodePortalJwtEmail;
  g.soDecodePortalJwtIsOperator = decodePortalJwtIsOperator;
})(typeof window !== 'undefined' ? window : globalThis);
