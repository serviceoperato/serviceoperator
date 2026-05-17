/**
 * Multi-color topic & category SVG visuals for /admin/transcriptions.
 * Loaded before admin-transcriptions.js — exposes window.TxTopicVisuals.
 */
(function () {
  'use strict';

  var CATEGORY_KEYS = {
    meetings: 'cat-meetings',
    notes: 'cat-notes',
    tasks: 'cat-tasks',
    calendar: 'cat-calendar',
    projects: 'cat-projects',
    decisions: 'cat-decisions',
    'open-points': 'cat-open',
  };

  var TOPIC_RULES = [
    {
      key: 'topic-house',
      label: 'Property & home',
      keywords: [
        'house',
        'property',
        'mortgage',
        'casa',
        'mutuo',
        'immobile',
        'affitto',
        'rent',
        'lease',
        'condominio',
        'ristruttur',
      ],
    },
    {
      key: 'topic-family',
      label: 'Family & inheritance',
      keywords: [
        'family',
        'parents',
        'inheritance',
        'famiglia',
        'eredità',
        'eredita',
        'figli',
        'children',
        'mother',
        'father',
        'genitori',
        'matrimonio',
        'wedding',
      ],
    },
    {
      key: 'topic-health',
      label: 'Health & medical',
      keywords: [
        'health',
        'medical',
        'trattamento',
        'condropatia',
        'condominio patolog',
        'doctor',
        'medico',
        'ospedale',
        'hospital',
        'therapy',
        'terapia',
        'clinic',
        'clinica',
      ],
    },
    {
      key: 'topic-finance',
      label: 'Finance & investing',
      keywords: [
        'finance',
        'bitcoin',
        'money',
        'soldi',
        'investimento',
        'investment',
        'bank',
        'banca',
        'budget',
        'crypto',
        'stock',
        'azioni',
        'loan',
        'prestito',
      ],
    },
    {
      key: 'topic-education',
      label: 'Education & kids',
      keywords: [
        'school',
        'kids',
        'youtube',
        'scuola',
        'student',
        'studente',
        'homework',
        'compiti',
        'university',
        'università',
        'lesson',
        'lezione',
        'teacher',
      ],
    },
    {
      key: 'topic-leisure',
      label: 'Leisure & outings',
      keywords: [
        'water park',
        'leisure',
        'appuntamento',
        'vacation',
        'vacanza',
        'trip',
        'viaggio',
        'pool',
        'piscina',
        'beach',
        'spiaggia',
        'restaurant',
        'cena',
        'weekend',
      ],
    },
    {
      key: 'topic-politics',
      label: 'Politics & civic',
      keywords: [
        'politics',
        'parlamento',
        'congresso',
        'election',
        'elezioni',
        'government',
        'governo',
        'senate',
        'senato',
        'policy',
        'legge',
        'law',
        'vote',
      ],
    },
    {
      key: 'topic-media',
      label: 'Video & content',
      keywords: ['video', 'youtube', 'podcast', 'camera', 'stream', 'content', 'publish', 'timeline', 'edit'],
    },
    {
      key: 'topic-travel',
      label: 'Travel',
      keywords: ['travel', 'viaggio', 'flight', 'hotel', 'vacation', 'beach', 'map', 'trip', 'airport'],
    },
    {
      key: 'topic-legal',
      label: 'Legal',
      keywords: ['legal', 'contract', 'contratto', 'lawyer', 'avvocato', 'signature', 'firma', 'court', 'notary'],
    },
    {
      key: 'topic-work',
      label: 'Work & projects',
      keywords: ['project', 'progetto', 'sprint', 'roadmap', 'milestone', 'client', 'laptop', 'office', 'deliverable'],
    },
  ];

  var VISUAL_LABELS = {
    'cat-meetings': 'Meetings',
    'cat-notes': 'Notes',
    'cat-tasks': 'Tasks',
    'cat-calendar': 'Calendar',
    'cat-projects': 'Projects',
    'cat-decisions': 'Decisions',
    'cat-open': 'Open points',
  };

  TOPIC_RULES.forEach(function (r) {
    VISUAL_LABELS[r.key] = r.label;
  });

  /** Inline SVG bodies (viewBox 0 0 80 80), 3–5 fills each. */
  var SVG_INNER = {
    'cat-meetings':
      '<defs><linearGradient id="tm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs>' +
      '<circle cx="28" cy="30" r="11" fill="#fbbf24"/><circle cx="52" cy="30" r="11" fill="#34d399"/>' +
      '<path d="M14 58c4-10 14-14 26-14s22 4 26 14" fill="url(#tm-g)" opacity="0.9"/>' +
      '<path d="M32 42h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="40" cy="44" rx="10" ry="4" fill="#a78bfa" opacity="0.85"/>',
    'cat-notes':
      '<rect x="18" y="12" width="40" height="52" rx="6" fill="#eef2ff" stroke="#6366f1" stroke-width="2"/>' +
      '<path d="M26 28h28M26 38h22M26 48h18" stroke="#818cf8" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M48 12v14h14" fill="#c7d2fe" stroke="#4f46e5" stroke-width="2"/>' +
      '<path d="M54 58l8 10" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="58" cy="62" r="4" fill="#fbbf24"/>',
    'cat-tasks':
      '<rect x="16" y="14" width="48" height="52" rx="8" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/>' +
      '<path d="M26 30l6 6 14-14" stroke="#059669" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M26 46h22M26 56h16" stroke="#6ee7b7" stroke-width="2.5" stroke-linecap="round"/>' +
      '<circle cx="58" cy="24" r="8" fill="#f59e0b"/><path d="M55 24l2 2 5-6" stroke="#fff" stroke-width="2" fill="none"/>',
    'cat-calendar':
      '<rect x="14" y="18" width="52" height="46" rx="8" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="2"/>' +
      '<path d="M14 30h52" stroke="#a78bfa" stroke-width="2"/>' +
      '<rect x="22" y="10" width="8" height="14" rx="3" fill="#c4b5fd"/><rect x="50" y="10" width="8" height="14" rx="3" fill="#c4b5fd"/>' +
      '<circle cx="30" cy="42" r="5" fill="#8b5cf6"/><circle cx="40" cy="42" r="5" fill="#ec4899"/><circle cx="50" cy="52" r="5" fill="#f59e0b"/>' +
      '<circle cx="58" cy="58" r="14" fill="#ddd6fe" stroke="#7c3aed" stroke-width="2"/>' +
      '<path d="M58 52v8l5 3" stroke="#5b21b6" stroke-width="2.5" stroke-linecap="round"/>',
    'cat-projects':
      '<rect x="12" y="48" width="56" height="8" rx="3" fill="#fde68a"/>' +
      '<rect x="18" y="38" width="20" height="10" rx="2" fill="#f59e0b"/>' +
      '<rect x="42" y="28" width="22" height="10" rx="2" fill="#fb923c"/>' +
      '<path d="M20 43l22-18 18 10" stroke="#ea580c" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="20" cy="43" r="5" fill="#2563eb"/><circle cx="42" cy="25" r="5" fill="#10b981"/><circle cx="60" cy="35" r="5" fill="#8b5cf6"/>' +
      '<path d="M14 22h12v10H14z" fill="#93c5fd" rx="2"/>',
    'cat-decisions':
      '<path d="M40 14v42" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M18 28h44M18 50h44" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="40" cy="14" r="10" fill="#f87171"/><path d="M36 14h8M40 10v8" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="18" cy="28" r="8" fill="#10b981"/><circle cx="62" cy="50" r="8" fill="#f59e0b"/>' +
      '<path d="M32 58l8 8 16-20" stroke="#2563eb" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    'cat-open':
      '<circle cx="36" cy="36" r="22" fill="#fef9c3" stroke="#eab308" stroke-width="3"/>' +
      '<path d="M36 26v2M36 44c0-4 8-4 8 0s-8 4-8 8" stroke="#ca8a04" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<circle cx="58" cy="58" r="16" fill="#e0e7ff" stroke="#4f46e5" stroke-width="2.5"/>' +
      '<path d="M54 56l4 4" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>' +
      '<ellipse cx="58" cy="58" rx="9" ry="6" fill="none" stroke="#4338ca" stroke-width="2.5"/>' +
      '<path d="M64 64l10 10" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round"/>',
    'topic-house':
      '<path d="M16 38l24-22 24 22v28H16z" fill="#fcd34d" stroke="#d97706" stroke-width="2"/>' +
      '<rect x="30" y="44" width="12" height="22" rx="1" fill="#92400e"/>' +
      '<rect x="22" y="32" width="10" height="8" rx="1" fill="#7dd3fc" stroke="#0284c7"/>' +
      '<rect x="48" y="32" width="10" height="8" rx="1" fill="#7dd3fc" stroke="#0284c7"/>' +
      '<path d="M40 16l-6 8h12z" fill="#ef4444"/>',
    'topic-family':
      '<circle cx="28" cy="28" r="9" fill="#f9a8d4"/><circle cx="52" cy="28" r="9" fill="#93c5fd"/>' +
      '<circle cx="40" cy="48" r="8" fill="#fde68a"/>' +
      '<path d="M18 62c6-12 18-16 22-16s16 4 22 16" fill="#c4b5fd" opacity="0.9"/>' +
      '<path d="M34 38h12" stroke="#ec4899" stroke-width="2" stroke-linecap="round"/>',
    'topic-health':
      '<rect x="22" y="18" width="36" height="44" rx="10" fill="#fee2e2" stroke="#ef4444" stroke-width="2"/>' +
      '<path d="M40 28v24M28 40h24" stroke="#dc2626" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="58" cy="24" r="10" fill="#34d399"/><path d="M54 24l3 3 7-8" stroke="#fff" stroke-width="2" fill="none"/>' +
      '<ellipse cx="40" cy="62" rx="18" ry="6" fill="#fda4af" opacity="0.5"/>',
    'topic-finance':
      '<circle cx="40" cy="40" r="24" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>' +
      '<text x="40" y="48" text-anchor="middle" font-size="22" font-weight="700" fill="#b45309">$</text>' +
      '<circle cx="58" cy="22" r="12" fill="#f97316"/><text x="58" y="27" text-anchor="middle" font-size="14" fill="#fff">₿</text>' +
      '<rect x="14" y="52" width="18" height="12" rx="3" fill="#10b981" opacity="0.85"/>',
    'topic-education':
      '<path d="M12 34l28-14 28 14-28 14z" fill="#60a5fa" stroke="#2563eb" stroke-width="2"/>' +
      '<path d="M24 42v16l16 8 16-8V42" fill="#93c5fd" stroke="#3b82f6"/>' +
      '<rect x="52" y="20" width="20" height="14" rx="4" fill="#ef4444"/>' +
      '<path d="M56 26l6 4v6" fill="#fff" opacity="0.9"/>',
    'topic-leisure':
      '<path d="M14 56c8-28 52-28 52 0z" fill="#38bdf8" opacity="0.85"/>' +
      '<path d="M20 56h40" stroke="#0ea5e9" stroke-width="2"/>' +
      '<circle cx="30" cy="40" r="6" fill="#fbbf24"/><circle cx="50" cy="36" r="5" fill="#fb7185"/>' +
      '<path d="M58 18c4 8 2 16-4 20" stroke="#a78bfa" stroke-width="3" fill="none"/>',
    'topic-politics':
      '<rect x="20" y="22" width="40" height="36" rx="4" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>' +
      '<path d="M20 32h40" stroke="#94a3b8"/><rect x="28" y="38" width="8" height="14" fill="#3b82f6"/>' +
      '<rect x="40" y="38" width="8" height="14" fill="#ef4444"/>' +
      '<path d="M16 58h48" stroke="#1e293b" stroke-width="3"/><circle cx="40" cy="14" r="8" fill="#f59e0b"/>',
    'topic-media':
      '<rect x="14" y="24" width="36" height="28" rx="4" fill="#1e293b"/>' +
      '<path d="M36 32l14 8-14 8z" fill="#f472b6"/>' +
      '<circle cx="26" cy="38" r="6" fill="#38bdf8"/>' +
      '<path d="M52 18v28M48 22h8M48 42h8" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round"/>',
    'topic-travel':
      '<path d="M12 52c10-20 46-20 56 0z" fill="#38bdf8" opacity="0.9"/>' +
      '<path d="M44 20l16 12-16 8z" fill="#f472b6"/>' +
      '<circle cx="26" cy="40" r="6" fill="#fbbf24"/>',
    'topic-legal':
      '<rect x="20" y="20" width="32" height="40" rx="3" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>' +
      '<path d="M54 24h8v28h-8z" fill="#e2e8f0" stroke="#64748b"/>' +
      '<path d="M48 58h20M48 58c0-8 10-8 10 0" stroke="#475569" stroke-width="2.5" fill="none"/>',
    'topic-work':
      '<rect x="14" y="22" width="36" height="26" rx="4" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>' +
      '<rect x="44" y="44" width="24" height="18" rx="3" fill="#ecfdf5" stroke="#10b981"/>' +
      '<path d="M48 50l4 4 8-10" stroke="#059669" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    'topic-unclear':
      '<path d="M10 44c8-16 20-24 30-24s22 8 30 24" fill="none" stroke="#94a3b8" stroke-width="2.5"/>' +
      '<path d="M22 44c4-6 10-10 18-10s14 4 18 10" fill="none" stroke="#ef4444" stroke-width="2"/>' +
      '<path d="M58 18l6 6-6 6-6-6z" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>' +
      '<text x="58" y="40" text-anchor="middle" font-size="16" font-weight="700" fill="#dc2626">!</text>',
  };

  var CAT_VARIANTS = {
    'cat-meetings': [
      SVG_INNER['cat-meetings'],
      '<circle cx="24" cy="32" r="10" fill="#f472b6"/><circle cx="56" cy="32" r="10" fill="#34d399"/>' +
        '<path d="M12 58c6-12 20-16 28-16s22 4 28 16" fill="#60a5fa"/>',
    ],
    'cat-notes': [
      SVG_INNER['cat-notes'],
      '<rect x="20" y="14" width="44" height="50" rx="8" fill="#fce7f3" stroke="#ec4899" stroke-width="2"/>' +
        '<path d="M28 30h24M28 40h18" stroke="#f472b6" stroke-width="2.5" stroke-linecap="round"/>',
    ],
    'cat-tasks': [
      SVG_INNER['cat-tasks'],
      '<rect x="18" y="16" width="44" height="48" rx="8" fill="#fff7ed" stroke="#ea580c" stroke-width="2"/>' +
        '<path d="M28 32l5 5 12-12" stroke="#c2410c" stroke-width="3" fill="none" stroke-linecap="round"/>',
    ],
    'cat-calendar': [SVG_INNER['cat-calendar']],
    'cat-projects': [SVG_INNER['cat-projects']],
    'cat-decisions': [SVG_INNER['cat-decisions']],
    'cat-open': [SVG_INNER['cat-open']],
  };

  VISUAL_LABELS['topic-unclear'] = 'Unclear audio — needs review';
  VISUAL_LABELS['topic-travel'] = 'Travel';
  VISUAL_LABELS['topic-legal'] = 'Legal';
  VISUAL_LABELS['topic-work'] = 'Work & projects';

  function hashSeed(str) {
    var h = 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function itemSeed(item) {
    if (!item) return 0;
    return hashSeed(
      [item.id, item.path, item.filepath, item.title, item.project, item.sourceAudio || item.source_audio]
        .filter(Boolean)
        .join('|')
    );
  }

  function categoryVisualKey(cat) {
    var c = String(cat || 'notes').toLowerCase();
    return CATEGORY_KEYS[c] || 'cat-notes';
  }

  function itemVisualCorpus(item) {
    if (!item || typeof item !== 'object') return '';
    var parts = [
      item.title,
      item.summary,
      item.preview,
      item.description,
      item.path,
      item.filepath,
      item.project,
      item.issue,
      item.taskText,
      item.decisionText,
    ];
    var tags = item.tags;
    if (Array.isArray(tags)) parts = parts.concat(tags);
    else if (tags) parts.push(String(tags));
    ['bullets', 'importantPoints', 'decisions', 'tasks', 'openPoints', 'nextSteps', 'possibleActions'].forEach(
      function (k) {
        var v = item[k];
        if (Array.isArray(v)) parts = parts.concat(v);
        else if (v != null && String(v).trim()) parts.push(v);
      }
    );
    return parts
      .filter(function (p) {
        return p != null && String(p).trim();
      })
      .join(' ')
      .toLowerCase();
  }

  function countKeywordHits(text, keywords) {
    var hits = 0;
    if (!text) return 0;
    keywords.forEach(function (kw) {
      if (text.indexOf(String(kw).toLowerCase()) !== -1) hits += 1;
    });
    return hits;
  }

  function isUnclearItem(item) {
    if (!item) return false;
    var corpus = itemVisualCorpus(item);
    if (corpus.indexOf('| confidence: low') !== -1) return true;
    if (/\b(inaudible|unintelligible|garbled|unclear audio)\b/.test(corpus)) return true;
    if (corpus.length < 100 && !item.summary && !item.title) return true;
    return false;
  }

  function inferTopicVisualKey(item) {
    var cat = String((item && item.category) || 'notes').toLowerCase();
    var fallback = categoryVisualKey(cat);
    if (!item) return fallback;
    if (isUnclearItem(item)) return 'topic-unclear';
    var corpus = itemVisualCorpus(item);
    if (!corpus) return fallback;
    var bestKey = null;
    var bestHits = 0;
    TOPIC_RULES.forEach(function (rule) {
      var h = countKeywordHits(corpus, rule.keywords);
      if (h >= 1 && h > bestHits) {
        bestHits = h;
        bestKey = rule.key;
      }
    });
    if (bestKey) return bestKey;
    if (cat === 'calendar') return 'cat-calendar';
    if (cat === 'tasks') return 'cat-tasks';
    if (cat === 'decisions') return 'cat-decisions';
    if (cat === 'projects') return 'cat-projects';
    return fallback;
  }

  function resolveInnerSvg(key, seed) {
    if (SVG_INNER[key]) return SVG_INNER[key];
    var variants = CAT_VARIANTS[key];
    if (variants && variants.length) return variants[seed % variants.length];
    return SVG_INNER['cat-notes'];
  }

  function visualLabel(key) {
    return VISUAL_LABELS[key] || 'Transcription';
  }

  function renderTopicVisual(key, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : 0;
    var visualKey = key && (SVG_INNER[key] || CAT_VARIANTS[key]) ? key : categoryVisualKey(opts.category || 'notes');
    var inner = resolveInnerSvg(visualKey, seed);
    inner = inner.replace(/\bid="([^"]+)"/g, function (_, id) {
      return 'id="' + visualKey + '-' + seed + '-' + id + '"';
    });
    inner = inner.replace(/url\(#([^)]+)\)/g, function (_, id) {
      return 'url(#' + visualKey + '-' + seed + '-' + id + ')';
    });
    var size = opts.size === 'hero' ? 'hero' : 'list';
    var extra = opts.extraClass ? ' ' + opts.extraClass : '';
    var mirror = seed % 3 === 0 ? ' tx-topic-visual--mirror' : '';
    var wrapCls = 'tx-topic-visual tx-topic-visual--' + size + extra + mirror;
    var hue = (seed % 14) * 14;
    return (
      '<div class="' +
      wrapCls +
      '" data-tx-visual-key="' +
      visualKey +
      '" data-tx-visual-seed="' +
      seed +
      '" style="--tx-topic-hue:' +
      hue +
      'deg" role="img" aria-label="' +
      visualLabel(visualKey).replace(/"/g, '&quot;') +
      '">' +
      '<svg class="tx-topic-visual__svg" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      inner +
      '</svg></div>'
    );
  }

  function renderTopicVisualForItem(item, opts) {
    opts = opts || {};
    return renderTopicVisual(inferTopicVisualKey(item), {
      seed: itemSeed(item),
      size: opts.size,
      extraClass: opts.extraClass,
      category: item && item.category,
    });
  }

  window.TxTopicVisuals = {
    inferTopicVisualKey: inferTopicVisualKey,
    categoryVisualKey: categoryVisualKey,
    renderTopicVisual: renderTopicVisual,
    renderTopicVisualForItem: renderTopicVisualForItem,
    visualLabel: visualLabel,
    itemSeed: itemSeed,
    isUnclearItem: isUnclearItem,
    TOPIC_RULES: TOPIC_RULES,
    CATEGORY_KEYS: CATEGORY_KEYS,
  };
})();
