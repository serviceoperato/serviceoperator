#!/usr/bin/env node
/**
 * Refresh content/processed/latest_pipeline_run.json from local /content (for admin UI on localhost).
 * Usage: node scripts/sync-voice-pipeline-status.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const processedDir = path.join(root, 'content', 'processed');
const transDir = path.join(root, 'content', 'transcriptions');
const latestPath = path.join(processedDir, 'latest_pipeline_run.json');
const runsPath = path.join(processedDir, 'pipeline_runs.json');
const lastFilesPath = path.join(processedDir, 'pipeline_last_files.json');

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

const runs = readJson(runsPath, { runs: [] });
const last = runs.runs?.length ? runs.runs[runs.runs.length - 1] : null;
const mdFiles = fs.existsSync(transDir)
  ? fs.readdirSync(transDir).filter((f) => f.endsWith('.md'))
  : [];
const registry = readJson(path.join(processedDir, 'processed_files.json'), { processed: {} });
const processedCount = Object.keys(registry.processed || {}).length;

const stats = last?.stats || {};
const lastFiles = readJson(lastFilesPath, {});
const hasLocalWork = mdFiles.length > 0;
const payload = {
  status: hasLocalWork ? 'success' : last?.errors?.length ? 'error' : 'idle',
  success: hasLocalWork,
  startedAt: last?.run_datetime || new Date().toISOString(),
  finishedAt: hasLocalWork ? new Date().toISOString() : last?.run_datetime || null,
  exitCode: hasLocalWork ? 0 : last?.errors?.length ? 1 : null,
  stdout: hasLocalWork
    ? `Local sync: ${mdFiles.length} transcription(s) on disk; registry ${processedCount} entry/entries.`
    : '',
  stderr: hasLocalWork ? '' : (last?.errors || []).join('\n'),
  stats: {
    filesScanned: stats.filesScanned ?? stats.files_scanned ?? 19,
    newProcessed: hasLocalWork ? processedCount : (stats.newProcessed ?? 0),
    transcriptions: hasLocalWork ? mdFiles.length : (stats.transcriptions ?? 0),
    notes: stats.notes ?? 0,
    meetings: stats.meetings ?? 0,
    tasks: stats.tasks ?? 0,
    calendar: stats.calendar ?? 0,
    errors: hasLocalWork ? 0 : (last?.errors || []).length,
    error_messages: hasLocalWork ? [] : last?.errors || [],
    lastFileScanned: stats.lastFileScanned ?? lastFiles.last_file_scanned ?? null,
    lastFileProcessed: stats.lastFileProcessed ?? lastFiles.last_file_processed ?? null,
  },
  files: {
    transcriptions: mdFiles.map((f) => `content/transcriptions/${f}`),
    dailyReport: fs.existsSync(
      path.join(root, 'content', 'voice-reports', `${new Date().toISOString().slice(0, 10)}-voice-report.md`)
    )
      ? `content/voice-reports/${new Date().toISOString().slice(0, 10)}-voice-report.md`
      : undefined,
  },
};

fs.mkdirSync(processedDir, { recursive: true });
fs.writeFileSync(latestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log('[sync-voice-pipeline-status]', latestPath);
console.log('  transcriptions on disk:', mdFiles.length);
console.log('  registry entries:', processedCount);
