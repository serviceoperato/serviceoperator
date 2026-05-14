-- Optional manual migration (the app also runs CREATE TABLE IF NOT EXISTS on startup).
CREATE TABLE IF NOT EXISTS site_uploads (
  id UUID PRIMARY KEY,
  mime_type TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
