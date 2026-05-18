/**
 * Extract meaningful numbers from transcription item text for donut / stat visuals.
 * Loaded before admin-transcriptions.js — exposes window.TxContentNumbers.
 *
 * Inline test cases (run: node scripts/test-tx-content-numbers.mjs):
 * - Pattaya chat "6" alone → no segments
 * - Thai Fans metadata times → topic SVG (no stats)
 * - "200€ per affitto scooter" → money stat
 * - "50/50 ownership" → ratio donut (2 slices)
 * - "?q=5,%20View" / "%E0%B8" → ignored
 * - "€ 5" isolated → ignored
 * - 2 comparable same-currency amounts → donut
 */
(function () {
  'use strict';

  var KIND_COLORS = {
    money: '#f59e0b',
    percent: '#8b5cf6',
    quantity: '#3b82f6',
    ratio: '#10b981',
    date: '#64748b',
    time: '#0ea5e9',
    duration: '#ec4899',
    deadline: '#ef4444',
  };

  var DONUT_KINDS = { money: true, percent: true, quantity: true, ratio: true };

  var MAX_DONUT_SLICES = 6;
  var MAX_EXTRACT = 12;
  var MIN_MONEY_DISPLAY = 20;
  var MIN_MEANINGFUL_LABEL_CHARS = 5;

  var LABEL_ELLIPSIS_RE = /…|\.\.\./;
  var LABEL_TRUNCATED_MONEY_RE = /…\d{2,}\s*(?:thb|eur|usd|gbp|baht|€|\$|£)/i;
  var LABEL_BARE_MONEY_RE = /^[\d.,\s]*(?:thb|eur|usd|gbp|baht|€|\$|£)\b/i;
  var LABEL_INCOMPLETE_PAREN_RE = /^[^()]*\)[,;)]|^\)[,;]/;
  var LABEL_CHAT_FRAGMENT_RE =
    /due-tre mesi|tre mesi,\s*mappe|mappe di lo|qualità,\s*marketing\),\s*sauna/i;
  var LABEL_SEMANTIC_WORDS_RE =
    /\b(?:per|affitto|rent|budget|mortgage|mutuo|saldo|stipendio|fee|costo|prezzo|price|prezzi|totale|total|remaining|riman|circa|about|intorno|almeno|least|scooter|onlyfans|sauna|split|ownership|propriet|share|vs\.?|versus)\b/i;

  /** Item keys that must never be scanned as prose. */
  var METADATA_ITEM_KEYS = {
    date: true,
    processedAt: true,
    processed_at: true,
    processedDate: true,
    processed_date: true,
    processing_date: true,
    processingDate: true,
    createdAt: true,
    created_at: true,
    indexedAt: true,
    indexed_at: true,
    aiProcessedAt: true,
    ai_processed_at: true,
    generatedAt: true,
    generated_at: true,
    modifiedAt: true,
    modified_at: true,
    sourceModifiedAt: true,
    source_modified_at: true,
    sourceAudioModifiedAt: true,
    source_audio_modified_at: true,
    audioModifiedAt: true,
    mtimeMs: true,
    fileMtimeMs: true,
    source_checksum: true,
    sourceChecksum: true,
    source_id: true,
    sourceId: true,
    id: true,
    path: true,
    filepath: true,
    readyForSite: true,
    pipelineStatus: true,
    reviewed: true,
    contentNumbers: true,
  };

  var METADATA_LINE_RE =
    /^(?:-\s*\*\*)?(?:Modified|Processed|File size|Source file|Source path|Detected language|Language probability|checksum|processing_date|processed_date|processedAt|createdAt)\b/i;

  var URL_RE = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
  var URL_ENCODED_RE = /%[0-9a-f]{2}/i;
  var QUERY_STRING_RE = /[?&][a-z0-9_]+=[^ \n]*/gi;
  var MAPS_OR_EXPORT_LINK_RE =
    /(?:google\.com\/maps|goo\.gl\/maps|wa\.me\/|whatsapp\.com\/|chat\.whatsapp\.com)/i;

  var TRUNCATED_COMBO_RE = /\d[\d.,]*\s*(?:€|eur|\$|usd)\s*\d{1,2}[./-]\d{1,2}/i;
  var BROKEN_PERCENT_RE = /\d{2,},\s*%|\d{3,}%|%\s*,\s*\d/i;
  var WHATSAPP_TS_LINE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}\s+-/m;
  var DURATION_BRACKET_RE = /\*\*\[\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*→\s*\d{2}:\d{2}/;
  var FILE_TIME_LINE_RE = /(?:Modified|Processed):\s*\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}/i;
  var ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/;

  var DATE_CONTEXT_RE =
    /\b(?:appointment|meeting|riunione|deadline|scadenza|entro|scheduled|confermato|confermare|check-?in|check-?out|due\s+on|il\s+\d|per\s+il|on\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i;
  var TIME_CONTEXT_RE =
    /\b(?:at|alle|ore|h\.|meeting|call|incontro|appuntamento|starts?|inizia|dalle|fino\s+alle)\b/i;
  var MONEY_CONTEXT_RE =
    /\b(?:per|affitto|rent|budget|mortgage|mutuo|saldo|stipendio|fee|costo|prezzo|price|totale|total|remaining|riman|used|speso|spend|baht|thb|eur|usd|gbp|circa|about|almeno|least)\b/i;
  var COMPARISON_CONTEXT_RE =
    /\b(?:vs\.?|versus|remaining|rimanen|used|utilizzat|spent|budget|totale|total|out\s+of|su\s+un\s+totale|split|ownership|proprietà)\b/i;

  var ALLOWED_MD_SECTIONS =
    /^(?:summary|top\s*3\s*key\s*points?|key\s*points?|tasks?|calendar\s*events?|decisions?|open\s*points?|project\s*updates?|next\s*steps?|people\s*involved|title)$/i;

  function parseLocaleNumber(raw) {
    if (raw == null) return NaN;
    var s = String(raw).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/,/g, '.');
    }
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function kindColor(kind, idx) {
    var palette = ['#c9a227', '#6bcb8a', '#7eb8da', '#d4846a', '#a78bfa', '#f472b6'];
    return KIND_COLORS[kind] || palette[idx % palette.length];
  }

  function shortLabel(raw, kind, maxLen) {
    maxLen = maxLen || 18;
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) {
      if (kind === 'money') return 'Amount';
      if (kind === 'percent') return 'Share';
      if (kind === 'ratio') return 'Split';
      if (kind === 'date') return 'Date';
      if (kind === 'time') return 'Time';
      if (kind === 'duration') return 'Duration';
      return 'Value';
    }
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen - 1) + '…';
  }

  function dedupeKey(seg) {
    return seg.kind + '|' + String(seg.raw || '').toLowerCase().replace(/\s+/g, ' ');
  }

  function visualValueKey(seg) {
    var raw = String(seg.raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (seg.kind === 'money') {
      var cur = (raw.match(/(?:€|eur|\$|usd|£|gbp|thb)/) || [''])[0];
      return 'money|' + cur + '|' + String(seg.value);
    }
    if (seg.kind === 'time') return 'time|' + raw.replace(/[^\d:]/g, '');
    if (seg.kind === 'date') return 'date|' + raw.replace(/[^\d./-]/g, '');
    return seg.kind + '|' + raw;
  }

  function normalizeScanText(text) {
    var t = String(text || '');
    t = t.replace(URL_RE, ' ');
    t = t.replace(QUERY_STRING_RE, ' ');
    t = t.replace(/%[0-9A-Fa-f]{2}/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  function isJunkSourceText(text) {
    var t = String(text || '');
    if (!t.trim()) return true;
    if (URL_ENCODED_RE.test(t) && t.length < 120) return true;
    if (MAPS_OR_EXPORT_LINK_RE.test(t)) return true;
    if (TRUNCATED_COMBO_RE.test(t)) return true;
    if (BROKEN_PERCENT_RE.test(t)) return true;
    if (/^\s*See\s+`content\//i.test(t)) return true;
    if (/^content\/(?:transcriptions|ai-ready)/i.test(t.trim())) return true;
    return false;
  }

  function stripYamlFrontmatter(md) {
    var t = String(md || '');
    if (/^---\s*\n/.test(t)) {
      var end = t.indexOf('\n---', 4);
      if (end > 0) t = t.slice(end + 4).replace(/^\s*\n/, '');
    }
    return t;
  }

  function extractMarkdownContentSections(md) {
    var body = stripYamlFrontmatter(md);
    if (!body.trim()) return [];
    var parts = [];
    var sections = body.split(/^##\s+/gm);
    if (sections.length <= 1) return [body.trim()];
    sections.forEach(function (block) {
      if (!block.trim()) return;
      var nl = block.indexOf('\n');
      var heading = (nl >= 0 ? block.slice(0, nl) : block).trim();
      var content = (nl >= 0 ? block.slice(nl + 1) : '').trim();
      if (/^source$/i.test(heading)) return;
      if (/^full\s+transcription\s+reference$/i.test(heading)) {
        if (content && !/^See\s+`/i.test(content)) parts.push(content);
        return;
      }
      if (ALLOWED_MD_SECTIONS.test(heading) && content) parts.push(content);
    });
    return parts.length ? parts : [body.trim()];
  }

  function transcriptionBodyOnly(raw) {
    var t = String(raw || '');
    var m = t.match(/##\s*Transcription\s*\n([\s\S]*?)(?=^##\s|\Z)/im);
    if (m) t = m[1];
    return t
      .split('\n')
      .filter(function (line) {
        var L = line.trim();
        if (!L) return false;
        if (METADATA_LINE_RE.test(L)) return false;
        if (FILE_TIME_LINE_RE.test(L)) return false;
        if (DURATION_BRACKET_RE.test(L)) return false;
        if (/^#+\s/.test(L)) return false;
        if (/^-\s*\*\*/.test(L) && /(?:Source file|Modified|Processed|File size)/i.test(L)) return false;
        return true;
      })
      .join('\n');
  }

  function proseContext(text, start, end, radius) {
    radius = radius || 48;
    return text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius)).replace(/\s+/g, ' ');
  }

  function meaningfulLabelChars(label) {
    return String(label || '')
      .replace(/[\s….,;:!?()[\]{}\-+'"«»`]/g, '')
      .replace(/(?:thb|eur|usd|gbp|baht)/gi, '').length;
  }

  function isValidDisplayLabel(label, seg) {
    var t = String(label || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (LABEL_ELLIPSIS_RE.test(t)) return false;
    if (LABEL_TRUNCATED_MONEY_RE.test(t)) return false;
    if (LABEL_INCOMPLETE_PAREN_RE.test(t)) return false;
    if (LABEL_CHAT_FRAGMENT_RE.test(t)) return false;
    if (/,\s*[a-zàèéìòù]{1,2}$/i.test(t)) return false;
    if (meaningfulLabelChars(t) < MIN_MEANINGFUL_LABEL_CHARS) return false;

    if (seg && seg.kind === 'money') {
      if (LABEL_BARE_MONEY_RE.test(t) && !LABEL_SEMANTIC_WORDS_RE.test(t)) return false;
      var stripped = t.replace(/[\d.,\s]/g, '').replace(/(?:thb|eur|usd|gbp|baht|€|\$|£)/gi, '').trim();
      if (meaningfulLabelChars(stripped) < 3 && !LABEL_SEMANTIC_WORDS_RE.test(t)) return false;
    }

    if (seg && seg.kind === 'deadline') {
      if (/\bdue[\s-]*tre\b/i.test(t) || /\bmappe di\b/i.test(t)) return false;
    }

    return true;
  }

  function filterVisualSegments(segments) {
    if (!segments || !segments.length) return [];
    return segments.filter(function (seg) {
      return isValidDisplayLabel(seg.label, seg);
    });
  }

  function contextLabel(text, start, end, raw, kind) {
    var slice = proseContext(text, start, end, 28);
    slice = slice.trim();
    var segStub = { kind: kind || 'quantity', raw: raw };
    if (slice.length > 36) {
      var tail = slice.slice(-34);
      if (isValidDisplayLabel(tail, segStub)) slice = tail;
      else return shortLabel(raw, kind || 'quantity');
    }
    if (!isValidDisplayLabel(slice, segStub)) return shortLabel(raw, kind || 'quantity');
    return slice || shortLabel(raw, kind || 'quantity');
  }

  function endsTruncated(text, end) {
    var tail = text.slice(end, end + 4);
    return tail.indexOf('…') >= 0 || tail.indexOf('...') === 0;
  }

  function isBareIsoDocumentDate(ctx, raw) {
    if (!ISO_DATE_ONLY_RE.test(String(raw).trim())) return false;
    if (/\b(?:nota\s+vocale|processed|processing|del\s+\d{4}-\d{2}-\d{2}|voice|transcription)\b/i.test(ctx)) {
      return true;
    }
    return !DATE_CONTEXT_RE.test(ctx);
  }

  function isValidSegment(seg, text, start, end) {
    if (!seg || seg.raw == null) return false;
    var raw = String(seg.raw).trim();
    if (!raw) return false;
    var ctx = proseContext(text, start, end, 56);

    if (URL_ENCODED_RE.test(raw) || URL_ENCODED_RE.test(ctx)) return false;
    if (BROKEN_PERCENT_RE.test(raw)) return false;
    if (TRUNCATED_COMBO_RE.test(ctx)) return false;
    if (endsTruncated(text, end) && /(?:€|usd|eur|\$)/i.test(raw)) return false;
    if (WHATSAPP_TS_LINE_RE.test(ctx) && (seg.kind === 'time' || seg.kind === 'date')) return false;
    if (FILE_TIME_LINE_RE.test(ctx)) return false;
    if (DURATION_BRACKET_RE.test(ctx)) return false;
    if (METADATA_LINE_RE.test(ctx)) return false;

    if (seg.kind === 'money') {
      if (seg.value < MIN_MONEY_DISPLAY && !MONEY_CONTEXT_RE.test(ctx)) return false;
      if (/^\s*(?:€|\$|£)\s*\d{1,2}\s*$/i.test(raw)) return false;
      if (!MONEY_CONTEXT_RE.test(ctx) && !/\b\d[\d.,]{2,}\s*(?:€|eur|usd|thb|baht)\b/i.test(ctx)) {
        return false;
      }
    }

    if (seg.kind === 'percent') {
      if (seg.value > 100 && !/\b(?:growth|increase|up)\b/i.test(ctx)) return false;
      if (!/\s%/.test(raw) && !/\bpercent/i.test(raw)) return false;
    }

    if (seg.kind === 'date') {
      if (isBareIsoDocumentDate(ctx, raw)) return false;
      if (!DATE_CONTEXT_RE.test(ctx) && !/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(raw)) {
        if (ISO_DATE_ONLY_RE.test(raw) || ISO_DATETIME_RE.test(raw)) return false;
      }
    }

    if (seg.kind === 'time') {
      var parts = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (parts) {
        var hh = parseInt(parts[1], 10);
        var mm = parseInt(parts[2], 10);
        var ss = parts[3] != null ? parseInt(parts[3], 10) : null;
        if (ss != null && !TIME_CONTEXT_RE.test(ctx)) return false;
        if (hh === 0 && mm === 0) return false;
        if (hh === 0 && mm <= 30 && !TIME_CONTEXT_RE.test(ctx)) return false;
      }
      if (!TIME_CONTEXT_RE.test(ctx)) return false;
    }

    if (seg.kind === 'duration') {
      if (!/\b(?:durata|duration|lasting|lasts|for\s+\d+\s+(?:min|hour|day))/i.test(ctx)) return false;
    }

    return true;
  }

  function pushSegment(out, seen, seg, text, start, end) {
    if (!seg || seg.raw == null || String(seg.raw).trim() === '') return;
    if (!isValidSegment(seg, text, start, end)) return;
    if (!isValidDisplayLabel(seg.label, seg)) return;
    var key = dedupeKey(seg);
    if (seen[key]) return;
    seen[key] = true;
    out.push(seg);
  }

  function scanText(text, out, seen) {
    if (!text || typeof text !== 'string') return;
    if (isJunkSourceText(text)) return;
    var t = normalizeScanText(text);
    if (!t) return;

    var moneyRe =
      /(?:€|\$|£)\s*([\d][\d.,\s]*\d|\d+)|([\d][\d.,\s]*\d|\d+)\s*(?:€|\$|£)|(?:EUR|USD|GBP|THB|Baht)\s*([\d][\d.,\s]*\d|\d+)|([\d][\d.,\s]*\d|\d+)\s*(?:eur|usd|gbp|thb|baht)\b/gi;
    var m;
    while ((m = moneyRe.exec(t)) !== null) {
      var numStr = (m[1] || m[2] || m[3] || m[4] || '').trim();
      var val = parseLocaleNumber(numStr);
      if (!Number.isFinite(val) || val <= 0) continue;
      pushSegment(
        out,
        seen,
        {
          kind: 'money',
          value: val,
          raw: m[0].trim(),
          label: contextLabel(t, m.index, m.index + m[0].length, m[0], 'money'),
          currency: (m[0].match(/(?:€|eur|usd|gbp|thb|baht|\$|£)/i) || [''])[0].toLowerCase(),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var pctRe = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|percent|per cent|pct)\b/gi;
    while ((m = pctRe.exec(t)) !== null) {
      if (m.index > 0 && t[m.index - 1] === ',') continue;
      if (BROKEN_PERCENT_RE.test(m[0])) continue;
      var pv = parseLocaleNumber(m[1]);
      if (!Number.isFinite(pv) || pv < 0 || pv > 100) continue;
      pushSegment(
        out,
        seen,
        {
          kind: 'percent',
          value: pv,
          raw: m[0].trim(),
          label: contextLabel(t, m.index, m.index + m[0].length, m[0], 'percent'),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var ratioRe = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g;
    while ((m = ratioRe.exec(t)) !== null) {
      var a = parseInt(m[1], 10);
      var b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) continue;
      if (a > 100 || b > 100) continue;
      var rawRatio = m[1] + '/' + m[2];
      var ctx = proseContext(t, m.index, m.index + m[0].length, 40);
      if (!/\b(?:split|ownership|propriet|quote|share|divid|50|50)\b/i.test(ctx) && a + b !== 100) {
        if (Math.abs(a / (a + b) - 0.5) > 0.05 && Math.abs(b / (a + b) - 0.5) > 0.05) continue;
      }
      pushSegment(
        out,
        seen,
        {
          kind: 'ratio',
          value: a,
          raw: rawRatio + ' (a)',
          label: rawRatio + ' split',
          ratioPair: rawRatio,
          ratioPart: 0,
        },
        t,
        m.index,
        m.index + m[0].length
      );
      pushSegment(
        out,
        seen,
        {
          kind: 'ratio',
          value: b,
          raw: rawRatio + ' (b)',
          label: rawRatio + ' split',
          ratioPair: rawRatio,
          ratioPart: 1,
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var qtyRe =
      /\b(\d[\d.,]*)\s*(?:people|persons|participants|tasks|items|units|years|months|weeks|days|hours|nights|rooms|guests|persone|partecipanti|anni|mesi|settimane|giorni|ore)\b/gi;
    while ((m = qtyRe.exec(t)) !== null) {
      var qv = parseLocaleNumber(m[1]);
      if (!Number.isFinite(qv) || qv <= 0) continue;
      pushSegment(
        out,
        seen,
        {
          kind: 'quantity',
          value: qv,
          raw: m[0].trim(),
          label: contextLabel(t, m.index, m.index + m[0].length, m[0], 'quantity'),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var durRe =
      /\b(\d+)\s*(?:min(?:ute)?s?|mins?|ore|hours?|hr|h|giorni|days?|settimane|weeks?)\b/gi;
    while ((m = durRe.exec(t)) !== null) {
      var dv = parseInt(m[1], 10);
      if (!Number.isFinite(dv) || dv <= 0) continue;
      pushSegment(
        out,
        seen,
        {
          kind: 'duration',
          value: dv,
          raw: m[0].trim(),
          label: contextLabel(t, m.index, m.index + m[0].length, m[0], 'duration'),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var dateRe =
      /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)\b/gi;
    while ((m = dateRe.exec(t)) !== null) {
      pushSegment(
        out,
        seen,
        {
          kind: 'date',
          value: 1,
          raw: m[0].trim(),
          label: shortLabel(m[0], 'date'),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var timeRe = /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\b/gi;
    while ((m = timeRe.exec(t)) !== null) {
      pushSegment(
        out,
        seen,
        {
          kind: 'time',
          value: 1,
          raw: m[0].trim(),
          label: shortLabel(m[0], 'time'),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }

    var deadlineRe =
      /\b(?:deadline|scadenza|entro(?: il)?|due\s+(?:on|il|per|date|by))\s*[:\-]?\s*([^.;\n]{4,40})/gi;
    while ((m = deadlineRe.exec(t)) !== null) {
      pushSegment(
        out,
        seen,
        {
          kind: 'deadline',
          value: 1,
          raw: m[0].trim(),
          label: shortLabel(m[1] || m[0], 'deadline', 22),
        },
        t,
        m.index,
        m.index + m[0].length
      );
    }
  }

  function entryToText(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry.trim();
    if (typeof entry === 'object') {
      return String(entry.text || entry.title || entry.label || entry.issue || entry.summary || '').trim();
    }
    return String(entry).trim();
  }

  function hasStructuredContent(item) {
    if (!item) return false;
    return !!(
      (item.summary && String(item.summary).trim()) ||
      (Array.isArray(item.importantPoints) && item.importantPoints.length) ||
      (Array.isArray(item.keyPoints) && item.keyPoints.length) ||
      (Array.isArray(item.tasks) && item.tasks.length) ||
      (Array.isArray(item.bullets) && item.bullets.length)
    );
  }

  function collectItemTextParts(item) {
    if (!item || typeof item !== 'object') return [];
    var parts = [item.title, item.summary, item.preview, item.description, item.taskText, item.decisionText, item.issue];
    [
      'bullets',
      'importantPoints',
      'keyPoints',
      'tasks',
      'decisions',
      'openPoints',
      'nextSteps',
      'possibleActions',
      'calendarEvents',
      'blockers',
    ].forEach(function (k) {
      var v = item[k];
      if (Array.isArray(v)) {
        v.forEach(function (e) {
          var t = entryToText(e);
          if (t) parts.push(t);
        });
      } else if (v != null && String(v).trim()) parts.push(v);
    });

    var raw = item.raw_sections || item.rawSections;
    if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (k) {
        if (METADATA_ITEM_KEYS[k]) return;
        var v = raw[k];
        if (v != null && String(v).trim()) parts.push(v);
      });
    }

    if (item.fullContent) {
      extractMarkdownContentSections(item.fullContent).forEach(function (sec) {
        parts.push(sec);
      });
    }

    var ref = item.fullTranscriptionReference || item.full_transcription_reference;
    if (ref && String(ref).trim() && !/^See\s+`content\//i.test(String(ref).trim())) {
      parts.push(ref);
    }

    if (!hasStructuredContent(item)) {
      var src = item.sourceTranscriptionContent || item.source_transcription_content;
      if (src && String(src).trim()) {
        var body = transcriptionBodyOnly(src);
        if (body.trim()) parts.push(body);
      }
    }

    return parts
      .filter(function (p) {
        return p != null && String(p).trim() && !isJunkSourceText(p);
      })
      .map(function (p) {
        return String(p).trim();
      });
  }

  function dedupeVisualValues(segments) {
    var seen = {};
    var out = [];
    segments.forEach(function (seg) {
      var vk = visualValueKey(seg);
      if (seen[vk]) return;
      seen[vk] = true;
      out.push(seg);
    });
    return out;
  }

  function extractContentNumbers(item) {
    if (!item) return [];
    var out = [];
    var seen = {};
    collectItemTextParts(item).forEach(function (chunk) {
      scanText(chunk, out, seen);
    });
    out.sort(function (a, b) {
      var order = { money: 0, percent: 1, ratio: 2, quantity: 3, duration: 4, date: 5, time: 6, deadline: 7 };
      return (order[a.kind] != null ? order[a.kind] : 9) - (order[b.kind] != null ? order[b.kind] : 9);
    });
    return filterVisualSegments(dedupeVisualValues(out)).slice(0, MAX_EXTRACT);
  }

  function isDonutSuitable(seg) {
    return !!(seg && DONUT_KINDS[seg.kind] && Number.isFinite(seg.value) && seg.value > 0);
  }

  function findRatioDonutPair(numbers) {
    var ratios = numbers.filter(function (s) {
      return s.kind === 'ratio' && s.ratioPair;
    });
    if (!ratios.length) return null;
    var pairMap = {};
    ratios.forEach(function (r) {
      if (!pairMap[r.ratioPair]) pairMap[r.ratioPair] = [];
      pairMap[r.ratioPair].push(r);
    });
    var keys = Object.keys(pairMap);
    for (var i = 0; i < keys.length; i++) {
      var parts = pairMap[keys[i]];
      if (parts.length >= 2) {
        return parts.slice(0, 2);
      }
    }
    return null;
  }

  function findComparableMoneyPair(numbers) {
    var money = numbers.filter(function (s) {
      return s.kind === 'money' && s.currency;
    });
    if (money.length < 2) return null;
    var byCur = {};
    money.forEach(function (m) {
      var c = m.currency || 'unknown';
      if (!byCur[c]) byCur[c] = [];
      byCur[c].push(m);
    });
    var curKeys = Object.keys(byCur);
    for (var i = 0; i < curKeys.length; i++) {
      var group = byCur[curKeys[i]];
      if (group.length >= 2) {
        var ctxOk = group.filter(function (g) {
          return COMPARISON_CONTEXT_RE.test(String(g.label || ''));
        });
        if (ctxOk.length >= 2) return ctxOk.slice(0, 2);
        if (group.length === 2) return group;
      }
    }
    return null;
  }

  function findComplementaryPercents(numbers) {
    var pcts = numbers.filter(function (s) {
      return s.kind === 'percent';
    });
    if (pcts.length < 2) return null;
    for (var i = 0; i < pcts.length; i++) {
      for (var j = i + 1; j < pcts.length; j++) {
        var sum = pcts[i].value + pcts[j].value;
        if (sum >= 90 && sum <= 110) return [pcts[i], pcts[j]];
      }
    }
    return null;
  }

  function segmentsToSlices(segs) {
    return segs.map(function (seg, idx) {
      return {
        label: shortLabel(seg.label || seg.raw, seg.kind, 16),
        value: seg.value,
        raw: seg.raw,
        color: kindColor(seg.kind, idx),
        kind: seg.kind,
      };
    });
  }

  function toDonutSegments(numbers) {
    if (!numbers || !numbers.length) return null;

    var ratioPair = findRatioDonutPair(numbers);
    if (ratioPair && ratioPair.length >= 2) {
      return segmentsToSlices(ratioPair).slice(0, MAX_DONUT_SLICES);
    }

    var moneyPair = findComparableMoneyPair(numbers);
    if (moneyPair && moneyPair.length >= 2) {
      return segmentsToSlices(moneyPair).slice(0, MAX_DONUT_SLICES);
    }

    var pctPair = findComplementaryPercents(numbers);
    if (pctPair && pctPair.length >= 2) {
      return segmentsToSlices(pctPair).slice(0, MAX_DONUT_SLICES);
    }

    return null;
  }

  function donutCenterLabel(segments) {
    if (!segments || segments.length < 2) return '';
    var money = segments.filter(function (s) {
      return s.kind === 'money';
    });
    if (money.length === 1 && money[0].raw) {
      var r = String(money[0].raw);
      return r.length > 8 ? r.slice(0, 7) + '…' : r;
    }
    if (money.length === 2) {
      return money[0].raw + ' / ' + money[1].raw;
    }
    var ratio = segments.filter(function (s) {
      return s.kind === 'ratio';
    });
    if (ratio.length >= 2 && ratio[0].label) {
      return String(ratio[0].label).replace(/\s*\(a\)$/i, '');
    }
    return '';
  }

  window.TxContentNumbers = {
    extractContentNumbers: extractContentNumbers,
    toDonutSegments: toDonutSegments,
    isDonutSuitable: isDonutSuitable,
    donutCenterLabel: donutCenterLabel,
    kindColor: kindColor,
    DONUT_KINDS: DONUT_KINDS,
    collectItemTextParts: collectItemTextParts,
    dedupeVisualValues: dedupeVisualValues,
    filterVisualSegments: filterVisualSegments,
    isValidDisplayLabel: isValidDisplayLabel,
  };
})();
