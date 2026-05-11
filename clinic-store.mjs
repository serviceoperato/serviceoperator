/**
 * Clinic report users — JSON file on disk (see DATA_DIR). Replace with Postgres when needed.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function assertReportSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    const err = new Error('Invalid report slug (lowercase letters, numbers, hyphens; max 64 chars).');
    err.status = 400;
    throw err;
  }
  return slug;
}

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const salt = parts[0];
  const want = parts[1];
  try {
    const got = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(got, 'hex'));
  } catch {
    return false;
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return { users: [] };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.users)) return { users: [] };
    return { users: o.users };
  } catch {
    return { users: [] };
  }
}

function writeJson(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function createClinicStore(dataDir) {
  const file = path.join(dataDir, 'clinic_users.json');

  function load() {
    return readJson(file);
  }

  function save(data) {
    writeJson(file, data);
  }

  return {
    file,
    listUsers() {
      return load().users.map((u) => ({
        id: u.id,
        email: u.email,
        reportSlug: u.reportSlug,
        createdAt: u.createdAt,
      }));
    },

    createUser({ email, password, reportSlug }) {
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
      const slug = assertReportSlug(reportSlug);
      const data = load();
      if (data.users.some((u) => u.email === em)) {
        const err = new Error('That email is already registered.');
        err.status = 409;
        throw err;
      }
      const id = crypto.randomUUID();
      const row = {
        id,
        email: em,
        passwordHash: hashPassword(password),
        reportSlug: slug,
        createdAt: new Date().toISOString(),
      };
      data.users.push(row);
      save(data);
      return { id, email: em, reportSlug: slug, createdAt: row.createdAt };
    },

    verifyLogin(email, password) {
      const em = normalizeEmail(email);
      const data = load();
      const u = data.users.find((x) => x.email === em);
      if (!u) return null;
      if (!verifyPassword(password, u.passwordHash)) return null;
      return { id: u.id, email: u.email, reportSlug: u.reportSlug };
    },

    /** @returns {{ id: string, email: string, reportSlug: string } | null} */
    getUserByEmail(email) {
      const em = normalizeEmail(email);
      const data = load();
      const u = data.users.find((x) => x.email === em);
      if (!u) return null;
      return { id: u.id, email: u.email, reportSlug: u.reportSlug };
    },

    setPasswordForUser(userId, newPassword) {
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
      const data = load();
      const u = data.users.find((x) => x.id === userId);
      if (!u) {
        const err = new Error('User not found.');
        err.status = 404;
        throw err;
      }
      u.passwordHash = hashPassword(newPassword);
      save(data);
      return { id: u.id, email: u.email, reportSlug: u.reportSlug };
    },
  };
}
