#!/usr/bin/env node
/**
 * Phase 2 — Cursor Composer (local workspace via @cursor/sdk).
 * Requires CURSOR_API_KEY (Cursor Dashboard), NOT OpenAI_API_KEY.
 *
 * Usage:
 *   node scripts/cursor_voice_phase2.mjs
 *   node scripts/cursor_voice_phase2.mjs content/transcriptions/Voice_001.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const TRANSCRIPTIONS = path.join(REPO, 'content', 'transcriptions');
const PROMPT_DOC = path.join(REPO, 'content', 'voice-reports', 'cursor-voice-ai-prompt.md');

function loadEnvFile() {
  const envPath = path.join(REPO, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function loadCursorSdk() {
  const sdkPkg = path.join(REPO, 'telegram-cursor-bot', 'node_modules', '@cursor', 'sdk');
  const pkgJson = path.join(sdkPkg, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    throw new Error(
      'Missing @cursor/sdk. Run: cd telegram-cursor-bot && npm install'
    );
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  const entry = path.join(sdkPkg, pkg.exports?.['.']?.import || pkg.module || 'dist/index.js');
  return import(pathToFileURL(entry).href);
}

function listRawTargets(argvPaths) {
  if (argvPaths.length) {
    return argvPaths.map((p) => path.resolve(REPO, p));
  }
  if (!fs.existsSync(TRANSCRIPTIONS)) return [];
  return fs
    .readdirSync(TRANSCRIPTIONS)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(TRANSCRIPTIONS, f));
}

function needsProcessing(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (text.includes('<!-- PROCESSED: true')) return false;
  return true;
}

function buildPrompt(rawRel) {
  const rules = fs.existsSync(PROMPT_DOC)
    ? fs.readFileSync(PROMPT_DOC, 'utf8')
    : 'Process voice transcription into AI-ready outputs.';
  return [
    'Process exactly ONE raw voice transcription with Cursor Composer (local repo).',
    '',
    `Raw file: ${rawRel}`,
    '',
    'Follow the runbook:',
    rules,
    '',
    'When finished, reply with a short JSON line:',
    '{"ok":true,"raw":"...","primaryOutput":"content/notes/... or content/meetings/...","status":"ready_for_site"}',
  ].join('\n');
}

async function processOne(agent, rawPath) {
  const rawRel = path.relative(REPO, rawPath).replace(/\\/g, '/');
  console.log(`[cursor-voice-phase2] Composer processing ${rawRel}`);
  const prompt = buildPrompt(rawRel);
  const run = await agent.send(prompt);
  for await (const event of run.stream()) {
    if (event.type === 'assistant') {
      for (const block of event.message.content) {
        if (block.type === 'text') process.stdout.write(block.text);
      }
    }
  }
  const result = await run.wait();
  console.log('');
  if (result.status === 'error') {
    throw new Error(`Cursor run failed for ${rawRel} (id ${result.id})`);
  }
  return result;
}

async function main() {
  loadEnvFile();
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error(
      'CURSOR_API_KEY is required for Phase 2 (Cursor Composer via SDK).\n' +
        'Get a key: https://cursor.com/dashboard — add to .env\n' +
        'This is NOT OpenAI; it uses your Cursor subscription (Composer).\n' +
        'Alternatively, ask the Cursor chat agent to process files in content/transcriptions/ manually.'
    );
    process.exit(1);
  }

  const { Agent } = await loadCursorSdk();
  const modelId = process.env.CURSOR_MODEL_ID || 'composer-2';
  const thinking = (process.env.CURSOR_MODEL_THINKING || 'high').toLowerCase();
  const model =
    thinking === 'high' || thinking === 'medium' || thinking === 'low'
      ? { id: modelId, params: [{ id: 'thinking', value: thinking }] }
      : { id: modelId };

  const argvPaths = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = listRawTargets(argvPaths).filter(needsProcessing);
  if (!targets.length) {
    console.log('[cursor-voice-phase2] No raw files need processing.');
    process.exit(0);
  }

  console.log(`[cursor-voice-phase2] ${targets.length} file(s), workspace ${REPO}`);

  await using agent = await Agent.create({
    apiKey,
    model,
    local: { cwd: REPO },
  });

  let errors = 0;
  for (const rawPath of targets) {
    try {
      await processOne(agent, rawPath);
    } catch (e) {
      errors += 1;
      console.error(`[cursor-voice-phase2] ERROR ${path.basename(rawPath)}:`, e.message || e);
    }
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
