import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(__dirname, '..', '..');
export const CONTENT_DIR = path.join(REPO_ROOT, 'content');
export const PROCESSED_DIR = path.join(CONTENT_DIR, 'processed');
export const INDEX_PATH = path.join(PROCESSED_DIR, 'transcriptions_index.json');
export const SYNC_SETTINGS_PATH = path.join(PROCESSED_DIR, 'sync_settings.json');
export const INDEX_SCRIPT = path.join(REPO_ROOT, 'scripts', 'index_transcriptions.py');

export const SCAN_CATEGORIES = [
  'meetings',
  'notes',
  'tasks',
  'calendar',
  'projects',
  'decisions',
  'open-points',
];
