import fs from 'fs';
import path from 'path';
import {
  CONTENT_DIR,
  INDEX_PATH,
  PROCESSED_DIR,
  REPO_ROOT,
  SYNC_SETTINGS_PATH,
} from './paths.mjs';
import { validateAiReadyPaths } from './validate-ai-ready.mjs';

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

const REGISTRY_PATH = path.join(PROCESSED_DIR, 'processed_files.json');
const TRANSCRIPTIONS_DIR = path.join(CONTENT_DIR, 'transcriptions');

const STATUS_READY = 'ready_for_site';
const PENDING_STATUSES = new Set([
  'detected',
  'raw_created',
  'ai_processing_pending',
  'ai_processing_running',
  'failed',
  'needs_review',
]);

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
  if (it.readyForSite === false || it.needs_review) return false;
  const st = it.pipelineStatus;
  if (st && st !== 'ai_processed' && st !== 'ready_for_site') return false;
  const underOutput =
    rel.startsWith(AI_READY_PREFIX) ||
    LEGACY_OUTPUT_PREFIXES.some((p) => rel.startsWith(p));
  if (!underOutput) return false;
  const src = String(it.source_transcription || it.sourceTranscription || '').trim();
  if (src && !src.includes('..')) {
    try {
      const check = validateAiReadyPaths(src, rel);
      if (!check.ok) return false;
    } catch {
      return false;
    }
  }
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

const PRIMARY_CATEGORY_ALIASES = {
  meeting: 'meetings',
  meetings: 'meetings',
  note: 'notes',
  notes: 'notes',
  'voice-note': 'notes',
  conversation: 'notes',
  task: 'tasks',
  tasks: 'tasks',
  calendar: 'calendar',
  project: 'projects',
  projects: 'projects',
  decision: 'decisions',
  decisions: 'decisions',
  'open-point': 'open-points',
  'open-points': 'open-points',
};

export function normalizePrimaryCategory(value, fallback = 'notes') {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (PRIMARY_CATEGORY_ALIASES[raw]) return PRIMARY_CATEGORY_ALIASES[raw];
  const fb = String(fallback || 'notes').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(EMPTY_TOTALS, fb)) return fb;
  return PRIMARY_CATEGORY_ALIASES[fb] || 'notes';
}

export function itemPrimaryCategory(it) {
  if (!it) return 'notes';
  return normalizePrimaryCategory(
    it.primaryCategory || it.mainCategory || it.category,
    'notes',
  );
}

function sourceHasCategory(it, cat) {
  if (!it || !cat) return false;
  return itemPrimaryCategory(it) === cat;
}

function extractionTotalsFromItems(items, fallback = EMPTY_TOTALS) {
  const totals = { ...EMPTY_TOTALS, needsReview: fallback.needsReview ?? 0 };
  for (const it of items) {
    const stats = it.stats || {};
    totals.tasks += Number(stats.tasks_count) || 0;
    totals.calendar += Number(stats.calendar_events_count) || 0;
    totals.decisions += Number(stats.decisions_count) || 0;
    totals['open-points'] += Number(stats.open_points_count) || 0;
    const updates = (it.extracted_items || {}).project_updates;
    if (Array.isArray(updates)) totals.projects += updates.length;
  }
  totals.total =
    totals.tasks + totals.calendar + totals.decisions + totals['open-points'] + totals.projects;
  return totals;
}

function sourceTotalsFromItems(items, fallback = EMPTY_TOTALS) {
  const totals = { ...EMPTY_TOTALS, needsReview: fallback.needsReview ?? 0 };
  for (const it of items) {
    const cat = itemPrimaryCategory(it);
    if (Object.prototype.hasOwnProperty.call(totals, cat)) totals[cat] += 1;
  }
  totals.total = items.length;
  return totals;
}

