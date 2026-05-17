/**
 * Append-only admin access audit log (JSON lines).
 * Path: content/processed/admin-audit.log
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = path.join(REPO_ROOT, 'content', 'processed', 'admin-audit.log');

function ensureLogDir() {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   ts: string;
 *   ip: string;
 *   method: string;
 *   path: string;
 *   adminEmail: string | null;
 *   status: number;
 * }} entry
 */
export function appendAdminAuditLog(entry) {
  ensureLogDir();
  const line =
    JSON.stringify({
      ts: entry.ts || new Date().toISOString(),
      ip: entry.ip || 'unknown',
      method: entry.method || 'GET',
      path: entry.path || '',
      adminEmail: entry.adminEmail ?? null,
      status: typeof entry.status === 'number' ? entry.status : 0,
    }) + '\n';
  fs.appendFile(LOG_PATH, line, (err) => {
    if (err) {
      console.warn('[admin-audit]', err.message || err);
    }
  });
}

export function adminAuditLogPath() {
  return LOG_PATH;
}
