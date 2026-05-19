#!/usr/bin/env node
/**
 * Assert transcriptions index API raw counts match voice-recorder disk basis.
 * Usage: node scripts/test-transcriptions-index-counts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTranscriptionsIndex } from '../lib/transcriptions/store.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const transDir = path.join(root, 'content', 'transcriptions');
const diskCount = fs.existsSync(transDir)
  ? fs.readdirSync(transDir).filter((f) => f.endsWith('.md')).length
  : 0;

const index = loadTranscriptionsIndex();
const raw = index.rawTranscriptionCount;
const waiting = index.rawSources?.waitingForProcessing ?? 0;
const pending = (index.rawSources?.pendingSources || []).length;
const aiReady = index.sourceTotals?.total ?? index.items.length;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    failed += 1;
  } else {
    console.log('OK  ', msg);
  }
}

assert(raw === diskCount, `rawTranscriptionCount ${raw} === disk .md count ${diskCount}`);
assert(
  raw === aiReady + waiting || waiting === 0,
  `raw ${raw} ~= aiReady ${aiReady} + waiting ${waiting} (pending list ${pending})`,
);
assert(pending >= waiting, `pendingSources ${pending} >= waitingForProcessing ${waiting}`);

if (failed) process.exit(1);
console.log('All count alignment checks passed.');
