import crypto from 'crypto';
import {
  assertReportSlug,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from './clinic-store.mjs';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS portal_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  report_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_pending_registrations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  report_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const PROFILE_COLUMN_MIGRATIONS = [
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS display_name TEXT',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS gender TEXT',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_plus BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS spend_cents BIGINT NOT NULL DEFAULT 0',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS earned_cents BIGINT NOT NULL DEFAULT 0',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS last_login_ip TEXT',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS country TEXT',
  'ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
];

function displayNameFromEmail(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  return at > 0 ? e.slice(0, at) : e || '';
}

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapPortalUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    reportSlug: row.report_slug,
    displayName: row.display_name || displayNameFromEmail(row.email),
    gender: row.gender || null,
    active: row.is_active !== false,
    admin: row.is_admin === true,
    plus: row.is_plus === true,
    spend: Number(row.spend_cents) || 0,
    earned: Number(row.earned_cents) || 0,
    lastLoginAt: isoTimestamp(row.last_login_at),
    lastLoginIp: row.last_login_ip || null,
    country: row.country || null,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at) || isoTimestamp(row.created_at),
  };
}

const USER_LIST_SQL = `
SELECT
  id,
  email,
  report_slug,
  display_name,
  gender,
  is_active,
  is_admin,
  is_plus,
  spend_cents,
  earned_cents,
  last_login_at,
  last_login_ip,
  country,
  created_at,
  updated_at
FROM portal_users
ORDER BY created_at DESC
`;

function baseSlugFromEmail(email) {
  const em = normalizeEmail(email);
  const local = (em.split('@')[0] || 'user').toLowerCase();
  let s = local.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s.length) s = 'user';
  if (!/^[a-z0-9]/.test(s)) s = 'u' + s.replace(/^[^a-z0-9]+/, '');
  s = s.slice(0, 56);
  try {
    assertReportSlug(s);
    return s;
  } catch {
    return 'user-' + crypto.randomBytes(4).toString('hex');
  }
}

async function listTakenSlugs(pool) {
  const users = await pool.query('SELECT report_slug FROM portal_users');
  const pending = await pool.query('SELECT report_slug FROM portal_pending_registrations');
  return new Set([
    ...users.rows.map((r) => r.report_slug),
    ...pending.rows.map((r) => r.report_slug),
  ]);
}

async function uniqueReportSlug(pool, base) {
  const taken = await listTakenSlugs(pool);
  let candidate = base;
  let n = 0;
  while (taken.has(candidate)) {
    n += 1;
    candidate = (base + '-' + n).slice(0, 64);
    if (n > 500) {
      candidate = (base + '-' + crypto.randomBytes(4).toString('hex')).slice(0, 64);
      break;
    }
  }
  return assertReportSlug(candidate);
}

export async function ensurePostgresUserSchema(pool, adminEmail) {
  await pool.query(SCHEMA_SQL);
  for (const sql of PROFILE_COLUMN_MIGRATIONS) {
    await pool.query(sql);
  }
  const em = typeof adminEmail === 'string' ? normalizeEmail(adminEmail) : '';
  if (em) {
    await pool.query('UPDATE portal_users SET is_admin = true WHERE email = $1 AND is_admin IS NOT TRUE', [em]);
  }
}

