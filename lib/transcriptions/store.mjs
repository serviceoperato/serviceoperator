import fs from 'fs';
import path from 'path';
import {
  CONTENT_DIR,
  INDEX_PATH,
  PROCESSED_DIR,
  REPO_ROOT,
  SYNC_SETTINGS_PATH,
} from './paths.mjs';

const EMPTY_TOTALS = {
  meetings: 0,
  notes: 0,
  tasks: 0,
  calendar: 0,
  projects: 0,
  decisions: 0,
  'open-points': 0,
  total: 0,
};

const AI_READY_PREFIX = 'content/ai-ready-transcriptions/';
const LEGACY_OUTPUT_PREFIXES = [
  'content/meetings/',
  'content/notes/',
  'content/tasks/',
  'content/calendar/',
  'content/projects/',
  'content/decisions/',
  'content/open-points/',
];

function isVisibleIndexItem(it) {
  if (!it || it.source_only) return false;
  const rel = String(it.path || it.filepath || '');
  if (rel.startsWith('content/transcriptions/')) return false;
  if (it.readyForSite === false) return false;
  const st = it.pipelineStatus;
  if (st && st !== 'ai_processed' && st !== 'ready_for_site') return false;
  const underOutput =
    rel.startsWith(AI_READY_PREFIX) ||
    LEGACY_OUTPUT_PREFIXES.some((p) => rel.startsWith(p));
  if (!underOutput) return false;
  if (rel.startsWith(AI_READY_PREFIX)) return true;
  return st === 'ai_processed' || st === 'ready_for_site' || it.readyForSite === true;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function loadSyncSettings() {
  return readJson(SYNC_SETTINGS_PATH, {
    auto_sync_enabled: false,
    calendar_id: 'primary',
    tasklist_id: '@default',
    last_sync: null,
  });
}

function sourceHasCategory(it, cat) {
  if (!it || !cat) return false;
  const categories = it.extractedCategories || it.categories || [];
  if (categories.length) return categories.includes(cat);
  return String(it.category || '').toLowerCase() === cat;
}

function totalsFromVisibleItems(items, fallback = EMPTY_TOTALS) {
  const totals = { ...EMPTY_TOTALS, needsReview: fallback.needsReview ?? 0 };
  for (const it of items) {
    const cats = it.extractedCategories || it.categories || [];
    if (cats.length) {
      for (const cat of cats) {
        if (Object.prototype.hasOwnProperty.call(totals, cat)) totals[cat] += 1;
      }
    } else {
      const cat = String(it.category || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(totals, cat)) totals[cat] += 1;
    }
  }
  totals.total = items.length;
  return totals;
}

export function loadTranscriptionsIndex() {
  const data = readJson(INDEX_PATH, null);
  if (data && Array.isArray(data.items)) {
    const fileTotals = data.totals || data.counts || { ...EMPTY_TOTALS, total: data.items.length };
    const items = data.items.filter(isVisibleIndexItem);
    const sourceTotals = data.sourceTotals || totalsFromVisibleItems(items, fileTotals);
    const extractionTotals = data.totals || data.counts || fileTotals;
    return {
      ok: true,
      generatedAt: data.generatedAt || null,
      totals: extractionTotals,
      counts: extractionTotals,
      sourceTotals,
      sourceCount: data.sourceCount ?? items.length,
      rawTranscriptionCount: data.rawTranscriptionCount ?? data.rawSources?.total ?? 0,
      rawSources: data.rawSources || {
        total: data.rawTranscriptionCount ?? 0,
        waitingForProcessing: 0,
        pendingSources: [],
      },
      pipeline: data.pipeline || null,
      needsReviewCount: data.needsReviewCount ?? (data.needsReview?.length || 0),
      needsReview: data.needsReview || [],
      items,
      errors: data.errors || [],
    };
  }
  return {
    ok: true,
    generatedAt: null,
    totals: { ...EMPTY_TOTALS },
    counts: { ...EMPTY_TOTALS },
    rawTranscriptionCount: countRawTranscriptions(),
    rawSources: { total: countRawTranscriptions(), waitingForProcessing: 0 },
    pipeline: null,
    needsReviewCount: 0,
    needsReview: [],
    items: [],
    errors: [],
  };
}

function countRawTranscriptions() {
  const dir = path.join(CONTENT_DIR, 'transcriptions');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
}

export function saveTranscriptionsIndex(data) {
  writeJson(INDEX_PATH, data);
}

/** Index ids are 12-char hashes; reject path-like lookup keys. */
export function isOpaqueIndexId(id) {
  const s = String(id || '').trim();
  if (!s || s.length > 64) return false;
  if (s.includes('/') || s.includes('\\') || s.includes('..')) return false;
  return /^[a-f0-9]{8,64}$/i.test(s) || /^[a-z0-9_-]{8,64}$/i.test(s);
}

function sourceEntryChildSnapshots(candidate) {
  const out = [];
  const entries = candidate.sourceEntries;
  if (Array.isArray(entries)) {
    out.push(...entries);
  } else if (entries && typeof entries === 'object') {
    for (const val of Object.values(entries)) {
      if (Array.isArray(val)) out.push(...val);
      else if (val && typeof val === 'object') out.push(val);
    }
  }
  const extractions = candidate.extractions;
  if (extractions && typeof extractions === 'object') {
    for (const val of Object.values(extractions)) {
      if (Array.isArray(val)) out.push(...val);
    }
  }
  return out;
}

function findIndexItemById(index, id) {
  let item = index.items.find((it) => it.id === id);
  if (item) return item;
  for (const candidate of index.items) {
    const grouped = candidate.childIds || candidate.groupedIds || [];
    if (grouped.includes(id)) return candidate;
    for (const child of sourceEntryChildSnapshots(candidate)) {
      if (child && child.id === id) return candidate;
    }
  }
  return null;
}

export function getIndexItem(id) {
  if (!isOpaqueIndexId(id)) return null;
  const index = loadTranscriptionsIndex();
  const item = findIndexItemById(index, id);
  if (!item) return null;
  const rel = item.filepath || item.path;
  const fullPath = rel ? path.join(REPO_ROOT, rel) : '';
  let fullContent = '';
  try {
    if (fs.existsSync(fullPath)) {
      fullContent = fs.readFileSync(fullPath, 'utf8');
    }
  } catch {
    /* ignore */
  }
  let sourceTranscriptionContent = '';
  const srcRel = String(item.sourceTranscription || item.source_transcription || '')
    .replace(/`/g, '')
    .trim();
  if (srcRel && !srcRel.includes('..')) {
    const srcPath = path.join(REPO_ROOT, srcRel);
    try {
      if (fs.existsSync(srcPath)) {
        sourceTranscriptionContent = fs.readFileSync(srcPath, 'utf8');
      }
    } catch {
      /* ignore */
    }
  }
  const related = (item.related_files || [])
    .map((rid) => index.items.find((it) => it.id === rid))
    .filter(Boolean);
  return { ...item, fullContent, sourceTranscriptionContent, related };
}

export function searchIndexItems({ q, category, project, from, to }) {
  const index = loadTranscriptionsIndex();
  let list = index.items.slice();
  const query = (q || '').trim().toLowerCase();

  list = list.filter((it) => !it.source_only);
  if (category && category !== 'all') {
    list = list.filter((it) => sourceHasCategory(it, category));
  }
  if (project) {
    const p = project.trim().toLowerCase();
    list = list.filter((it) => (it.project || '').toLowerCase().includes(p));
  }
  if (from) {
    list = list.filter((it) => !it.date || it.date >= from);
  }
  if (to) {
    list = list.filter((it) => !it.date || it.date <= to);
  }
  if (query) {
    list = list.filter((it) => {
      const blob = [
        it.title,
        it.preview,
        it.filepath,
        it.source_audio,
        it.source_transcription,
        it.project,
        it.date,
        JSON.stringify(it.raw_sections || {}),
        JSON.stringify(it.extracted_items || {}),
        JSON.stringify(it.extractedCategories || []),
        JSON.stringify(it.sourceEntries || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(query);
    });
  }

  return {
    ok: true,
    count: list.length,
    items: list,
    totals: index.totals,
    generatedAt: index.generatedAt,
  };
}

export function markItemReviewed(id) {
  const data = readJson(INDEX_PATH, null);
  if (!data || !Array.isArray(data.items)) {
    return { ok: false, status: 404, error: 'Index not found. Run reindex first.' };
  }
  const item = data.items.find((it) => it.id === id);
  if (!item) {
    return { ok: false, status: 404, error: 'Item not found.' };
  }
  const reviewedAt = new Date().toISOString();
  item.reviewed = true;
  item.reviewed_at = reviewedAt;
  saveTranscriptionsIndex(data);
  return { ok: true, id, reviewed: true, reviewed_at: reviewedAt };
}

export function sanitizeIndexItemForClient(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === 'string') {
      out[key] = out[key]
        .replace(/[A-Za-z]:\\[^\s\n\r`"']+/g, '[path-redacted]')
        .replace(/G:\\My Drive\\Voice Recorder/gi, 'Voice Recorder (local)');
    }
  }
  if (typeof out.fullContent === 'string') {
    out.fullContent = out.fullContent
      .replace(/[A-Za-z]:\\[^\s\n\r`"']+/g, '[path-redacted]')
      .replace(/G:\\My Drive\\Voice Recorder/gi, 'Voice Recorder (local)');
  }
  if (typeof out.sourceTranscriptionContent === 'string') {
    out.sourceTranscriptionContent = out.sourceTranscriptionContent
      .replace(/[A-Za-z]:\\[^\s\n\r`"']+/g, '[path-redacted]')
      .replace(/G:\\My Drive\\Voice Recorder/gi, 'Voice Recorder (local)');
  }
  return out;
}
