#!/usr/bin/env node
/**
 * One-time operator note: legacy admin uploads stored as /assets/site-uploads/su-* on disk
 * are not migrated into Postgres automatically (bytes were never in the DB).
 *
 * Run: node scripts/print-legacy-site-upload-note.mjs
 */
console.log(`
Legacy site uploads (/assets/site-uploads/su-*.png etc.)
-------------------------------------------------------
If site appearance still references those paths after a redeploy, previews and the live
site break because Railway’s disk is ephemeral.

Fix:
1) Set DATABASE_URL on the Node service that runs server.mjs and redeploy until
   "Postgres pool active: true" appears in admin → Deploy log.
2) In Site appearance, upload each image again. New URLs look like
   /api/site-uploads/<uuid> and are served from the site_uploads table.
`);
