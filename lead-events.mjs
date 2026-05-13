/**
 * Append-only marketing / funnel events (IP, path, tier intent, optional user id).
 * PostgreSQL when pool is set; otherwise JSON under DATA_DIR.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PG_SQL = `
CREATE TABLE IF NOT EXISTS lead_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  ip TEXT,
  path TEXT,
  tier TEXT,
  user_id TEXT,
  user_agent TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_events_created_at_idx ON lead_events (created_at DESC);
CREATE INDEX IF NOT EXISTS lead_events_ip_created_idx ON lead_events (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_events_user_created_idx ON lead_events (user_id, created_at DESC);
`;

export async function ensureLeadEventsSchema(pool) {
  if (!pool) return;
  await pool.query(PG_SQL);
}

function clip(s, max) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function createLeadEventsStore({ pool, dataDir }) {
  if (pool) {
    return {
      async appendEvent({ eventType, ip, pagePath, tier, userId, userAgent, detail } = {}) {
        const et = clip(eventType, 120);
        if (!et) return;
        const id = crypto.randomUUID();
        const ipC = clip(ip, 120);
        const pathC = clip(pagePath, 500);
        const tierC = clip(tier, 40);
        const uid = clip(userId, 80);
        const ua = clip(userAgent, 500);
        const detailJson =
          detail && typeof detail === 'object' ? JSON.stringify(detail) : null;
        await pool.query(
          `INSERT INTO lead_events (id, event_type, ip, path, tier, user_id, user_agent, detail)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [id, et, ipC, pathC, tierC, uid, ua, detailJson]
        );
      },
    };
  }

  const file = path.join(dataDir, 'lead_events.json');

  function load() {
    if (!fs.existsSync(file)) return { events: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { events: Array.isArray(raw.events) ? raw.events : [] };
    } catch {
      return { events: [] };
    }
  }

  function save(data) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    async appendEvent({ eventType, ip, pagePath, tier, userId, userAgent, detail } = {}) {
      const et = clip(eventType, 120);
      if (!et) return;
      const data = load();
      data.events.unshift({
        id: crypto.randomUUID(),
        eventType: et,
        ip: clip(ip, 120),
        path: clip(pagePath, 500),
        tier: clip(tier, 40),
        userId: clip(userId, 80),
        userAgent: clip(userAgent, 500),
        detail: detail && typeof detail === 'object' ? detail : null,
        createdAt: new Date().toISOString(),
      });
      data.events = data.events.slice(0, 8000);
      save(data);
    },
  };
}
