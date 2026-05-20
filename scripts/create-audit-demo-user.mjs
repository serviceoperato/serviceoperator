/**
 * Create or refresh a portal user for the Dental Design Center audit flow.
 * First-visit credentials on the audit page are served only from the Node host via
 * GET /api/public/audit-ddc-first-access using AUDIT_DDC_EMAIL + AUDIT_DDC_TEMP_PASSWORD
 * (see .env.example). This script reads the same env vars (and legacy AUDIT_DEMO_*).
 *
 * Usage (Postgres / Railway):
 *   DATABASE_URL="postgresql://..." node scripts/create-audit-demo-user.mjs
 *
 * Local JSON store (no DATABASE_URL):
 *   node scripts/create-audit-demo-user.mjs
 *
 * Env (preferred):
 *   AUDIT_DDC_EMAIL, AUDIT_DDC_TEMP_PASSWORD, AUDIT_DDC_REPORT_SLUG (optional)
 * Legacy aliases: AUDIT_DEMO_EMAIL, AUDIT_DEMO_TEMP_PASSWORD, AUDIT_DEMO_REPORT_SLUG
 *
 * Passwords use the same scrypt format as server.mjs (`hashPassword` in clinic-store.mjs).
 *
 * Postgres manual equivalent (generate hash with this script or Node REPL):
 *   UPDATE portal_users
 *   SET password_hash = '<salt:hex>', password_must_change = true, updated_at = NOW()
 *   WHERE email = 'info@dentaldesignpattaya.com';
 *   -- or INSERT new row with id, email, password_hash, report_slug, display_name, password_must_change
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertReportSlug, createUserStore, normalizeEmail } from '../clinic-store.mjs';
import { createPostgresUserStore, ensurePostgresUserSchema } from '../postgres-user-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function randomTempPassword() {
  return crypto.randomBytes(24).toString('base64url').slice(0, 32);
}

/** Resolve email / slug / password from env (AUDIT_DDC_* preferred). */
function resolveDemoCredentials() {
  const envEmail = (
    process.env.AUDIT_DDC_EMAIL ||
    process.env.AUDIT_DEMO_EMAIL ||
    ''
  ).trim();
  const envSlug = (
    process.env.AUDIT_DDC_REPORT_SLUG ||
    process.env.AUDIT_DEMO_REPORT_SLUG ||
    ''
  ).trim();
  const envPw = (
    process.env.AUDIT_DDC_TEMP_PASSWORD ||
    process.env.AUDIT_DEMO_TEMP_PASSWORD ||
    ''
  ).trim();

  const email = normalizeEmail(envEmail || 'info@dentaldesignpattaya.com');
  const reportSlug = assertReportSlug(envSlug || '004');
  let tempPassword = envPw.trim();
  if (!tempPassword) {
    tempPassword = randomTempPassword();
    console.warn(
      '[create-audit-demo-user] No AUDIT_DDC_TEMP_PASSWORD (or legacy AUDIT_DEMO_TEMP_PASSWORD); generated random. Set AUDIT_DDC_TEMP_PASSWORD on Railway and re-run.'
    );
  }
  const loginNextPath = '/clinics/' + reportSlug + '/';
  return { email, reportSlug, tempPassword, loginNextPath };
}

async function runPostgres() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) return false;
  const { Pool } = await import('pg');
  const adminEmail = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      /sslmode=require/i.test(databaseUrl) || /railway/i.test(databaseUrl)
        ? { rejectUnauthorized: false }
        : undefined,
  });
  try {
    await ensurePostgresUserSchema(pool, adminEmail);
    const store = createPostgresUserStore(pool);
    const { email, reportSlug, tempPassword, loginNextPath } = resolveDemoCredentials();
    const existing = await store.getUserByEmail(email);
    if (existing) {
      if (typeof store.setPasswordWithMustChange !== 'function') {
        throw new Error('userStore.setPasswordWithMustChange is missing; update postgres-user-store.mjs.');
      }
      await store.setPasswordWithMustChange(existing.id, tempPassword);
      console.log('[create-audit-demo-user] Updated existing Postgres user:', email);
    } else {
      await store.createUser({
        email,
        password: tempPassword,
        reportSlug,
        passwordMustChange: true,
      });
      console.log('[create-audit-demo-user] Created Postgres user:', email, 'reportSlug=', reportSlug);
    }
    console.log('');
    console.log('Sign-in path (same as on the audit page):');
    console.log('  /login.html?next=' + encodeURIComponent(loginNextPath));
    console.log('');
    console.log('Temporary password (set AUDIT_DDC_TEMP_PASSWORD on the server to match):');
    console.log(tempPassword);
    console.log('');
    return true;
  } finally {
    await pool.end();
  }
}

function runJson() {
  const dataDir = (process.env.DATA_DIR || path.join(rootDir, 'data')).trim();
  const adminEmail = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
  const store = createUserStore(dataDir, adminEmail);
  const { email, reportSlug, tempPassword, loginNextPath } = resolveDemoCredentials();
  const existing = store.getUserByEmail(email);
  if (existing) {
    store.setPasswordWithMustChange(existing.id, tempPassword);
    console.log('[create-audit-demo-user] Updated existing JSON user:', email);
  } else {
    store.createUser({
      email,
      password: tempPassword,
      reportSlug,
      passwordMustChange: true,
    });
    console.log('[create-audit-demo-user] Created JSON user:', email, 'reportSlug=', reportSlug);
  }
  console.log('');
  console.log('Sign-in path:');
  console.log('  /login.html?next=' + encodeURIComponent(loginNextPath));
  console.log('');
  console.log('Temporary password (set AUDIT_DDC_TEMP_PASSWORD on the server to match):');
  console.log(tempPassword);
  console.log('');
}

async function main() {
  const usedPg = await runPostgres();
  if (usedPg) return;
  runJson();
}

main().catch((e) => {
  console.error('[create-audit-demo-user]', e.message || e);
  process.exit(1);
});
