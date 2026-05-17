import { spawn } from 'child_process';
import path from 'path';
import { INDEX_SCRIPT, REPO_ROOT } from './paths.mjs';

function pythonBin() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Run scripts/index_transcriptions.py and resolve when the process exits.
 */
export function runTranscriptionsIndexScript() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(pythonBin(), [INDEX_SCRIPT], {
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        script: path.relative(REPO_ROOT, INDEX_SCRIPT).replace(/\\/g, '/'),
      });
    });
    child.on('error', (err) => {
      resolve({
        ok: false,
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: err && err.message ? err.message : String(err),
        script: path.relative(REPO_ROOT, INDEX_SCRIPT).replace(/\\/g, '/'),
      });
    });
  });
}
