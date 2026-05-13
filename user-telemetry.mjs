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

      /** Per-user aggregates for operator profiling (sessions + page_view / page_leave from `user-activity.js`). */
      async listTelemetryProfilingByUser() {
        const { rows } = await pool.query(`
          WITH sess_agg AS (
            SELECT user_id,
              COUNT(*)::int AS session_count,
              MIN(started_at) AS first_session_at,
              MAX(last_seen_at) AS last_session_seen
            FROM portal_user_sessions
            GROUP BY user_id
          ),
          ev_agg AS (
            SELECT user_id,
              COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
              COALESCE(
                SUM(duration_ms) FILTER (
                  WHERE event_type = 'page_leave'
                    AND duration_ms IS NOT NULL
                    AND duration_ms >= 0
                    AND duration_ms < 86400000
                ),
                0
              )::bigint AS page_leave_ms,
              MAX(created_at) AS last_event_at
            FROM portal_user_activity
            GROUP BY user_id
          ),
          all_u AS (
            SELECT user_id FROM sess_agg
            UNION
            SELECT user_id FROM ev_agg
          ),
          latest_sess AS (
            SELECT DISTINCT ON (user_id)
              user_id,
              ip,
              country,
              city,
              region
            FROM portal_user_sessions
            ORDER BY user_id, last_seen_at DESC NULLS LAST, started_at DESC
          )
          SELECT
            u.user_id,
            COALESCE(sa.session_count, 0)::int AS session_count,
            sa.first_session_at,
            (SELECT MAX(v)
             FROM unnest(ARRAY[sa.last_session_seen, ea.last_event_at]) AS t(v)) AS last_activity_at,
            COALESCE(ea.page_views, 0)::int AS page_views,
            COALESCE(ea.page_leave_ms, 0)::bigint AS page_leave_ms,
            ls.ip AS last_session_ip,
            ls.country AS last_session_country,
            ls.city AS last_session_city,
            ls.region AS last_session_region
          FROM all_u u
          LEFT JOIN sess_agg sa ON sa.user_id = u.user_id
          LEFT JOIN ev_agg ea ON ea.user_id = u.user_id
          LEFT JOIN latest_sess ls ON ls.user_id = u.user_id
        `);
        const out = {};
        for (const row of rows) {
          const uid = row.user_id;
          if (!uid) continue;
          out[uid] = {
            sessionCount: Number(row.session_count) || 0,
            firstSessionAt: isoTimestamp(row.first_session_at),
            lastActivityAt: isoTimestamp(row.last_activity_at),
            pageViews: Number(row.page_views) || 0,
            pageLeaveMs: row.page_leave_ms != null ? Number(row.page_leave_ms) : 0,
            lastSessionIp: row.last_session_ip || null,
            lastSessionCountry: row.last_session_country || null,
            lastSessionCity: row.last_session_city || null,
            lastSessionRegion: row.last_session_region || null,
          };
        }
        return out;
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

    async listTelemetryProfilingByUser() {
      const data = load();
      const map = new Map();
      function ensure(uid) {
        if (typeof uid !== 'string' || !uid) return null;
        let o = map.get(uid);
        if (!o) {
          o = {
            sessionCount: 0,
            firstSessionAt: null,
            lastSessionActivityMs: 0,
            pageViews: 0,
            pageLeaveMs: 0,
            lastEventMs: 0,
            pickGeoMs: -1,
            lastSessionIp: null,
            lastSessionCountry: null,
            lastSessionCity: null,
            lastSessionRegion: null,
          };
          map.set(uid, o);
        }
        return o;
      }
      for (const s of data.sessions) {
        const o = ensure(s.userId);
        if (!o) continue;
        o.sessionCount += 1;
        const startedMs = s.startedAt ? Date.parse(s.startedAt) : NaN;
        if (Number.isFinite(startedMs)) {
          if (o.firstSessionAt == null || startedMs < Date.parse(o.firstSessionAt)) {
            o.firstSessionAt = s.startedAt;
          }
        }
        const lastSeenMs = s.lastSeenAt ? Date.parse(s.lastSeenAt) : startedMs;
        if (Number.isFinite(lastSeenMs) && lastSeenMs > o.lastSessionActivityMs) {
          o.lastSessionActivityMs = lastSeenMs;
        }
        const pickMs = Number.isFinite(lastSeenMs) ? lastSeenMs : NaN;
        if (Number.isFinite(pickMs) && pickMs >= o.pickGeoMs) {
          o.pickGeoMs = pickMs;
          o.lastSessionIp = typeof s.ip === 'string' ? s.ip.trim() || null : s.ip || null;
          o.lastSessionCountry = typeof s.country === 'string' ? s.country.trim().toUpperCase() || null : null;
          o.lastSessionCity = typeof s.city === 'string' ? s.city.trim() || null : null;
          o.lastSessionRegion = typeof s.region === 'string' ? s.region.trim() || null : null;
        }
      }
      for (const e of data.events) {
        const o = ensure(e.userId);
        if (!o) continue;
        if (e.type === 'page_view') o.pageViews += 1;
        const d = Number(e.durationMs);
        if (
          e.type === 'page_leave' &&
          Number.isFinite(d) &&
          d >= 0 &&
          d < 86400000
        ) {
          o.pageLeaveMs += Math.round(d);
        }
        const et = e.createdAt ? Date.parse(e.createdAt) : NaN;
        if (Number.isFinite(et) && et > o.lastEventMs) o.lastEventMs = et;
      }
      const out = {};
      for (const [uid, o] of map) {
        const lastMs = Math.max(o.lastSessionActivityMs, o.lastEventMs);
        out[uid] = {
          sessionCount: o.sessionCount,
          firstSessionAt: o.firstSessionAt,
          lastActivityAt: lastMs > 0 ? new Date(lastMs).toISOString() : null,
          pageViews: o.pageViews,
          pageLeaveMs: o.pageLeaveMs,
          lastSessionIp: o.lastSessionIp,
          lastSessionCountry: o.lastSessionCountry,
          lastSessionCity: o.lastSessionCity,
          lastSessionRegion: o.lastSessionRegion,
        };
      }
      return out;
    },
  };
}