export function loadTranscriptionsIndex() {
  const data = readJson(INDEX_PATH, null);
  if (data && Array.isArray(data.items)) {
    const fileTotals = data.totals || data.counts || { ...EMPTY_TOTALS, total: data.items.length };
    const items = data.items.filter(isVisibleIndexItem);
    const sourceTotals = data.sourceTotals || sourceTotalsFromItems(items, fileTotals);
    const extractionTotals = data.totals || data.counts || fileTotals;
    const rawCounts = refreshRawSourceCounts(
      data.rawSources,
      data.rawTranscriptionCount ?? data.rawSources?.total ?? 0,
    );
    return {
      ok: true,
      generatedAt: data.generatedAt || null,
      totals: extractionTotals,
      counts: extractionTotals,
      sourceTotals,
      sourceCount: data.sourceCount ?? items.length,
      rawTranscriptionCount: rawCounts.rawTranscriptionCount,
      rawSources: rawCounts.rawSources,
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

function listRawTranscriptionFiles() {
  if (!fs.existsSync(TRANSCRIPTIONS_DIR)) return [];
  return fs
    .readdirSync(TRANSCRIPTIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => {
      try {
        return (
          fs.statSync(path.join(TRANSCRIPTIONS_DIR, b)).mtimeMs -
          fs.statSync(path.join(TRANSCRIPTIONS_DIR, a)).mtimeMs
        );
      } catch {
        return b.localeCompare(a);
      }
    });
}

function countRawTranscriptions() {
  return listRawTranscriptionFiles().length;
}

function normalizeRawRel(rawRel) {
  const s = String(rawRel || '')
    .replace(/\\/g, '/')
    .trim();
  if (!s) return '';
  const idx = s.toLowerCase().indexOf('content/transcriptions/');
  if (idx >= 0) return s.slice(idx);
  if (!s.startsWith('content/')) return `content/transcriptions/${path.posix.basename(s)}`;
  return s;
}

function loadVoiceRegistry() {
  const data = readJson(REGISTRY_PATH, null);
  if (!data || typeof data !== 'object') return { processed: {}, version: 2 };
  if (!data.processed || typeof data.processed !== 'object') data.processed = {};
  return data;
}

function groupedOutputPath(raw) {
  const rel = raw?.groupedOutputPath;
  return rel && String(rel).startsWith('content/ai-ready-transcriptions/') ? String(rel) : null;
}

function groupedOutputExists(raw) {
  const rel = groupedOutputPath(raw);
  return Boolean(rel && fs.existsSync(path.join(REPO_ROOT, rel)));
}

function primaryOutputExists(entry) {
  if (groupedOutputExists(entry)) return true;
  const outputs = entry?.aiOutputs || {};
  const rel = outputs.meeting || outputs.note;
  return Boolean(rel && fs.existsSync(path.join(REPO_ROOT, rel)));
}

function isReadyForSite(entry) {
  if (
    !Boolean(entry?.readyForSite) ||
    entry?.status !== STATUS_READY ||
    !primaryOutputExists(entry)
  ) {
    return false;
  }
  const rawRel = entry?.rawTranscriptionPath;
  const outRel = groupedOutputPath(entry) || entry?.aiOutputs?.meeting || entry?.aiOutputs?.note;
  if (rawRel && outRel) {
    try {
      const check = validateAiReadyPaths(rawRel, outRel);
      return check.ok;
    } catch {
      return false;
    }
  }
  return false;
}

function normalizeRegistryEntry(key, raw) {
  const fullPath = raw?.full_path || raw?.sourceAudioPath || key;
  let rawMd = raw?.rawTranscriptionPath || raw?.output_markdown || '';
  if (rawMd && !String(rawMd).startsWith('content/')) {
    rawMd = `content/transcriptions/${path.basename(String(rawMd))}`;
  }
  let status = raw?.status;
  if (!status) {
    if (raw?.readyForSite) status = STATUS_READY;
    else if (raw?.pipeline_classified || raw?.aiProcessedAt) status = 'ai_processed';
    else if (rawMd) status = 'ai_processing_pending';
    else status = 'detected';
  }
  let ready = Boolean(raw?.readyForSite) && status === STATUS_READY;
  if (ready && !primaryOutputExists({ ...raw, aiOutputs: raw?.aiOutputs, groupedOutputPath: raw?.groupedOutputPath })) {
    ready = false;
    status = primaryOutputExists(raw) ? 'ai_processed' : 'ai_processing_pending';
  }
  return {
    id: raw?.id || path.basename(String(fullPath)),
    sourceAudio: raw?.sourceAudio || raw?.file_name || path.basename(String(fullPath)),
    sourceAudioPath: fullPath,
    rawTranscriptionPath: rawMd,
    groupedOutputPath: groupedOutputPath(raw),
    aiOutputs: raw?.aiOutputs || {},
    rawCreatedAt: raw?.rawCreatedAt || raw?.processed_datetime || null,
    aiProcessedAt: raw?.aiProcessedAt || raw?.pipeline_classified_datetime || null,
    status,
    readyForSite: ready,
    error: raw?.error ?? null,
  };
}

function findEntryByRawPath(registry, rawRel) {
  const target = normalizeRawRel(rawRel).toLowerCase();
  if (!target) return null;
  for (const [key, val] of Object.entries(registry.processed || {})) {
    const entry = normalizeRegistryEntry(key, val);
    if (normalizeRawRel(entry.rawTranscriptionPath).toLowerCase() === target) {
      return entry;
    }
  }
  return null;
}

function rawSourceAllowedForSite(rawRel, registry) {
  const entry = findEntryByRawPath(registry, rawRel);
  return entry ? isReadyForSite(entry) : false;
}

function listPendingSources(registry) {
  const out = [];
  const seenRaw = new Set();
  for (const [key, val] of Object.entries(registry.processed || {})) {
    let entry = normalizeRegistryEntry(key, val);
    const rawRel = normalizeRawRel(entry.rawTranscriptionPath);
    if (rawRel) {
      if (seenRaw.has(rawRel)) continue;
      const canonical = findEntryByRawPath(registry, rawRel);
      if (canonical) entry = canonical;
      seenRaw.add(rawRel);
    }
    if (isReadyForSite(entry)) continue;
    if (PENDING_STATUSES.has(entry.status) || !entry.aiProcessedAt) {
      out.push(entry);
    }
  }
  return out.sort((a, b) => {
    const ta = String(a.rawCreatedAt || a.rawTranscriptionPath || '');
    const tb = String(b.rawCreatedAt || b.rawTranscriptionPath || '');
    return tb.localeCompare(ta);
  });
}

function collectPendingWithOrphans(registry) {
  const pending = listPendingSources(registry);
  const knownRaw = new Set(
    pending.map((p) => p.rawTranscriptionPath).filter(Boolean),
  );
  for (const val of Object.values(registry.processed || {})) {
    const entry = normalizeRegistryEntry('', val);
    if (entry.rawTranscriptionPath) knownRaw.add(entry.rawTranscriptionPath);
  }
  for (const name of listRawTranscriptionFiles()) {
    const rel = `content/transcriptions/${name}`;
    if (knownRaw.has(rel)) continue;
    pending.push({
      id: rel,
      rawTranscriptionPath: rel,
      sourceAudio: null,
      status: 'raw_created',
      readyForSite: false,
      error: null,
    });
  }
  return pending.sort((a, b) => {
    const ta = String(a.rawCreatedAt || a.rawTranscriptionPath || '');
    const tb = String(b.rawCreatedAt || b.rawTranscriptionPath || '');
    return tb.localeCompare(ta);
  });
}

/** Live raw/pending counts from disk + registry (matches voice-recorder transcription total). */
function refreshRawSourceCounts(rawSources, rawTranscriptionCount) {
  const registry = loadVoiceRegistry();
  const mdFiles = listRawTranscriptionFiles();
  const diskTotal = mdFiles.length;
  const pending = collectPendingWithOrphans(registry);
  const waiting = mdFiles.filter(
    (name) => !rawSourceAllowedForSite(`content/transcriptions/${name}`, registry),
  ).length;
  const rs =
    rawSources && typeof rawSources === 'object'
      ? { ...rawSources }
      : { waitingForProcessing: 0, pendingSources: [] };
  const fileTotal = Number(rs.total);
  const indexTotal = Number(rawTranscriptionCount);
  const total = diskTotal || fileTotal || indexTotal || 0;
  rs.total = total;
  rs.waitingForProcessing = waiting;
  rs.pendingSources = pending;
  if (mdFiles.length) rs.latestRawFile = mdFiles[0];
  let latestProcessed = rs.latestProcessedFile || null;
  let latestProcDt = '';
  for (const val of Object.values(registry.processed || {})) {
    const entry = normalizeRegistryEntry('', val);
    if (!entry.readyForSite) continue;
    const dt = String(entry.aiProcessedAt || '');
    if (dt > latestProcDt) {
      latestProcDt = dt;
      const rawP = entry.rawTranscriptionPath || '';
      latestProcessed = rawP ? rawP.split('/').pop() : latestProcessed;
    }
  }
  if (latestProcessed) rs.latestProcessedFile = latestProcessed;
  return { rawSources: rs, rawTranscriptionCount: total };
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
    counts: index.counts,
    sourceTotals: index.sourceTotals,
    sourceCount: index.sourceCount,
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
