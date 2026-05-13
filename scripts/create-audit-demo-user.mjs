/**
 * Create or refresh a portal user for the Dental Design Center audit flow.
 * Uses the public contact email from `public/clinics/dental-design-center-audit/index.html`
 * (`data-audit-contact-email`) unless AUDIT_DEMO_EMAIL is set.
 *
 * Usage (Postgres / Railway):
 *   DATABASE_URL="postgresql://..." node scripts/create-audit-demo-user.mjs
 *
 * Local JSON store (no DATABASE_URL):
 *   node scripts/create-audit-demo-user.mjs
 *
 * Env:
 *   AUDIT_DEMO_EMAIL — default info@dentaldesignpattaya.com
 *   AUDIT_DEMO_REPORT_SLUG — default dental-design-center-audit
 *   ADMIN_EMAIL — for Postgres bootstrap admin flag (default jack@serviceopera.to)
 *   DATA_DIR — when not using DATABASE_URL (default <repo>/data)
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
    const email = normalizeEmail(process.env.AUDIT_DEMO_EMAIL || 'info@dentaldesignpattaya.com');
    const reportSlug = assertReportSlug(
      (process.env.AUDIT_DEMO_REPORT_SLUG || 'dental-design-center-audit').trim()
    );
    const tempPassword = randomTempPassword();
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
    console.log('Sign-in URL (add ?next= for post-setup redirect):');
    console.log('  /login.html?next=' + encodeURIComponent('/clinics/dental-design-center-audit/'));
    console.log('');
    console.log('Temporary password (copy now; not logged after this run):');
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
  const email = normalizeEmail(process.env.AUDIT_DEMO_EMAIL || 'info@dentaldesignpattaya.com');
  const reportSlug = assertReportSlug(
    (process.env.AUDIT_DEMO_REPORT_SLUG || 'dental-design-center-audit').trim()
  );
  const tempPassword = randomTempPassword();
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
  console.log('Sign-in URL:');
  console.log('  /login.html?next=' + encodeURIComponent('/clinics/dental-design-center-audit/'));
  console.log('');
  console.log('Temporary password (copy now):');
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
