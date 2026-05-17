/**
 * Extract meaningful numbers from transcription item text for donut / stat visuals.
 * Loaded before admin-transcriptions.js — exposes window.TxContentNumbers.
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

  function pushSegment(out, seen, seg) {
    if (!seg || seg.raw == null || String(seg.raw).trim() === '') return;
    var key = dedupeKey(seg);
    if (seen[key]) return;
    seen[key] = true;
    out.push(seg);
  }

  function contextLabel(text, start, end, raw) {
    var slice = text.slice(Math.max(0, start - 28), Math.min(text.length, end + 28));
    slice = slice.replace(/\s+/g, ' ').trim();
    if (slice.length > 36) slice = '…' + slice.slice(-34);
    return slice || shortLabel(raw, 'quantity');
  }

  function scanText(text, out, seen) {
    if (!text || typeof text !== 'string') return;
    var t = text;

    var moneyRe =
      /(?:€|\$|£|EUR|USD|GBP)\s*([\d][\d.,\s]*\d|\d+)|([\d][\d.,\s]*\d|\d+)\s*(?:€|\$|£|eur|usd|gbp)\b/gi;
    var m;
    while ((m = moneyRe.exec(t)) !== null) {
      var numStr = (m[1] || m[2] || '').trim();
      var val = parseLocaleNumber(numStr);
      if (!Number.isFinite(val) || val <= 0) continue;
      pushSegment(out, seen, {
        kind: 'money',
        value: val,
        raw: m[0].trim(),
        label: contextLabel(t, m.index, m.index + m[0].length, m[0]),
      });
    }

    var pctRe = /([\d][\d.,]*)\s*(?:%|percent|per cent|pct)\b/gi;
    while ((m = pctRe.exec(t)) !== null) {
      var pv = parseLocaleNumber(m[1]);
      if (!Number.isFinite(pv)) continue;
      pushSegment(out, seen, {
        kind: 'percent',
        value: pv,
        raw: m[0].trim(),
        label: contextLabel(t, m.index, m.index + m[0].length, m[0]),
      });
    }

    var ratioRe = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g;
    while ((m = ratioRe.exec(t)) !== null) {
      var a = parseInt(m[1], 10);
      var b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) continue;
      var rawRatio = m[1] + '/' + m[2];
      pushSegment(out, seen, {
        kind: 'ratio',
        value: a,
        raw: rawRatio + ' (a)',
        label: rawRatio + ' split',
        ratioPair: rawRatio,
        ratioPart: 0,
      });
      pushSegment(out, seen, {
        kind: 'ratio',
        value: b,
        raw: rawRatio + ' (b)',
        label: rawRatio + ' split',
        ratioPair: rawRatio,
        ratioPart: 1,
      });
    }

    var qtyRe =
      /\b(\d[\d.,]*)\s*(?:people|persons|participants|tasks|items|units|years|months|weeks|days|hours|nights|rooms|guests|persone|partecipanti|anni|mesi|settimane|giorni|ore)\b/gi;
    while ((m = qtyRe.exec(t)) !== null) {
      var qv = parseLocaleNumber(m[1]);
      if (!Number.isFinite(qv) || qv <= 0) continue;
      pushSegment(out, seen, {
        kind: 'quantity',
        value: qv,
        raw: m[0].trim(),
        label: contextLabel(t, m.index, m.index + m[0].length, m[0]),
      });
    }

    var durRe =
      /\b(\d+)\s*(?:min(?:ute)?s?|mins?|ore|hours?|hr|h|giorni|days?|settimane|weeks?)\b/gi;
    while ((m = durRe.exec(t)) !== null) {
      var dv = parseInt(m[1], 10);
      if (!Number.isFinite(dv) || dv <= 0) continue;
      pushSegment(out, seen, {
        kind: 'duration',
        value: dv,
        raw: m[0].trim(),
        label: contextLabel(t, m.index, m.index + m[0].length, m[0]),
      });
    }

    var dateRe =
      /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)\b/gi;
    while ((m = dateRe.exec(t)) !== null) {
      pushSegment(out, seen, {
        kind: 'date',
        value: 1,
        raw: m[0].trim(),
        label: shortLabel(m[0], 'date'),
      });
    }

    var timeRe = /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\b/gi;
    while ((m = timeRe.exec(t)) !== null) {
      pushSegment(out, seen, {
        kind: 'time',
        value: 1,
        raw: m[0].trim(),
        label: shortLabel(m[0], 'time'),
      });
    }

    var deadlineRe = /\b(?:deadline|scadenza|due|entro(?: il)?)\s*[:\-]?\s*([^.;\n]{4,40})/gi;
    while ((m = deadlineRe.exec(t)) !== null) {
      pushSegment(out, seen, {
        kind: 'deadline',
        value: 1,
        raw: m[0].trim(),
        label: shortLabel(m[1] || m[0], 'deadline', 22),
      });
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

  function collectItemTextParts(item) {
    if (!item || typeof item !== 'object') return [];
    var parts = [
      item.title,
      item.summary,
      item.preview,
      item.description,
      item.taskText,
      item.decisionText,
      item.issue,
      item.fullContent,
      item.fullTranscriptionReference,
      item.full_transcription_reference,
      item.sourceTranscriptionContent,
      item.source_transcription_content,
    ];
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
        var v = raw[k];
        if (v != null && String(v).trim()) parts.push(v);
      });
    }
    return parts.filter(function (p) {
      return p != null && String(p).trim();
    });
  }

  function extractContentNumbers(item) {
    if (!item) return [];
    if (Array.isArray(item.contentNumbers) && item.contentNumbers.length) {
      return item.contentNumbers.slice(0, MAX_EXTRACT);
    }
    var out = [];
    var seen = {};
    collectItemTextParts(item).forEach(function (chunk) {
      scanText(String(chunk), out, seen);
    });
    out.sort(function (a, b) {
      var order = { money: 0, percent: 1, ratio: 2, quantity: 3, duration: 4, date: 5, time: 6, deadline: 7 };
      return (order[a.kind] != null ? order[a.kind] : 9) - (order[b.kind] != null ? order[b.kind] : 9);
    });
    return out.slice(0, MAX_EXTRACT);
  }

  function isDonutSuitable(seg) {
    return !!(seg && DONUT_KINDS[seg.kind] && Number.isFinite(seg.value) && seg.value > 0);
  }

  function toDonutSegments(numbers) {
    if (!numbers || !numbers.length) return null;
    var suitable = numbers.filter(isDonutSuitable);
    if (suitable.length < 2) return null;
    var ratioSeen = {};
    var slices = [];
    suitable.forEach(function (seg, idx) {
      if (seg.kind === 'ratio' && seg.ratioPair != null) {
        var partKey = seg.ratioPair + ':' + String(seg.ratioPart != null ? seg.ratioPart : seg.value);
        if (ratioSeen[partKey]) return;
        ratioSeen[partKey] = true;
      }
      slices.push({
        label: shortLabel(seg.label || seg.raw, seg.kind, 16),
        value: seg.value,
        raw: seg.raw,
        color: kindColor(seg.kind, idx),
        kind: seg.kind,
      });
    });
    if (slices.length < 2) return null;
    return slices.slice(0, MAX_DONUT_SLICES);
  }

  function donutCenterLabel(segments) {
    if (!segments || !segments.length) return '';
    var money = segments.filter(function (s) {
      return s.kind === 'money';
    });
    if (money.length === 1 && money[0].raw) {
      var r = String(money[0].raw);
      return r.length > 8 ? r.slice(0, 7) + '…' : r;
    }
    return String(segments.length);
  }

  window.TxContentNumbers = {
    extractContentNumbers: extractContentNumbers,
    toDonutSegments: toDonutSegments,
    isDonutSuitable: isDonutSuitable,
    donutCenterLabel: donutCenterLabel,
    kindColor: kindColor,
    DONUT_KINDS: DONUT_KINDS,
  };
})();
