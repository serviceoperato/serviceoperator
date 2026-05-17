#!/usr/bin/env node
/** Write content/processed/transcriptions_index.json from content/ folders. */
import path from 'path';
import { fileURLToPath } from 'url';
import { writeTranscriptionsIndexFile } from '../lib/transcriptions-index.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = writeTranscriptionsIndexFile(root);
console.log('[index_transcriptions]', out);
