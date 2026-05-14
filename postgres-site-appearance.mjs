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
