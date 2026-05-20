import fs from 'fs';
import path from 'path';
import { REPO_ROOT } from './paths.mjs';

const TOKEN_RE = /[a-z0-9']+/gi;
const TIMESTAMP_RE = /\*\*\[\d{2}:\d{2}(?:\.\d+)?\s*→\s*\d{2}:\d{2}(?:\.\d+)?\]\*\*/g;
const SIMILARITY_FAIL = 0.72;
const MIN_SUMMARY_WORDS = 25;
const MIN_SUMMARY_CHARS = 80;

const INVALID_POINTS = new Set([
  '',
  '-',
  'none',
  '(none)',
  'n/a',
  'no clear task detected',
  'no clear decision detected',
]);

function normalizeCompare(text) {
  return String(text || '')
    .replace(TIMESTAMP_RE, ' ')
    .replace(/<!--[^>]+-->/g, ' ')
    .replace(/[*_`#>[\](){}|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenSet(text) {
  const out = new Set();
  const t = normalizeCompare(text);
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(t)) !== null) {
    if (m[0]) out.add(m[0]);
  }
  return out;
}

function jaccard(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) {
    if (tb.has(w)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function stripProcessedHeader(text) {
  const lines = String(text || '').split('\n');
  if (lines[0] && lines[0].trim().startsWith('<!-- PROCESSED:')) {
    return lines.slice(1).join('\n').trim();
  }
  return text;
}

function extractRawBody(rawText) {
  let text = stripProcessedHeader(rawText);
  const m = text.match(/^##\s+Transcription\s*\n([\s\S]*?)(?=^##\s+|\s*$)/im);
  const body = m ? m[1] : text;
  return normalizeCompare(body.replace(TIMESTAMP_RE, ' '));
}

function parseSections(md) {
  const sections = {};
  const parts = String(md || '').split(/\n(?=##\s+)/);
  for (const part of parts) {
    const m = part.match(/^##\s+([^\n]+)\n([\s\S]*)/);
    if (m) sections[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return sections;
}

function bulletsFrom(sectionText) {
  const out = [];
  for (const line of String(sectionText || '').split('\n')) {
    const m = line.match(/^\s*-\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function validPoint(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || INVALID_POINTS.has(t)) return false;
  if (t.includes('none extracted')) return false;
  return true;
}

function collectKeyPoints(sections) {
  const keys = [
    'top 3 key points',
    'top 3 important points',
    'important points',
  ];
  const points = [];
  for (const k of keys) {
    if (sections[k]) points.push(...bulletsFrom(sections[k]));
  }
  return points.filter(validPoint).slice(0, 5);
}

function collectExtracted(sections) {
  const names = ['tasks', 'decisions', 'open points', 'next steps'];
  const out = [];
  for (const name of names) {
    for (const b of bulletsFrom(sections[name])) {
      if (validPoint(b)) out.push(b);
    }
  }
  return out;
}

function summaryExplainsSparsePoints(summary) {
  const s = String(summary || '').trim().toLowerCase();
  if (!s) return false;
  const markers = [
    'limited content',
    'limited content available',
    'frammenti',
    'rumore',
    'senza tema',
    'non intellegibile',
    'empty transcript',
    'no strong key points',
    'insufficient',
    'sparse',
    'brief note',
    'nota vocale breve',
    'few extractable',
    'not enough',
    'unclear audio',
  ];
  return markers.some((m) => s.includes(m));
}

export function validateAiReadyContent({ rawText, outputText }) {
  const reasons = [];
  const rawBody = extractRawBody(rawText);
  const sections = parseSections(outputText);
  const summary = (sections.summary || sections['clean summary'] || '').trim();
  const summaryNorm = normalizeCompare(summary);
  const keyPoints = collectKeyPoints(sections);
  const extracted = collectExtracted(sections);
  const similarity = summary && rawBody ? jaccard(summary, rawBody) : 0;
  const summaryWords = summaryNorm ? summaryNorm.split(/\s+/).length : 0;

  if (!summaryNorm || summaryNorm.length < MIN_SUMMARY_CHARS) {
    reasons.push('missing or too short summary');
  } else if (summaryWords < MIN_SUMMARY_WORDS) {
    reasons.push(`summary too brief (${summaryWords} words)`);
  }
  if (summaryNorm && rawBody) {
    const prefix = summaryNorm.slice(0, 80);
    if (prefix.length >= 40 && rawBody.includes(prefix)) {
      reasons.push('summary matches raw transcript opening');
    }
    if (similarity >= SIMILARITY_FAIL) {
      reasons.push(`summary too similar to raw (jaccard=${similarity.toFixed(2)})`);
    }
  }
  const titleSection = (sections.title || '').trim();
  if (titleSection && normalizeCompare(titleSection).startsWith('so guys we can start')) {
    reasons.push('title echoes raw transcript opening');
  }
  if (keyPoints.length < 3) {
    if (keyPoints.length >= 2 && summaryExplainsSparsePoints(summary)) {
      /* sparse source — summary explains fewer points */
    } else if (keyPoints.length < 1 && extracted.length < 1) {
      reasons.push('need at least 3 key points or extracted tasks/decisions/open points');
    } else if (keyPoints.length < 3 && extracted.length < 2) {
      reasons.push(`need 3 key points (have ${keyPoints.length}) or more extracted items`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    similarity: Math.round(similarity * 10000) / 10000,
  };
}

export function validateAiReadyPaths(rawRel, outputRel) {
  const rawPath = path.join(REPO_ROOT, rawRel.replace(/\\/g, '/'));
  const outPath = path.join(REPO_ROOT, outputRel.replace(/\\/g, '/'));
  if (!fs.existsSync(rawPath) || !fs.existsSync(outPath)) {
    return { ok: false, reasons: ['missing raw or output file'] };
  }
  return validateAiReadyContent({
    rawText: fs.readFileSync(rawPath, 'utf8'),
    outputText: fs.readFileSync(outPath, 'utf8'),
  });
}
