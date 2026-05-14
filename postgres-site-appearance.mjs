/**
 * Site appearance (nav logo, heroes, Jack avatar, icons) stored in PostgreSQL so
 * settings survive deploys when DATA_DIR is ephemeral (e.g. Railway without a volume).
 */

export async function ensureSiteAppearanceSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_appearance_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  /** Admin “Site appearance” image bytes — survives container redeploys (unlike files under public/). */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_uploads (
      id UUID PRIMARY KEY,
      mime_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

const SITE_UPLOAD_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {import('pg').Pool} pool */
export async function insertSiteUpload(pool, id, mimeType, bytes) {
  await pool.query(
    `INSERT INTO site_uploads (id, mime_type, bytes, created_at) VALUES ($1::uuid, $2, $3, NOW())`,
    [id, mimeType, bytes]
  );
}

/** @param {import('pg').Pool} pool */
export async function getSiteUpload(pool, id) {
  if (!SITE_UPLOAD_UUID_RE.test(String(id || '').trim())) return null;
  const { rows } = await pool.query(
    'SELECT mime_type, bytes FROM site_uploads WHERE id = $1::uuid LIMIT 1',
    [id]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return { mimeType: row.mime_type, bytes: row.bytes };
}

/** @param {import('pg').Pool} pool */
export async function deleteSiteUpload(pool, id) {
  if (!SITE_UPLOAD_UUID_RE.test(String(id || '').trim())) return false;
  const r = await pool.query('DELETE FROM site_uploads WHERE id = $1::uuid', [id]);
  return r.rowCount > 0;
}

/** @param {import('pg').Pool} pool */
export async function loadSiteAppearanceJson(pool) {
  const { rows } = await pool.query('SELECT data FROM site_appearance_config WHERE id = 1');
  if (!rows.length) return {};
  const d = rows[0].data;
  if (d && typeof d === 'object' && !Array.isArray(d)) return d;
  return {};
}

/** @param {import('pg').Pool} pool */
export async function saveSiteAppearanceJson(pool, data) {
  await pool.query(
    `INSERT INTO site_appearance_config (id, data, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [JSON.stringify(data)]
  );
}
