/**
 * Generate ADMIN_PASSWORD_HASH for Operator console sign-in (same scrypt format as portal users).
 *
 * Usage:
 *   node scripts/hash-admin-password.mjs "your-strong-password"
 *
 * Or (avoid shell history):
 *   ADMIN_PASSWORD_PLAINTEXT="your-strong-password" node scripts/hash-admin-password.mjs
 */
import { hashPassword } from '../clinic-store.mjs';

const fromArgv = process.argv[2];
const fromEnv = process.env.ADMIN_PASSWORD_PLAINTEXT;
const raw = (fromArgv != null && fromArgv !== '' ? fromArgv : fromEnv) || '';
const password = String(raw).trim();

if (!password) {
  console.error('Missing password. Examples:');
  console.error('  node scripts/hash-admin-password.mjs "your-strong-password"');
  console.error('  ADMIN_PASSWORD_PLAINTEXT="…" node scripts/hash-admin-password.mjs');
  process.exit(1);
}

const hash = hashPassword(password);
console.log('');
console.log('Add this to the environment for the Node service (Railway variables or .env — never commit the hash to git if the repo is public):');
console.log('');
console.log('ADMIN_PASSWORD_HASH=' + hash);
console.log('');
