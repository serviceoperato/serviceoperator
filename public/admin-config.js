/**
 * Optional browser-only gate when /api/admin/* is unreachable (static preview).
 * Production operator sign-in uses ADMIN_PASSWORD_HASH on the Node server — see README.
 */
window.__ADMIN_PASSWORD__ = '';
