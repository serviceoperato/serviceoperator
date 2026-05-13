/**
 * Portal users (generic accounts) — JSON on disk (see DATA_DIR).
 * Primary files: user_accounts.json, user_pending.json.
 * Legacy: clinic_users.json, clinic_pending.json (read if missing primary).
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

export { hashPassword };

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

function readPendingFile(pf) {
  if (!fs.existsSync(pf)) return { pending: [] };
  try {
    const raw = fs.readFileSync(pf, 'utf8');
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.pending)) return { pending: [] };
    return { pending: o.pending };
  } catch {
    return { pending: [] };
  }
}

function displayNameFromEmail(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  return at > 0 ? e.slice(0, at) : e || '';
}

function withProfileDefaults(user) {
  const createdAt = user.createdAt || new Date().toISOString();
  return {
    id: user.id,
    email: user.email,
    reportSlug: user.reportSlug,
    displayName: user.displayName || displayNameFromEmail(user.email),
    gender: user.gender || null,
    active: user.active !== false,
    admin: user.admin === true,
    plus: user.plus === true,
    spend: Number(user.spend) || 0,
    earned: Number(user.earned) || 0,
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIp: user.lastLoginIp || null,
    country: user.country || null,
    lastLoginCity: user.lastLoginCity || null,
    lastLoginRegion: user.lastLoginRegion || null,
    lastUserAgent: user.lastUserAgent || null,
    loginCount: Number(user.loginCount) || 0,
    lastSeenAt: user.lastSeenAt || null,
    createdAt,
    updatedAt: user.updatedAt || createdAt,
  };
}

function newUserProfileFields(email) {
  const createdAt = new Date().toISOString();
  return {
    displayName: displayNameFromEmail(email),
    gender: null,
    active: true,
    admin: false,
    plus: false,
    spend: 0,
    earned: 0,
    lastLoginAt: null,
    lastLoginIp: null,
    country: null,
    lastLoginCity: null,
    lastLoginRegion: null,
    lastUserAgent: null,
    loginCount: 0,
    lastSeenAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createUserStore(dataDir, adminEmail) {
  const file = path.join(dataDir, 'user_accounts.json');
  const legacyUsersFile = path.join(dataDir, 'clinic_users.json');
  const pendingFile = path.join(dataDir, 'user_pending.json');
  const legacyPendingFile = path.join(dataDir, 'clinic_pending.json');

  function load() {
    if (fs.existsSync(file)) return readJson(file);
    if (fs.existsSync(legacyUsersFile)) return readJson(legacyUsersFile);
    return { users: [] };
  }

  function save(data) {
    writeJson(file, data);
  }

  function ensureBootstrapAdmin(data) {
    const em = normalizeEmail(adminEmail);
    if (!em) return;
    let changed = false;
    for (const user of data.users) {
      if (normalizeEmail(user.email) === em && user.admin !== true) {
        user.admin = true;
        user.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) save(data);
  }

  function loadPending() {
    if (fs.existsSync(pendingFile)) return readPendingFile(pendingFile);
    if (fs.existsSync(legacyPendingFile)) return readPendingFile(legacyPendingFile);
    return { pending: [] };
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
      const data = load();
      ensureBootstrapAdmin(data);
      return data.users.map((u) => withProfileDefaults(u));
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

    /** @returns {{ id: string, email: string, reportSlug: string } | null} */
    findPendingByEmail(email) {
      const em = normalizeEmail(email);
      const pdata = loadPending();
      const p = pdata.pending.find((x) => x.email === em);
      if (!p) return null;
      return { id: p.id, email: p.email, reportSlug: p.reportSlug };
    },

    /** @returns {{ id: string, email: string } | null} */
    findPendingByVerificationToken(token) {
      const t = typeof token === 'string' ? token.trim() : '';
      if (!t || t.length > 200 || /[\s<>"']/.test(t)) return null;
      const pdata = loadPending();
      const p = pdata.pending.find((x) => x.verificationToken === t);
      if (!p) return null;
      return { id: p.id, email: p.email };
    },

    /** @returns {string} */
    issuePendingVerificationToken(pendingId) {
      if (typeof pendingId !== 'string' || !pendingId) {
        const err = new Error('Invalid registration.');
        err.status = 400;
        throw err;
      }
      const tok = crypto.randomBytes(32).toString('hex');
      const pdata = loadPending();
      const p = pdata.pending.find((x) => x.id === pendingId);
      if (!p) {
        const err = new Error('Registration not found.');
        err.status = 404;
        throw err;
      }
      p.verificationToken = tok;
      savePending(pdata);
      return tok;
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
      const profile = newUserProfileFields(em);
      const row = {
        id,
        email: em,
        passwordHash: hashPassword(password),
        reportSlug: slug,
        ...profile,
      };
      data.users.push(row);
      save(data);
      return withProfileDefaults(row);
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
        verificationToken: crypto.randomBytes(32).toString('hex'),
      };
      pdata.pending.push(row);
      savePending(pdata);
      return { id, email: em, reportSlug: slug, createdAt: row.createdAt, verificationToken: row.verificationToken };
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
      const profile = newUserProfileFields(pen.email);
      const userRow = {
        id: uid,
        email: pen.email,
        passwordHash: pen.passwordHash,
        reportSlug: pen.reportSlug,
        ...profile,
      };
      data.users.push(userRow);
      pdata.pending.splice(idx, 1);
      save(data);
      savePending(pdata);
      return withProfileDefaults(userRow);
    },

    verifyLogin(email, password) {
      const em = normalizeEmail(email);
      const data = load();
      const u = data.users.find((x) => x.email === em);
      if (!u) return null;
      if (!verifyPassword(password, u.passwordHash)) return null;
      if (u.active === false) return null;
      return { id: u.id, email: u.email, reportSlug: u.reportSlug };
    },

    /** @returns {{ id: string, email: string, reportSlug: string } | null} */
    getUserByEmail(email) {
      const em = normalizeEmail(email);
      const data = load();
      const u = data.users.find((x) => x.email === em);
      if (!u) return null;
      return { id: u.id, email: u.email, reportSlug: u.reportSlug, active: u.active !== false };
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
      u.updatedAt = new Date().toISOString();
      save(data);
      return { id: u.id, email: u.email, reportSlug: u.reportSlug };
    },

    recordLogin(userId, { ip, country, city, region, userAgent } = {}) {
      if (typeof userId !== 'string' || !userId) return null;
      const data = load();
      const u = data.users.find((x) => x.id === userId);
      if (!u) return null;
      const now = new Date().toISOString();
      u.lastLoginAt = now;
      u.lastSeenAt = now;
      if (typeof ip === 'string' && ip.trim()) u.lastLoginIp = ip.trim();
      if (typeof country === 'string' && country.trim()) u.country = country.trim().toUpperCase();
      if (typeof city === 'string' && city.trim()) u.lastLoginCity = city.trim();
      if (typeof region === 'string' && region.trim()) u.lastLoginRegion = region.trim();
      if (typeof userAgent === 'string' && userAgent.trim()) u.lastUserAgent = userAgent.trim();
      u.loginCount = (Number(u.loginCount) || 0) + 1;
      u.updatedAt = now;
      save(data);
      return withProfileDefaults(u);
    },

    touchLastSeen(userId) {
      if (typeof userId !== 'string' || !userId) return null;
      const data = load();
      const u = data.users.find((x) => x.id === userId);
      if (!u) return null;
      const now = new Date().toISOString();
      u.lastSeenAt = now;
      u.updatedAt = now;
      save(data);
      return withProfileDefaults(u);
    },

    updateUserProfile(userId, patch = {}) {
      if (typeof userId !== 'string' || !userId) {
        const err = new Error('Invalid user.');
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
      let changed = false;
      if (typeof patch.displayName === 'string') {
        const name = patch.displayName.trim();
        if (!name) {
          const err = new Error('Display name cannot be empty.');
          err.status = 400;
          throw err;
        }
        u.displayName = name;
        changed = true;
      }
      if (patch.gender === null || typeof patch.gender === 'string') {
        u.gender = typeof patch.gender === 'string' ? patch.gender.trim() || null : null;
        changed = true;
      }
      if (typeof patch.active === 'boolean') {
        u.active = patch.active;
        changed = true;
      }
      if (typeof patch.admin === 'boolean') {
        u.admin = patch.admin;
        changed = true;
      }
      if (typeof patch.plus === 'boolean') {
        u.plus = patch.plus;
        changed = true;
      }
      if (patch.spend != null) {
        const spend = Number(patch.spend);
        if (!Number.isFinite(spend) || spend < 0) {
          const err = new Error('Spend must be a non-negative number.');
          err.status = 400;
          throw err;
        }
        u.spend = Math.round(spend);
        changed = true;
      }
      if (patch.earned != null) {
        const earned = Number(patch.earned);
        if (!Number.isFinite(earned) || earned < 0) {
          const err = new Error('Earned must be a non-negative number.');
          err.status = 400;
          throw err;
        }
        u.earned = Math.round(earned);
        changed = true;
      }
      if (typeof patch.country === 'string') {
        u.country = patch.country.trim().toUpperCase() || null;
        changed = true;
      }
      if (!changed) {
        const err = new Error('No profile fields to update.');
        err.status = 400;
        throw err;
      }
      u.updatedAt = new Date().toISOString();
      save(data);
      return withProfileDefaults(u);
    },

    getStorageSummary() {
      function statSafe(target) {
        try {
          if (!fs.existsSync(target)) return { exists: false, bytes: 0, mtimeIso: null };
          const st = fs.statSync(target);
          return { exists: true, bytes: st.size, mtimeIso: st.mtime.toISOString() };
        } catch (e) {
          return { exists: false, bytes: 0, mtimeIso: null, readError: e.message || 'read failed' };
        }
      }

      const data = load();
      const pdata = loadPending();
      let writable = 'unknown';
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.accessSync(dataDir, fs.constants.W_OK);
        writable = 'ok';
      } catch {
        writable = 'fail';
      }

      return {
        backend: 'json-files',
        dataDir,
        writable,
        accountsFile: file,
        pendingFile,
        accountsFileStats: statSafe(file),
        pendingFileStats: statSafe(pendingFile),
        legacyAccountsFileStats: statSafe(legacyUsersFile),
        legacyPendingFileStats: statSafe(legacyPendingFile),
        confirmedUserCount: data.users.length,
        pendingRegistrationCount: pdata.pending.length,
      };
    },
  };
}

/** @deprecated Use createUserStore */
export const createClinicStore = createUserStore;
