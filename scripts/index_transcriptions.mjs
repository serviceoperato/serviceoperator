#!/usr/bin/env node
/** Wrapper: run scripts/index_transcriptions.py */
import { runTranscriptionsIndexScript } from '../lib/transcriptions/run-index.mjs';

const run = await runTranscriptionsIndexScript();
if (run.stdout) console.log(run.stdout);
if (run.stderr) console.error(run.stderr);
process.exit(run.ok ? 0 : 1);
