/**
 * Writes public/app-version.json from package.json so static admin can show
 * the deployed UI bundle version alongside GET /api/version (backend).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const outPath = path.join(root, 'public', 'app-version.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.0.0';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ version }, null, 0) + '\n', 'utf8');
process.stdout.write(`[write-app-version] ${outPath} → ${version}\n`);
