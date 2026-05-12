import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PG_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS portal_user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS portal_user_sessions_user_id_idx ON portal_user_sessions (user_id, started_at DESC);
CREATE TABLE IF NOT EXISTS portal_user_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  page_path TEXT,
  duration_ms INTEGER,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_user_activity_user_id_idx ON portal_user_activity (user_id, created_at DESC);
`;

function isoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const type = typeof event.type === 'string' ? event.type.trim() : '';
  if (!type) return null;
  const pagePath =
    typeof event.path === 'string'
      ? event.path.trim()
      : typeof event.pagePath === 'string'
        ? event.pagePath.trim()
        : null;
  const durationMs = Number(event.durationMs);
  return {
    type,
    pagePath: pagePath || null,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null,
    detail: event.detail && typeof event.detail === 'object' ? event.detail : null,
    createdAt: typeof event.at === 'string' && event.at ? event.at : new Date().toISOString(),
  };
}

function mapSessionRow(row) {
  if (!row) return null;
  const startedAt = isoTimestamp(row.started_at);
  const lastSeenAt = isoTimestamp(row.last_seen_at);
  const endedAt = isoTimestamp(row.ended_at);
  let durationMs = null;
  if (startedAt && (endedAt || lastSeenAt)) {
    durationMs = Math.max(0, new Date(endedAt || lastSeenAt).getTime() - new Date(startedAt).getTime());
  }
  return {
    id: row.id,
    userId: row.user_id,
    startedAt,
    endedAt,
    lastSeenAt,
    durationMs,
    ip: row.ip || null,
    country: row.country || null,
    city: row.city || null,
    region: row.region || null,
    userAgent: row.user_agent || null,
  };
}

function mapActivityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    type: row.event_type,
    pagePath: row.page_path || null,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    detail: row.detail || null,
    createdAt: isoTimestamp(row.created_at),
  };
}

export async function ensureUserTelemetrySchema(pool) {
  if (!pool) return;
  await pool.query(PG_SCHEMA_SQL);
}

export function createUserTelemetryStore({ pool, dataDir }) {
  if (pool) {
    return {
      async startLoginSession(userId, meta = {}) {
        if (typeof userId !== 'string' || !userId) return null;
        const sessionId = crypto.randomUUID();
        const ip = typeof meta.ip === 'string' ? meta.ip.trim() : null;
        const country = typeof meta.country === 'string' ? meta.country.trim().toUpperCase() : null;
        const city = typeof meta.city === 'string' ? meta.city.trim() : null;
        const region = typeof meta.region === 'string' ? meta.region.trim() : null;
        const userAgent = typeof meta.userAgent === 'string' ? meta.userAgent.trim() : null;
        await pool.query(
          `INSERT INTO portal_user_sessions (
            id, user_id, ip, country, city, region, user_agent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sessionId, userId, ip, country, city, region, userAgent]
        );
        return sessionId;
      },

      async touchSession(sessionId, userId) {
        if (!sessionId || !userId) return;
        await pool.query(
          `UPDATE portal_user_sessions
           SET last_seen_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [sessionId, userId]
        );
      },

      async appendEvents(userId, sessionId, events) {
        if (!userId || !sessionId || !Array.isArray(events) || !events.length) return 0;
        let written = 0;
        for (const raw of events) {
          const event = normalizeEvent(raw);
          if (!event) continue;
          await pool.query(
            `INSERT INTO portal_user_activity (
              id, user_id, session_id, event_type, page_path, duration_ms, detail, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
            [
              crypto.randomUUID(),
              userId,
              sessionId,
              event.type,
              event.pagePath,
              event.durationMs,
              event.detail ? JSON.stringify(event.detail) : null,
              event.createdAt,
            ]
          );
          written += 1;
        }
        if (written) {
          await pool.query(
            `UPDATE portal_user_sessions
             SET last_seen_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [sessionId, userId]
          );
        }
        return written;
      },

      async getUserTelemetry(userId, { sessionLimit = 20, eventLimit = 100 } = {}) {
        if (!userId) return { sessions: [], events: [] };
        const sessions = await pool.query(
          `SELECT id, user_id, started_at, ended_at, last_seen_at, ip, country, city, region, user_agent
           FROM portal_user_sessions
           WHERE user_id = $1
           ORDER BY started_at DESC
           LIMIT $2`,
          [userId, sessionLimit]
        );
        const events = await pool.query(
          `SELECT id, user_id, session_id, event_type, page_path, duration_ms, detail, created_at
           FROM portal_user_activity
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [userId, eventLimit]
        );
        return {
          sessions: sessions.rows.map(mapSessionRow).filter(Boolean),
          events: events.rows.map(mapActivityRow).filter(Boolean),
        };
      },
    };
  }

  const file = path.join(dataDir, 'portal_user_telemetry.json');

  function load() {
    if (!fs.existsSync(file)) return { sessions: [], events: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
        events: Array.isArray(raw.events) ? raw.events : [],
      };
    } catch {
      return { sessions: [], events: [] };
    }
  }

  function save(data) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    async startLoginSession(userId, meta = {}) {
      if (typeof userId !== 'string' || !userId) return null;
      const data = load();
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();
      data.sessions.unshift({
        id: sessionId,
        userId,
        startedAt: now,
        endedAt: null,
        lastSeenAt: now,
        ip: typeof meta.ip === 'string' ? meta.ip.trim() : null,
        country: typeof meta.country === 'string' ? meta.country.trim().toUpperCase() : null,
        city: typeof meta.city === 'string' ? meta.city.trim() : null,
        region: typeof meta.region === 'string' ? meta.region.trim() : null,
        userAgent: typeof meta.userAgent === 'string' ? meta.userAgent.trim() : null,
      });
      data.sessions = data.sessions.slice(0, 500);
      save(data);
      return sessionId;
    },

    async touchSession(sessionId, userId) {
      if (!sessionId || !userId) return;
      const data = load();
      const row = data.sessions.find((s) => s.id === sessionId && s.userId === userId);
      if (!row) return;
      row.lastSeenAt = new Date().toISOString();
      save(data);
    },

    async appendEvents(userId, sessionId, events) {
      if (!userId || !sessionId || !Array.isArray(events) || !events.length) return 0;
      const data = load();
      let written = 0;
      for (const raw of events) {
        const event = normalizeEvent(raw);
        if (!event) continue;
        data.events.unshift({
          id: crypto.randomUUID(),
          userId,
          sessionId,
          type: event.type,
          pagePath: event.pagePath,
          durationMs: event.durationMs,
          detail: event.detail,
          createdAt: event.createdAt,
        });
        written += 1;
      }
      if (written) {
        const row = data.sessions.find((s) => s.id === sessionId && s.userId === userId);
        if (row) row.lastSeenAt = new Date().toISOString();
        data.events = data.events.slice(0, 5000);
        save(data);
      }
      return written;
    },

    async getUserTelemetry(userId, { sessionLimit = 20, eventLimit = 100 } = {}) {
      const data = load();
      const sessions = data.sessions
        .filter((s) => s.userId === userId)
        .slice(0, sessionLimit)
        .map((row) => mapSessionRow({
          id: row.id,
          user_id: row.userId,
          started_at: row.startedAt,
          ended_at: row.endedAt,
          last_seen_at: row.lastSeenAt,
          ip: row.ip,
          country: row.country,
          city: row.city,
          region: row.region,
          user_agent: row.userAgent,
        }));
      const events = data.events
        .filter((e) => e.userId === userId)
        .slice(0, eventLimit)
        .map((row) => mapActivityRow({
          id: row.id,
          user_id: row.userId,
          session_id: row.sessionId,
          event_type: row.type,
          page_path: row.pagePath,
          duration_ms: row.durationMs,
          detail: row.detail,
          created_at: row.createdAt,
        }));
      return { sessions, events };
    },
  };
}