export function createPostgresUserStore(pool) {
  return {
    backend: 'postgres',

    async listUsers() {
      const result = await pool.query(USER_LIST_SQL);
      return result.rows.map((row) => mapPortalUserRow(row));
    },

    async listPendingSummaries() {
      const result = await pool.query(
        'SELECT id, email, report_slug, created_at FROM portal_pending_registrations ORDER BY created_at DESC'
      );
      return result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        reportSlug: row.report_slug,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));
    },

    async findPendingByEmail(email) {
      const em = normalizeEmail(email);
      const result = await pool.query(
        'SELECT id, email, report_slug FROM portal_pending_registrations WHERE email = $1 LIMIT 1',
        [em]
      );
      const row = result.rows[0];
      if (!row) return null;
      return { id: row.id, email: row.email, reportSlug: row.report_slug };
    },

    async createUser({ email, password, reportSlug }) {
      const em = normalizeEmail(email);
      if (!em || !em.includes('@')) {
        const err = new Error('Invalid email.');
        err.status = 400;
        throw err;
      }
      if (typeof password !== 'string' || password.length < 8) {
        const err = new Error('Password must be at least 8 characters.');
        err.status = 400;
        throw err;
      }
      const pending = await this.findPendingByEmail(em);
      if (pending) {
        const err = new Error(
          'That email has a pending registration. Check your inbox to confirm, or wait and try again.'
        );
        err.status = 409;
        throw err;
      }
      let slug;
      if (typeof reportSlug === 'string' && reportSlug.trim()) {
        slug = assertReportSlug(reportSlug.trim());
      } else {
        slug = await uniqueReportSlug(pool, baseSlugFromEmail(em));
      }
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const displayName = displayNameFromEmail(em);
      try {
        await pool.query(
          `INSERT INTO portal_users (
            id, email, password_hash, report_slug, display_name, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [id, em, hashPassword(password), slug, displayName, createdAt]
        );
      } catch (e) {
        if (e && e.code === '23505') {
          const err = new Error('That email is already registered.');
          err.status = 409;
          throw err;
        }
        throw e;
      }
      return {
        id,
        email: em,
        reportSlug: slug,
        displayName,
        gender: null,
        active: true,
        admin: false,
        plus: false,
        spend: 0,
        earned: 0,
        lastLoginAt: null,
        lastLoginIp: null,
        country: null,
        createdAt,
        updatedAt: createdAt,
      };
    },

    async createPendingRegistration({ email, password }) {
      const em = normalizeEmail(email);
      if (!em || !em.includes('@')) {
        const err = new Error('Invalid email.');
        err.status = 400;
        throw err;
      }
      if (typeof password !== 'string' || password.length < 8) {
        const err = new Error('Password must be at least 8 characters.');
        err.status = 400;
        throw err;
      }
      const existing = await this.getUserByEmail(em);
      if (existing) {
        const err = new Error('That email is already registered.');
        err.status = 409;
        throw err;
      }
      await pool.query('DELETE FROM portal_pending_registrations WHERE email = $1', [em]);
      const slug = await uniqueReportSlug(pool, baseSlugFromEmail(em));
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const displayName = displayNameFromEmail(em);
      await pool.query(
        'INSERT INTO portal_pending_registrations (id, email, password_hash, report_slug, created_at) VALUES ($1, $2, $3, $4, $5)',
        [id, em, hashPassword(password), slug, createdAt]
      );
      return {
        id,
        email: em,
        reportSlug: slug,
        displayName,
        gender: null,
        active: true,
        admin: false,
        plus: false,
        spend: 0,
        earned: 0,
        lastLoginAt: null,
        lastLoginIp: null,
        country: null,
        createdAt,
        updatedAt: createdAt,
      };
    },

    async finalizePendingRegistration(pendingId, jwtEmail) {
      if (typeof pendingId !== 'string' || !pendingId) {
        const err = new Error('Invalid registration.');
        err.status = 400;
        throw err;
      }
      const pending = await pool.query(
        'SELECT id, email, password_hash, report_slug FROM portal_pending_registrations WHERE id = $1 LIMIT 1',
        [pendingId]
      );
      const pen = pending.rows[0];
      if (!pen) {
        const err = new Error('Registration not found or already completed.');
        err.status = 404;
        throw err;
      }
      if (typeof jwtEmail === 'string' && jwtEmail && normalizeEmail(pen.email) !== normalizeEmail(jwtEmail)) {
        const err = new Error('Invalid confirmation link.');
        err.status = 401;
        throw err;
      }
      const uid = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const displayName = displayNameFromEmail(pen.email);
      try {
        await pool.query(
          `INSERT INTO portal_users (
            id, email, password_hash, report_slug, display_name, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [uid, pen.email, pen.password_hash, pen.report_slug, displayName, createdAt]
        );
        await pool.query('DELETE FROM portal_pending_registrations WHERE id = $1', [pendingId]);
      } catch (e) {
        if (e && e.code === '23505') {
          await pool.query('DELETE FROM portal_pending_registrations WHERE id = $1', [pendingId]);
          const err = new Error('That email is already registered.');
          err.status = 409;
          throw err;
        }
        throw e;
      }
      return {
        id: uid,
        email: pen.email,
        reportSlug: pen.report_slug,
        displayName,
        gender: null,
        active: true,
        admin: false,
        plus: false,
        spend: 0,
        earned: 0,
        lastLoginAt: null,
        lastLoginIp: null,
        country: null,
        createdAt,
        updatedAt: createdAt,
      };
    },

    async verifyLogin(email, password) {
      const em = normalizeEmail(email);
      const result = await pool.query(
        'SELECT id, email, password_hash, report_slug, is_active FROM portal_users WHERE email = $1 LIMIT 1',
        [em]
      );
      const row = result.rows[0];
      if (!row || row.is_active === false || !verifyPassword(password, row.password_hash)) return null;
      return { id: row.id, email: row.email, reportSlug: row.report_slug };
    },

    async getUserByEmail(email) {
      const em = normalizeEmail(email);
      const result = await pool.query(
        'SELECT id, email, report_slug, is_active FROM portal_users WHERE email = $1 LIMIT 1',
        [em]
      );
      const row = result.rows[0];
      if (!row) return null;
      return { id: row.id, email: row.email, reportSlug: row.report_slug, active: row.is_active !== false };
    },

    async setPasswordForUser(userId, newPassword) {
      if (typeof userId !== 'string' || !userId) {
        const err = new Error('Invalid user.');
        err.status = 400;
        throw err;
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        const err = new Error('Password must be at least 8 characters.');
        err.status = 400;
        throw err;
      }
      const result = await pool.query(
        'UPDATE portal_users SET password_hash = $1 WHERE id = $2 RETURNING id, email, report_slug',
        [hashPassword(newPassword), userId]
      );
      const row = result.rows[0];
      if (!row) {
        const err = new Error('User not found.');
        err.status = 404;
        throw err;
      }
      return { id: row.id, email: row.email, reportSlug: row.report_slug };
    },

    async recordLogin(userId, { ip, country } = {}) {
      if (typeof userId !== 'string' || !userId) return null;
      const loginIp = typeof ip === 'string' && ip.trim() ? ip.trim() : null;
      const loginCountry = typeof country === 'string' && country.trim() ? country.trim().toUpperCase() : null;
      const result = await pool.query(
        `UPDATE portal_users
         SET last_login_at = NOW(),
             last_login_ip = COALESCE($2, last_login_ip),
             country = COALESCE($3, country),
             updated_at = NOW()
         WHERE id = $1
         RETURNING
           id,
           email,
           report_slug,
           display_name,
           gender,
           is_active,
           is_admin,
           is_plus,
           spend_cents,
           earned_cents,
           last_login_at,
           last_login_ip,
           country,
           created_at,
           updated_at`,
        [userId, loginIp, loginCountry]
      );
      return mapPortalUserRow(result.rows[0]);
    },

    async updateUserProfile(userId, patch = {}) {
      if (typeof userId !== 'string' || !userId) {
        const err = new Error('Invalid user.');
        err.status = 400;
        throw err;
      }
      const sets = [];
      const values = [userId];
      let idx = 2;

      if (typeof patch.displayName === 'string') {
        const name = patch.displayName.trim();
        if (!name) {
          const err = new Error('Display name cannot be empty.');
          err.status = 400;
          throw err;
        }
        sets.push(`display_name = $${idx++}`);
        values.push(name);
      }
      if (patch.gender === null || typeof patch.gender === 'string') {
        sets.push(`gender = $${idx++}`);
        values.push(typeof patch.gender === 'string' ? patch.gender.trim() || null : null);
      }
      if (typeof patch.active === 'boolean') {
        sets.push(`is_active = $${idx++}`);
        values.push(patch.active);
      }
      if (typeof patch.admin === 'boolean') {
        sets.push(`is_admin = $${idx++}`);
        values.push(patch.admin);
      }
      if (typeof patch.plus === 'boolean') {
        sets.push(`is_plus = $${idx++}`);
        values.push(patch.plus);
      }
      if (patch.spend != null) {
        const spend = Number(patch.spend);
        if (!Number.isFinite(spend) || spend < 0) {
          const err = new Error('Spend must be a non-negative number.');
          err.status = 400;
          throw err;
        }
        sets.push(`spend_cents = $${idx++}`);
        values.push(Math.round(spend));
      }
      if (patch.earned != null) {
        const earned = Number(patch.earned);
        if (!Number.isFinite(earned) || earned < 0) {
          const err = new Error('Earned must be a non-negative number.');
          err.status = 400;
          throw err;
        }
        sets.push(`earned_cents = $${idx++}`);
        values.push(Math.round(earned));
      }
      if (typeof patch.country === 'string') {
        sets.push(`country = $${idx++}`);
        values.push(patch.country.trim().toUpperCase() || null);
      }
      if (!sets.length) {
        const err = new Error('No profile fields to update.');
        err.status = 400;
        throw err;
      }
      sets.push('updated_at = NOW()');
      const result = await pool.query(
        `UPDATE portal_users
         SET ${sets.join(', ')}
         WHERE id = $1
         RETURNING
           id,
           email,
           report_slug,
           display_name,
           gender,
           is_active,
           is_admin,
           is_plus,
           spend_cents,
           earned_cents,
           last_login_at,
           last_login_ip,
           country,
           created_at,
           updated_at`,
        values
      );
      const row = result.rows[0];
      if (!row) {
        const err = new Error('User not found.');
        err.status = 404;
        throw err;
      }
      return mapPortalUserRow(row);
    },

    async getStorageSummary() {
      const users = await pool.query('SELECT COUNT(*)::int AS count FROM portal_users');
      const pending = await pool.query('SELECT COUNT(*)::int AS count FROM portal_pending_registrations');
      return {
        backend: 'postgres',
        confirmedUserCount: users.rows[0]?.count || 0,
        pendingRegistrationCount: pending.rows[0]?.count || 0,
        tables: ['portal_users', 'portal_pending_registrations'],
      };
    },
  };
}
