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
  const pendingFile = path.join(dataDir, 'clinic_pending.json');

  function load() {
    return readJson(file);
  }

  function save(data) {
    writeJson(file, data);
  }

  function loadPending() {
    if (!fs.existsSync(pendingFile)) return { pending: [] };
    try {
      const raw = fs.readFileSync(pendingFile, 'utf8');
      const o = JSON.parse(raw);
      if (!o || !Array.isArray(o.pending)) return { pending: [] };
      return { pending: o.pending };
    } catch {
      return { pending: [] };
    }
  }

  function savePending(pdata) {
    writeJson(pendingFile, pdata);
  }

  /** Derive a valid report slug prefix from the email local part (before @). */
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

  /** Pick a slug not yet used by confirmed users or pending sign-ups. */
  function uniqueReportSlug(data, pdata, base) {
    const taken = new Set([
      ...data.users.map((u) => u.reportSlug),
      ...pdata.pending.map((p) => p.reportSlug),
    ]);
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

    /** Pending email confirmations (no password hashes). */
    listPendingSummaries() {
      const pdata = loadPending();
      return pdata.pending.map((p) => ({
        id: p.id,
        email: p.email,
        reportSlug: p.reportSlug,
        createdAt: p.createdAt,
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
      const data = load();
      const pdata = loadPending();
      if (pdata.pending.some((p) => p.email === em)) {
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
        slug = uniqueReportSlug(data, pdata, baseSlugFromEmail(em));
      }
      if (data.users.some((u) => u.email === em)) {
        const err = new Error('That email is already registered.');
        err.status = 409;
        throw err;
      }
      if (data.users.some((u) => u.reportSlug === slug)) {
        const err = new Error('That report ID is already taken.');
        err.status = 409;
        throw err;
      }
      if (pdata.pending.some((p) => p.reportSlug === slug)) {
        const err = new Error('That report ID is reserved by a pending sign-up.');
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

    /**
     * Stage a self-service sign-up (password stored hashed until email is confirmed).
     * @returns {{ id: string, email: string, reportSlug: string }}
     */
    createPendingRegistration({ email, password }) {
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
      const data = load();
      const pdata = loadPending();
      if (data.users.some((u) => u.email === em)) {
        const err = new Error('That email is already registered.');
        err.status = 409;
        throw err;
      }
      pdata.pending = pdata.pending.filter((p) => p.email !== em);
      const base = baseSlugFromEmail(em);
      const slug = uniqueReportSlug(data, pdata, base);
      const id = crypto.randomUUID();
      const row = {
        id,
        email: em,
        passwordHash: hashPassword(password),
        reportSlug: slug,
        createdAt: new Date().toISOString(),
      };
      pdata.pending.push(row);
      savePending(pdata);
      return { id, email: em, reportSlug: slug, createdAt: row.createdAt };
    },

    /** Promote a pending row to a confirmed user (after email verification). */
    finalizePendingRegistration(pendingId, jwtEmail) {
      if (typeof pendingId !== 'string' || !pendingId) {
        const err = new Error('Invalid registration.');
        err.status = 400;
        throw err;
      }
      const pdata = loadPending();
      const idx = pdata.pending.findIndex((p) => p.id === pendingId);
      if (idx < 0) {
        const err = new Error('Registration not found or already completed.');
        err.status = 404;
        throw err;
      }
      const pen = pdata.pending[idx];
      if (typeof jwtEmail === 'string' && jwtEmail && normalizeEmail(pen.email) !== normalizeEmail(jwtEmail)) {
        const err = new Error('Invalid confirmation link.');
        err.status = 401;
        throw err;
      }
      const data = load();
      if (data.users.some((u) => u.email === pen.email)) {
        pdata.pending.splice(idx, 1);
        savePending(pdata);
        const err = new Error('That email is already registered.');
        err.status = 409;
        throw err;
      }
      if (data.users.some((u) => u.reportSlug === pen.reportSlug)) {
        pdata.pending.splice(idx, 1);
        savePending(pdata);
        const err = new Error('That report ID is no longer available. Start registration again.');
        err.status = 409;
        throw err;
      }
      const uid = crypto.randomUUID();
      const userRow = {
        id: uid,
        email: pen.email,
        passwordHash: pen.passwordHash,
        reportSlug: pen.reportSlug,
        createdAt: new Date().toISOString(),
      };
      data.users.push(userRow);
      pdata.pending.splice(idx, 1);
      save(data);
      savePending(pdata);
      return { id: uid, email: pen.email, reportSlug: pen.reportSlug, createdAt: userRow.createdAt };
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
