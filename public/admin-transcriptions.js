/**
 * Admin /admin/transcriptions — visual dashboard for AI-ready voice outputs.
 */
(function () {
  'use strict';

  /** Bumped when dashboard markup/behavior changes (cache-bust aid). */
  window.TX_DASHBOARD_UI_REV = 4;

  var CATEGORIES = [
    { key: 'meetings', label: 'Meeting summaries', short: 'Meetings' },
    { key: 'notes', label: 'Personal notes', short: 'Notes' },
    { key: 'tasks', label: 'Tasks', short: 'Tasks' },
    { key: 'calendar', label: 'Calendar events', short: 'Calendar' },
    { key: 'projects', label: 'Project updates', short: 'Projects' },
    { key: 'decisions', label: 'Decision log', short: 'Decisions' },
    { key: 'open-points', label: 'Open points', short: 'Open' },
  ];

  var CATEGORY_LABELS = {
    meetings: 'Meeting summary',
    notes: 'Personal note',
    tasks: 'Task',
    calendar: 'Calendar event',
    projects: 'Project update',
    decisions: 'Decision',
    'open-points': 'Open point',
  };

  var HIDE_JUNK_STORAGE_KEY = 'tf.tx.hideJunk';
  var BULK_ONBOARDED_KEY = 'tf.tx.bulkOnboarded';
  var BULK_SYNC_CONCURRENCY = 5;
  var LONG_PRESS_MS = 500;
  var SERIOUS_PROJECTS = { personal: true, serviceopera: true, work: true, projects: true };
  var WHATSAPP_EXPORT_RE = /\d{1,2}\/\d{1,2}\/\d{2}, \d{2}:\d{2} - /;
  var ACTION_VERB_RE =
    /^(call|email|buy|schedule|follow|send|book|pay|check|fix|review|meet|contact|prepare|complete|finish|update|create|add|remove|start|plan|discuss|decide|confirm|cancel|order|submit|write|read|attend|visit|deliver|organize|chiama|invia|compra|prenota|paga|controlla|completare|finire|preparare|verificare|fare)\b/i;

  var CHART_COLORS = [
    '#c9a227',
    '#6bcb8a',
    '#7eb8da',
    '#d4846a',
    '#a78bfa',
    '#f472b6',
    '#94a3b8',
  ];

  var state = {
    items: [],
    counts: {},
    filtered: [],
    searchResults: null,
    category: 'meetings',
    rawSources: {},
    pipeline: {},
    needsReviewCount: 0,
    filters: { today: false, week: false, unreviewed: false, syncPending: false },
    hideJunk: true,
    project: '',
    searchQuery: '',
    searchLoading: false,
    selectedId: null,
    detailItem: null,
    indexMeta: {},
    syncSettings: { auto_sync_google: false },
    chart: null,
    hasChartData: false,
    rawTranscriptionCount: 0,
    generatedAt: null,
    loading: false,
    apiUnavailable: false,
    selectMode: false,
    selectedIds: {},
    itemSyncState: {},
    bulkSyncing: false,
    bulkSyncProgress: { done: 0, total: 0 },
  };

  var searchTimer = null;
  var bound = false;
  var longPressTimer = null;
  var longPressDidTrigger = false;
  var REINDEX_DEBOUNCE_MS = 2000;
  var reindexBusy = false;

  function api(path) {
    if (typeof soApiUrl === 'function') return soApiUrl(path);
    if (typeof window.__soApiUrl === 'function') return window.__soApiUrl(path);
    return path;
  }

  function apiCred() {
    if (typeof soApiCredentials === 'function') return soApiCredentials();
    if (typeof window.__soApiCredentials === 'function') return window.__soApiCredentials();
    return 'same-origin';
  }

  function adminJwt() {
    return typeof readStoredAdminJwt === 'function' ? readStoredAdminJwt() : '';
  }

  function esc(s) {
    if (s == null) return '';
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    var el = byId('txToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2800);
  }

  function adminFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign(
      { Authorization: 'Bearer ' + adminJwt() },
      opts.headers || {}
    );
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(api(path), {
      method: opts.method || 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: headers,
      body: opts.body,
    }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (j) {
          return { ok: r.ok, status: r.status, j: j };
        });
    });
  }

  function tryApi(paths, opts) {
    var i = 0;
    function next() {
      if (i >= paths.length) {
        return Promise.resolve({ ok: false, status: 404, j: { error: 'API not available' } });
      }
      return adminFetch(paths[i], opts).then(function (pack) {
        if (pack.status === 404 && i < paths.length - 1) {
          i += 1;
          return next();
        }
        return pack;
      });
    }
    return next();
  }

  function apiErrorMessage(pack, fallback) {
    if (pack && pack.status === 429) {
      return (
        (pack.j && pack.j.error) ||
        'Too many admin API requests. Wait about a minute, reload, or sign out and sign in again.'
      );
    }
    return (pack && pack.j && pack.j.error) || fallback;
  }

  function iconSvg(key) {
    var paths = {
      all: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
      meetings:
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
      tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
      calendar:
        '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
      projects: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      decisions: '<path d="M12 3v18"/><path d="M5 8h14M5 16h14"/>',
      'open-points': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    };
    var d = paths[key] || paths.all;
    return (
      '<svg class="tx-cat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d +
      '</svg>'
    );
  }


  var KEY_POINT_MAX = 60;

  var CATEGORY_POINT_KEYS = {
    meetings: ['decisions', 'openPoints', 'nextSteps', 'tasks'],
    notes: ['bullets', 'importantPoints', 'summary'],
    tasks: ['tasks', 'nextSteps'],
    calendar: ['bullets', 'summary'],
    decisions: ['decisions', 'importantPoints'],
    'open-points': ['openPoints', 'issue'],
    projects: ['nextSteps', 'bullets', 'openPoints'],
  };

  var KEY_POINT_FALLBACK_KEYS = [
    'decisions',
    'tasks',
    'openPoints',
    'nextSteps',
    'importantPoints',
    'bullets',
  ];

  var CATEGORY_THEME = {
    meetings: { accent: '#2563eb', subtitle: 'Discussions, decisions, and follow-ups' },
    notes: { accent: '#4f46e5', subtitle: 'Ideas, reminders, and personal takeaways' },
    tasks: { accent: '#10b981', subtitle: 'Action items and checklists' },
    calendar: { accent: '#8b5cf6', subtitle: 'Dates, events, and scheduling' },
    projects: { accent: '#f59e0b', subtitle: 'Project updates and blockers' },
    decisions: { accent: '#ef4444', subtitle: 'Confirmed choices and commitments' },
    'open-points': { accent: '#eab308', subtitle: 'Unresolved questions and owners' },
  };

  function catTheme(cat) {
    return CATEGORY_THEME[cat] || { accent: '#4f46e5', subtitle: '' };
  }

  function aiReadyItems() {
    return state.items.filter(function (it) {
      if (!isAiReadyItem(it)) return false;
      if (state.hideJunk && isJunkItem(it)) return false;
      return true;
    });
  }

  function categoryItems(cat) {
    return aiReadyItems().filter(function (it) {
      return it.category === cat;
    });
  }

  function truncatePoint(s, max) {
    var t = String(s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '\u2026';
  }

  function uniquePoints(list) {
    var seen = {};
    var out = [];
    list.forEach(function (p) {
      var t = truncatePoint(p, KEY_POINT_MAX);
      if (!t) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
    });
    return out;
  }

  function pointValuesForKeys(item, keys) {
    var pool = [];
    keys.forEach(function (key) {
      var val = item[key];
      if (Array.isArray(val)) pool = pool.concat(val);
      else if (val != null && String(val).trim()) pool.push(val);
    });
    return pool;
  }

  function isGenericPlaceholderText(t) {
    var s = String(t || '').toLowerCase();
    if (!s) return true;
    if (s.indexOf('open for structured sections') !== -1) return true;
    if (s.indexOf('ai-ready note from') === 0 && s.length < 120) return true;
    return false;
  }

  function splitTextToPoints(text, max) {
    var t = String(text || '').trim();
    if (!t || isGenericPlaceholderText(t)) return [];
    var parts = t
      .split(/(?<=[.!?])\s+|[\n;•]+/)
      .map(function (s) {
        return s.replace(/^[-*•]\s*/, '').trim();
      })
      .filter(function (s) {
        return s.length > 8 && !isGenericPlaceholderText(s);
      });
    return uniquePoints(parts).slice(0, max || 3);
  }

  function itemKeyPoints(item) {
    var cat = String(item.category || 'notes').toLowerCase();
    var pool = pointValuesForKeys(item, CATEGORY_POINT_KEYS[cat] || []);
    if (!pool.length) pool = pointValuesForKeys(item, KEY_POINT_FALLBACK_KEYS);
    pool = pool.filter(function (p) {
      return !isGenericPlaceholderText(p);
    });
    if (!pool.length && item.taskText) pool.push(item.taskText);
    if (!pool.length && item.decisionText) pool.push(item.decisionText);
    if (!pool.length && item.issue) pool.push(item.issue);
    if (!pool.length && item.summary) pool = pool.concat(splitTextToPoints(item.summary, 3));
    if (!pool.length && item.preview) pool = pool.concat(splitTextToPoints(item.preview, 3));
    pool = pool.filter(function (p) {
      return !isGenericPlaceholderText(p);
    });
    return uniquePoints(pool).slice(0, 3);
  }

  function itemDetailKeyPoints(item) {
    var pool = itemKeyPoints(item).slice();
    if (pool.length >= 3) return pool;
    if (!pool.length && item.summary) pool.push(truncatePoint(item.summary, KEY_POINT_MAX));
    if (pool.length < 3 && item.preview) pool.push(truncatePoint(item.preview, KEY_POINT_MAX));
    return uniquePoints(pool).slice(0, 3);
  }

  function renderCompactRing(segments, centerLabel) {
    var chart = segments.filter(function (s) {
      return s.value > 0;
    });
    if (!chart.length) return '';
    var total = chart.reduce(function (s, c) {
      return s + c.value;
    }, 0);
    if (!total) return '';
    var r = 18;
    var cx = 24;
    var cy = 24;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var segs;
    if (chart.length === 1) {
      segs =
        '<circle cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="' +
        r +
        '" fill="none" stroke="' +
        esc(chart[0].color) +
        '" stroke-width="5" opacity="0.92"/>';
    } else {
      segs = chart
        .map(function (c) {
          var frac = c.value / total;
          var len = circ * frac;
          var dash = len + ' ' + (circ - len);
          var rot = (offset / circ) * 360 - 90;
          offset += len;
          return (
            '<circle cx="' +
            cx +
            '" cy="' +
            cy +
            '" r="' +
            r +
            '" fill="none" stroke="' +
            esc(c.color) +
            '" stroke-width="5" stroke-dasharray="' +
            dash +
            '" transform="rotate(' +
            rot +
            ' ' +
            cx +
            ' ' +
            cy +
            ')" />'
          );
        })
        .join('');
    }
    return (
      '<div class="tx-mini-ring tx-ring--compact" aria-hidden="true"><svg viewBox="0 0 48 48">' +
      '<circle cx="24" cy="24" r="18" fill="none" stroke="var(--tx-dash-line,#e2e8f0)" stroke-width="5"/>' +
      segs +
      '<text x="24" y="26" text-anchor="middle" font-size="9" fill="currentColor" font-weight="700">' +
      esc(centerLabel != null ? centerLabel : total) +
      '</text></svg></div>'
    );
  }

  function renderLargeCategoryIcon(cat, extraClass) {
    var theme = catTheme(cat);
    var cls = 'tx-dash-card__icon' + (extraClass ? ' ' + extraClass : '');
    return (
      '<div class="' +
      cls +
      '" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      iconSvg(cat).replace('tx-cat-card__icon', '') +
      '</div>'
    );
  }

  function audioBasename(item) {
    var a = item.sourceAudio || item.source_audio || '';
    if (!a || a === '—') return '';
    var parts = String(a).split(/[/\\]/);
    return parts[parts.length - 1] || a;
  }

  function formatProcessedDate(item) {
    var raw = item.processedDate || item.processed_at || '';
    if (!raw) return '';
    var t = Date.parse(raw);
    if (Number.isNaN(t)) {
      var m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) t = Date.parse(m[1] + '-' + m[2] + '-' + m[3]);
    }
    if (Number.isNaN(t)) return String(raw).slice(0, 16);
    try {
      return new Date(t).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (e) {
      return String(raw).slice(0, 16);
    }
  }

  function itemFeedChips(item) {
    var chips = [{ t: 'AI-ready', ok: true }];
    if (!item.reviewed) chips.push({ t: 'Needs review', warn: true });
    chips.push({ t: categoryShortLabel(item.category), accent: true });
    return chips;
  }

  function countWhere(items, fn) {
    var n = 0;
    items.forEach(function (it) {
      if (fn(it)) n += 1;
    });
    return n;
  }

  function taskStatusBucket(item) {
    var s = String(item.status || '').toLowerCase();
    if (s === 'done' || s === 'closed' || s === 'complete' || s === 'completed') return 'done';
    if (s === 'unclear' || s === 'unknown' || s === 'pending-clarification') return 'unclear';
    return 'open';
  }

  function calendarDateState(item) {
    var text = itemText(item).toLowerCase();
    if (text.indexOf('to confirm') !== -1 || text.indexOf('confirm date') !== -1) return 'confirm';
    var t = item.eventDate || item.date || item.dueDate;
    if (t && !Number.isNaN(Date.parse(t))) return 'dated';
    return 'unclear';
  }

  function projectBucket(item) {
    var p = String(item.project || '').toLowerCase().trim();
    if (!p || p === 'uncategorized' || p === '—') return 'uncategorized';
    return 'categorized';
  }

  function openPointBucket(item) {
    var text = itemText(item).toLowerCase();
    if (item.owner || item.assignedTo) return 'assigned';
    if (text.indexOf('owner') !== -1 && text.indexOf('confirm') !== -1) return 'assigned';
    if (text.indexOf('unclear') !== -1 || text.indexOf('unknown') !== -1) return 'unclear';
    return 'unresolved';
  }

  function categoryDonutSegments(cat, items) {
    var n = items.length;
    if (n < 1) return null;
    var segs = [];
    switch (cat) {
      case 'meetings': {
        var rev = countWhere(items, function (it) {
          return it.reviewed;
        });
        var unrev = n - rev;
        if (rev && unrev) {
          segs = [
            { value: rev, color: '#10b981' },
            { value: unrev, color: '#f59e0b' },
          ];
        }
        break;
      }
      case 'notes': {
        var personal = countWhere(items, function (it) {
          var p = String(it.project || '').toLowerCase();
          return !p || p === 'personal';
        });
        var work = n - personal;
        if (personal && work) {
          segs = [
            { value: personal, color: '#0ea5e9' },
            { value: work, color: '#4f46e5' },
          ];
        } else {
          var reviewed = countWhere(items, function (it) {
            return it.reviewed;
          });
          var pending = n - reviewed;
          if (reviewed && pending) {
            segs = [
              { value: reviewed, color: '#10b981' },
              { value: pending, color: '#94a3b8' },
            ];
          }
        }
        break;
      }
      case 'tasks': {
        var open = countWhere(items, function (it) {
          return taskStatusBucket(it) === 'open';
        });
        var done = countWhere(items, function (it) {
          return taskStatusBucket(it) === 'done';
        });
        var unclear = n - open - done;
        if ([open, done, unclear].filter(function (x) {
          return x > 0;
        }).length >= 2) {
          segs = [];
          if (open) segs.push({ value: open, color: '#f59e0b' });
          if (done) segs.push({ value: done, color: '#10b981' });
          if (unclear) segs.push({ value: unclear, color: '#94a3b8' });
        } else {
          var withDue = countWhere(items, function (it) {
            return !!(it.dueDate || it.eventDate);
          });
          var noDue = n - withDue;
          if (withDue && noDue) {
            segs = [
              { value: withDue, color: '#4f46e5' },
              { value: noDue, color: '#cbd5e1' },
            ];
          }
        }
        break;
      }
      case 'calendar': {
        var dated = countWhere(items, function (it) {
          return calendarDateState(it) === 'dated';
        });
        var confirm = countWhere(items, function (it) {
          return calendarDateState(it) === 'confirm';
        });
        var unclearC = n - dated - confirm;
        if ([dated, confirm, unclearC].filter(function (x) {
          return x > 0;
        }).length >= 2) {
          segs = [];
          if (dated) segs.push({ value: dated, color: '#f59e0b' });
          if (confirm) segs.push({ value: confirm, color: '#ef4444' });
          if (unclearC) segs.push({ value: unclearC, color: '#94a3b8' });
        }
        break;
      }
      case 'projects': {
        var catd = countWhere(items, function (it) {
          return projectBucket(it) === 'categorized';
        });
        var uncat = n - catd;
        if (catd && uncat) {
          segs = [
            { value: catd, color: '#8b5cf6' },
            { value: uncat, color: '#cbd5e1' },
          ];
        }
        break;
      }
      case 'decisions': {
        var conf = countWhere(items, function (it) {
          return it.reviewed;
        });
        var review = n - conf;
        if (conf && review) {
          segs = [
            { value: conf, color: '#10b981' },
            { value: review, color: '#ec4899' },
          ];
        }
        break;
      }
      case 'open-points': {
        var unresolved = countWhere(items, function (it) {
          return openPointBucket(it) === 'unresolved';
        });
        var assigned = countWhere(items, function (it) {
          return openPointBucket(it) === 'assigned';
        });
        var unclearO = n - unresolved - assigned;
        if ([unresolved, assigned, unclearO].filter(function (x) {
          return x > 0;
        }).length >= 2) {
          segs = [];
          if (unresolved) segs.push({ value: unresolved, color: '#64748b' });
          if (assigned) segs.push({ value: assigned, color: '#4f46e5' });
          if (unclearO) segs.push({ value: unclearO, color: '#f59e0b' });
        }
        break;
      }
      default:
        break;
    }
    return segs && segs.length >= 2 ? segs : null;
  }

  function categorySecondaryStats(cat, items) {
    var n = items.length;
    if (!n) return [];
    var lines = [];
    switch (cat) {
      case 'meetings':
        lines.push(
          countWhere(items, function (it) {
            return it.reviewed;
          }) + ' reviewed'
        );
        lines.push(
          countWhere(items, function (it) {
            return !it.reviewed;
          }) + ' needs review'
        );
        break;
      case 'notes':
        lines.push(
          countWhere(items, function (it) {
            return it.reviewed;
          }) + ' processed'
        );
        lines.push(
          countWhere(items, function (it) {
            return !it.reviewed;
          }) + ' pending'
        );
        break;
      case 'tasks':
        lines.push(
          countWhere(items, function (it) {
            return taskStatusBucket(it) === 'open';
          }) + ' open'
        );
        lines.push(
          countWhere(items, function (it) {
            return taskStatusBucket(it) === 'done';
          }) + ' done'
        );
        break;
      case 'calendar':
        lines.push(
          countWhere(items, function (it) {
            return calendarDateState(it) === 'dated';
          }) + ' dated'
        );
        lines.push(
          countWhere(items, function (it) {
            return calendarDateState(it) === 'confirm';
          }) + ' to confirm'
        );
        break;
      case 'projects':
        lines.push(
          countWhere(items, function (it) {
            return projectBucket(it) === 'categorized';
          }) + ' categorized'
        );
        lines.push(n - countWhere(items, function (it) {
          return projectBucket(it) === 'categorized';
        }) + ' uncategorized');
        break;
      case 'decisions':
        lines.push(
          countWhere(items, function (it) {
            return it.reviewed;
          }) + ' confirmed'
        );
        lines.push(
          countWhere(items, function (it) {
            return !it.reviewed;
          }) + ' needs review'
        );
        break;
      case 'open-points':
        lines.push(
          countWhere(items, function (it) {
            return openPointBucket(it) === 'unresolved';
          }) + ' unresolved'
        );
        lines.push(
          countWhere(items, function (it) {
            return openPointBucket(it) === 'assigned';
          }) + ' assigned'
        );
        break;
      default:
        break;
    }
    return lines.slice(0, 3);
  }

  function renderOverview() {
    var el = byId('txOverview');
    if (!el) return;
    el.innerHTML = CATEGORIES.map(function (c) {
      var items = categoryItems(c.key);
      var n = items.length;
      var theme = catTheme(c.key);
      var active = state.category === c.key ? ' is-active' : '';
      var segs = categoryDonutSegments(c.key, items);
      var visual = segs
        ? '<div class="tx-overview-card__visual">' + renderCompactRing(segs, n) + '</div>'
        : '<div class="tx-overview-card__visual">' + renderLargeCategoryIcon(c.key, 'tx-overview-card__icon') + '</div>';
      var stats = categorySecondaryStats(c.key, items)
        .map(function (s) {
          return '<span><strong>' + esc(s.split(' ')[0]) + '</strong> ' + esc(s.replace(/^\d+\s*/, '')) + '</span>';
        })
        .join('');
      return (
        '<button type="button" class="tx-overview-card' +
        active +
        '" data-tx-overview-cat="' +
        esc(c.key) +
        '" style="--tx-overview-accent:' +
        esc(theme.accent) +
        '">' +
        '<div class="tx-overview-card__head">' +
        '<h3 class="tx-overview-card__title">' +
        esc(c.short) +
        '</h3>' +
        '<span class="tx-overview-card__count">' +
        esc(n) +
        '</span></div>' +
        visual +
        (stats ? '<div class="tx-overview-card__stats">' + stats + '</div>' : '') +
        '</button>'
      );
    }).join('');
    el.querySelectorAll('[data-tx-overview-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectCategory(btn.getAttribute('data-tx-overview-cat'));
      });
    });
  }

  function renderCategoryHeader() {
    var el = byId('txCategoryHeader');
    if (!el) return;
    var cat = state.category;
    var items = categoryItems(cat);
    var theme = catTheme(cat);
    var label = categoryShortLabel(cat);
    var segs = categoryDonutSegments(cat, items);
    var visual = segs
      ? renderCompactRing(segs, items.length)
      : iconSvg(cat).replace('tx-cat-card__icon', '');
    var meta = categorySecondaryStats(cat, items).join(' · ');
    el.innerHTML =
      '<div class="tx-category-header__icon-wrap" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      (segs ? visual : visual) +
      '</div>' +
      '<div class="tx-category-header__body">' +
      '<h2 class="tx-category-header__title">' +
      esc(label) +
      ' <span class="tx-category-header__count">' +
      esc(items.length) +
      '</span></h2>' +
      '<p class="tx-category-header__sub">' +
      esc(theme.subtitle) +
      '</p>' +
      (meta ? '<p class="tx-category-header__meta">' + esc(meta) + '</p>' : '') +
      '</div>';
  }

  function dashStatChips(item) {
    var chips = statChips(item);
    var proj = String(item.project || '').trim();
    if (proj) {
      var pl = proj.toLowerCase();
      if (pl === 'personal') chips.push({ t: 'Personal', accent: true });
      else if (pl.indexOf('serviceopera') !== -1) chips.push({ t: 'ServiceOpera', accent: true });
      else if (pl.indexOf('thaifans') !== -1) chips.push({ t: 'Thaifans', accent: true });
      else chips.push({ t: proj, accent: true });
    }
    var st = item.stats || {};
    if ((st.tasks_count || 0) > 0 || (item.tasks || []).length) chips.push({ t: 'Has tasks' });
    if ((st.calendar_events_count || 0) > 0) chips.push({ t: 'Has calendar' });
    if ((st.decisions_count || 0) > 0 || (item.decisions || []).length) chips.push({ t: 'Has decisions' });
    if (item.category === 'calendar' && calendarDateState(item) === 'confirm') {
      chips.push({ t: 'Date/time to confirm', warn: true });
    }
    if (!chips.some(function (c) {
      return c.t === 'AI-ready';
    })) {
      chips.unshift({ t: 'AI-ready', ok: true });
    }
    return chips;
  }

  function itemCardVisual(item) {
    var cat = String(item.category || 'notes').toLowerCase();
    var st = item.stats || {};
    var segs = [];
    if (cat === 'meetings' || cat === 'notes') {
      var d = st.decisions_count || (item.decisions || []).length;
      var t = st.tasks_count || (item.tasks || []).length;
      var o = st.open_points_count || (item.openPoints || []).length;
      if (d) segs.push({ value: d, color: catTheme('decisions').accent });
      if (t) segs.push({ value: t, color: catTheme('tasks').accent });
      if (o) segs.push({ value: o, color: catTheme('open-points').accent });
    } else if (cat === 'tasks') {
      var bucket = taskStatusBucket(item);
      if (bucket === 'open') segs.push({ value: 1, color: '#f59e0b' });
      else if (bucket === 'done') segs.push({ value: 1, color: '#10b981' });
      else segs.push({ value: 1, color: '#94a3b8' });
    }
    var ring = segs.length ? renderCompactRing(segs) : '';
    var icon = renderLargeCategoryIcon(cat);
    if (!ring) {
      return '<div class="tx-dash-card__visual tx-dash-card__visual--icon">' + icon + '</div>';
    }
    return (
      '<div class="tx-dash-card__visual tx-dash-card__visual--icon">' +
      icon +
      '<div class="tx-dash-card__ring-overlay" aria-hidden="true">' +
      ring +
      '</div></div>'
    );
  }

  function renderFeedSectionHeader(cat, count) {
    var theme = catTheme(cat);
    return (
      '<header class="tx-feed-section__head" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      '<span class="tx-feed-section__icon">' +
      iconSvg(cat).replace('tx-cat-card__icon', '') +
      '</span>' +
      '<span class="tx-feed-section__label">' +
      esc(categoryShortLabel(cat)) +
      '</span>' +
      '<span class="tx-feed-section__count">' +
      esc(count) +
      '</span></header>'
    );
  }

  function renderFeedBody(list) {
    var inSearch = !!(state.searchQuery.trim() && state.searchResults);
    if (!inSearch) {
      return list.map(renderFeedCard).join('');
    }
    var groups = {};
    list.forEach(function (it) {
      var c = String(it.category || 'notes').toLowerCase();
      if (!groups[c]) groups[c] = [];
      groups[c].push(it);
    });
    return CATEGORIES.map(function (c) {
        return c.key;
      })
      .filter(function (key) {
        return groups[key] && groups[key].length;
      })
      .map(function (key) {
        var items = groups[key];
        return (
          '<section class="tx-feed-section">' +
          renderFeedSectionHeader(key, items.length) +
          '<div class="tx-feed-section__items">' +
          items.map(renderFeedCard).join('') +
          '</div></section>'
        );
      })
      .join('');
  }

  function renderDashChip(c) {
    var cls = 'tx-dash-card__chip';
    if (c.ok) cls += ' tx-dash-card__chip--ok';
    if (c.warn) cls += ' tx-dash-card__chip--warn';
    if (c.accent) cls += ' tx-dash-card__chip--accent';
    return '<span class="' + cls + '">' + esc(c.t) + '</span>';
  }


  function parseItemDate(item) {
    var d = item.processedDate || item.eventDate || item.title || '';
    var t = Date.parse(d);
    if (!Number.isNaN(t)) return t;
    var m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Date.parse(m[1] + '-' + m[2] + '-' + m[3]);
    return 0;
  }

  function relativeDate(item) {
    var t = parseItemDate(item);
    if (!t) return '—';
    var diff = Date.now() - t;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var day = Math.floor(hr / 24);
    if (day < 7) return day + 'd ago';
    if (day < 30) return Math.floor(day / 7) + 'w ago';
    try {
      return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function isToday(ts) {
    if (!ts) return false;
    var d = new Date(ts);
    var n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  }

  function isThisWeek(ts) {
    if (!ts) return false;
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return ts >= start.getTime();
  }

  function normalizeItem(it) {
    var ex = it.extracted_items || it.extractedItems || {};
    var bullets = it.bullets;
    if (!bullets || !bullets.length) {
      bullets = []
        .concat(ex.decisions || it.decisions || [])
        .concat(ex.tasks || it.tasks || [])
        .concat(ex.open_points || it.openPoints || [])
        .concat(ex.next_steps || it.nextSteps || [])
        .concat(ex.important_points || it.importantPoints || [])
        .slice(0, 3);
    }
    var srcAudio = it.sourceAudio || it.source_audio || null;
    var srcTrans = it.sourceTranscription || it.source_transcription || null;
    if (srcTrans && srcTrans.indexOf('content/') !== 0) {
      srcTrans = 'content/transcriptions/' + String(srcTrans).replace(/^.*[\\/]/, '');
    }
    return Object.assign({}, it, {
      categoryLabel: CATEGORY_LABELS[it.category] || it.categoryLabel || it.category,
      reviewed: !!(it.reviewed || it.isReviewed),
      googleSyncPending: !!(it.googleSyncPending || it.syncPending),
      googleSynced: !!(it.googleSynced || it.synced),
      bullets: bullets,
      decisions: ex.decisions || it.decisions || [],
      tasks: ex.tasks || it.tasks || [],
      openPoints: ex.open_points || it.openPoints || [],
      nextSteps: ex.next_steps || it.nextSteps || [],
      importantPoints: ex.important_points || it.importantPoints || [],
      path: it.filepath || it.path,
      sourceAudio: srcAudio,
      source_audio: srcAudio,
      sourceTranscription: srcTrans,
      source_transcription: srcTrans,
      processedDate: it.processedDate || it.processing_date || it.processed_date || null,
      readyForSite:
        it.readyForSite !== false &&
        (!it.pipelineStatus || !!VISIBLE_PIPELINE_STATUSES[it.pipelineStatus]),
    });
  }

  function buildChartFromCounts(counts) {
    if (!counts) return { hasChartData: false, chart: [] };
    var chart = [];
    CATEGORIES.forEach(function (c) {
      var n = counts[c.key] != null ? counts[c.key] : 0;
      if (n > 0) {
        chart.push({
          category: c.key,
          label: c.short,
          value: n,
          color: catTheme(c.key).accent,
        });
      }
    });
    return { hasChartData: chart.length > 0, chart: chart };
  }

  var VISIBLE_PIPELINE_STATUSES = { ai_processed: true, ready_for_site: true };
  var ALLOWED_OUTPUT_PREFIXES = [
    'content/meetings/',
    'content/notes/',
    'content/tasks/',
    'content/calendar/',
    'content/projects/',
    'content/decisions/',
    'content/open-points/',
  ];

  function isAiReadyItem(it) {
    if (!it || it.source_only || it.sourceOnly) return false;
    var path = String(it.path || '');
    if (path.indexOf('content/transcriptions/') === 0) return false;
    if (path && !ALLOWED_OUTPUT_PREFIXES.some(function (p) { return path.indexOf(p) === 0; })) return false;
    if (it.readyForSite === false) return false;
    var st = it.pipelineStatus;
    if (st && !VISIBLE_PIPELINE_STATUSES[st]) return false;
    return true;
  }

  function normalizeIndex(j) {
    var counts = j.counts || j.totals || {};
    var items = (j.items || []).map(normalizeItem).filter(isAiReadyItem);
    var chartPack = j.has_chart_data != null ? { hasChartData: !!j.has_chart_data, chart: j.chart || [] } : buildChartFromCounts(counts);
    var projects = j.projects;
    if (!projects || !projects.length) {
      var set = {};
      items.forEach(function (it) {
        if (it.project) set[it.project] = true;
      });
      projects = Object.keys(set).sort();
    }
    var sync = j.sync_settings || j.syncSettings || {};
    return {
      items: items.filter(function (it) {
        return !it.source_only && !it.sourceOnly;
      }),
      counts: counts,
      rawTranscriptionCount: (j.rawSources && j.rawSources.total) || j.rawTranscriptionCount || 0,
      rawSources: j.rawSources || {},
      pipeline: j.pipeline || {},
      needsReviewCount: j.needsReviewCount != null ? j.needsReviewCount : 0,
      generatedAt: j.generatedAt || null,
      projects: projects,
      syncSettings: {
        auto_sync_google: !!(sync.auto_sync_google || sync.autoSyncGoogle),
      },
      hasChartData: chartPack.hasChartData,
      chart: chartPack.chart,
    };
  }

  function setLoadHint(text) {
    var el = byId('txLoadHint');
    if (el) el.textContent = text || '';
  }

  function getLoadHintText() {
    var el = byId('txLoadHint');
    return el ? el.textContent : '';
  }

  function setReindexBtnDisabled(disabled) {
    var btn = byId('txReindexBtn');
    if (!btn) return;
    btn.disabled = disabled;
    if (disabled) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  }


  function categoryShortLabel(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) return CATEGORIES[i].short;
    }
    return key || '—';
  }

  function normalizeCompareKey(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .slice(0, 60);
  }

  function excerptSameAsTitle(title, excerpt) {
    return normalizeCompareKey(title) === normalizeCompareKey(excerpt);
  }

  function cardExcerpt(item) {
    if (item.preview) return String(item.preview);
    var bullets = topBullets(item);
    if (bullets.length) return bullets[0];
    return '';
  }

  function loadHideJunkPref() {
    try {
      var v = localStorage.getItem(HIDE_JUNK_STORAGE_KEY);
      if (v === null || v === undefined) return true;
      return v === '1' || v === 'true';
    } catch (e) {
      return true;
    }
  }

  function saveHideJunkPref(on) {
    try {
      localStorage.setItem(HIDE_JUNK_STORAGE_KEY, on ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  function itemText(item) {
    var parts = [
      item.title,
      item.preview,
      item.summary,
      item.taskText,
      item.decisionText,
      item.issue,
    ];
    (item.bullets || []).forEach(function (b) {
      parts.push(b);
    });
    (item.tasks || []).forEach(function (t) {
      if (typeof t === 'string') parts.push(t);
      else if (t && (t.text || t.title)) parts.push(t.text || t.title);
    });
    var ex = item.extracted_items || item.extractedItems || {};
    (ex.tasks || []).forEach(function (t) {
      parts.push(typeof t === 'string' ? t : t && (t.text || t.title));
    });
    return parts
      .filter(function (p) {
        return p != null && String(p).trim();
      })
      .join(' ')
      .trim();
  }

  function hasExtractedActions(item) {
    if (item.category === 'tasks') return true;
    if (item.taskText && String(item.taskText).trim()) return true;
    if ((item.tasks || []).length) return true;
    var ex = item.extracted_items || item.extractedItems || {};
    if ((ex.tasks || []).length) return true;
    return false;
  }

  function isJunkCategory(item) {
    var cat = item.category;
    if (cat == null || cat === '') return true;
    var c = String(cat).trim();
    if (!c) return true;
    var lower = c.toLowerCase();
    return lower === 'uncategorized' || c === '—' || lower === '—';
  }

  function isJunkItem(item) {
    if (!item) return false;
    if (isJunkCategory(item)) return true;
    var text = itemText(item);
    if (text.toLowerCase().indexOf('| confidence: low') !== -1) return true;
    if (WHATSAPP_EXPORT_RE.test(text)) return true;
    if (text.length < 80 && !hasExtractedActions(item)) return true;
    return false;
  }

  function isJunkCard(item) {
    return isJunkItem(item);
  }

  function hasRealCategory(item) {
    return !isJunkCategory(item);
  }

  function isTaskLikeItem(item) {
    if (item.category === 'tasks') return true;
    var text = itemText(item).trim();
    return ACTION_VERB_RE.test(text);
  }

  function isSeriousItem(item) {
    if (isJunkItem(item)) return false;
    var project = String(item.project || '')
      .toLowerCase()
      .trim();
    if (SERIOUS_PROJECTS[project]) return true;
    if (item.category === 'projects') return true;
    return false;
  }

  function priorityScore(item) {
    var text = itemText(item);
    var cat = String(item.category || '').toLowerCase();
    var score = 0;
    if (hasRealCategory(item)) score += 2;
    if (text.length > 200) score += 1;
    if (cat === 'decisions' || cat === 'meetings') score += 2;
    return score;
  }

  function todayOperationalItems() {
    return state.items.filter(function (it) {
      return isAiReadyItem(it) && isToday(parseItemDate(it));
    });
  }

  function ensureTxDigest() {
    var existing = byId('txDigest');
    if (existing) return existing;
    var feed = byId('txFeed');
    if (!feed || !feed.parentNode) return null;
    var details = document.createElement('details');
    details.id = 'txDigest';
    details.className = 'tx-digest';
    details.innerHTML =
      '<summary class="tx-digest__summary">Today\u2019s digest</summary>' +
      '<div class="tx-digest__body" role="region" aria-live="polite"></div>';
    feed.parentNode.insertBefore(details, feed);
    return details;
  }

  function digestDefaultOpen() {
    try {
      return window.matchMedia('(max-width: 767px)').matches;
    } catch (e) {
      return true;
    }
  }

  function renderDigest() {
    var details = ensureTxDigest();
    if (!details) return;
    var body = details.querySelector('.tx-digest__body');
    if (!body) return;

    if (details.dataset.txDigestOpenSet !== '1') {
      details.open = digestDefaultOpen();
      details.dataset.txDigestOpenSet = '1';
    }

    var today = todayOperationalItems();
    var serious = 0;
    var taskCount = 0;
    var junkCount = 0;
    today.forEach(function (it) {
      if (isJunkItem(it)) junkCount += 1;
      else if (isSeriousItem(it)) serious += 1;
      if (isTaskLikeItem(it)) taskCount += 1;
    });

    var top = today
      .slice()
      .sort(function (a, b) {
        return priorityScore(b) - priorityScore(a) || parseItemDate(b) - parseItemDate(a);
      })
      .slice(0, 3);

    var topHtml = top.length
      ? top
          .map(function (it) {
            return (
              '<li><button type="button" class="tx-digest__pick" data-tx-digest-id="' +
              esc(it.id) +
              '">' +
              esc(it.title || it.path || 'Untitled') +
              '<span class="tx-digest__score mono">+' +
              esc(priorityScore(it)) +
              '</span></button></li>'
            );
          })
          .join('')
      : '<li class="tf-admin-muted">No prioritized items for today.</li>';

    body.innerHTML =
      '<ul class="tx-digest__stats mono">' +
      '<li><strong>' +
      esc(serious) +
      '</strong> serious</li>' +
      '<li><strong>' +
      esc(taskCount) +
      '</strong> tasks</li>' +
      '<li><strong>' +
      esc(junkCount) +
      '</strong> junk / raw</li>' +
      '</ul>' +
      '<p class="tx-digest__label tf-admin-muted">Top priority</p>' +
      '<ul class="tx-digest__top">' +
      topHtml +
      '</ul>';

    body.querySelectorAll('[data-tx-digest-id]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        openDetail(btn.getAttribute('data-tx-digest-id'));
      });
    });
  }

  function ensureHideJunkFilter() {
    var wrap = byId('txFilters');
    if (!wrap || wrap.querySelector('[data-tx-filter="hide-junk"]')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tx-pill';
    btn.setAttribute('data-tx-filter', 'hide-junk');
    btn.textContent = 'Hide junk';
    wrap.appendChild(btn);
  }

  function topBullets(item) {
    var list = item.bullets || [];
    if (!list.length) {
      if (item.summary) list = [item.summary];
      else if (item.taskText) list = [item.taskText];
      else if (item.decisionText) list = [item.decisionText];
      else if (item.issue) list = [item.issue];
    }
    return list.slice(0, 3);
  }

  function pipelineStatusLabel(status, ready) {
    if (ready || status === 'ready_for_site') {
      return { t: 'AI-ready', ok: true };
    }
    if (status === 'ai_processed') {
      return { t: 'AI processed (not published)', warn: true };
    }
    if (
      status === 'detected' ||
      status === 'raw_created' ||
      status === 'ai_processing_pending' ||
      status === 'ai_processing_running'
    ) {
      return { t: 'Waiting for AI processing', warn: true };
    }
    if (status === 'failed') return { t: 'Failed processing', warn: true };
    if (status === 'needs_review') return { t: 'Needs review', warn: true };
    return null;
  }

  function statChips(item) {
    var chips = [];
    var pipe = pipelineStatusLabel(item.pipelineStatus, item.readyForSite);
    if (pipe) chips.push(pipe);
    if (item.status) chips.push({ t: item.status, ok: item.status === 'done' || item.status === 'closed' });
    if (item.priority) chips.push({ t: item.priority });
    if (item.reviewed) chips.push({ t: 'Reviewed', ok: true });
    else chips.push({ t: 'Unreviewed', warn: true });
    if (item.googleSyncPending) chips.push({ t: 'Sync pending', warn: true });
    else if (item.googleSynced) chips.push({ t: 'Synced', ok: true });
    if (item.category === 'tasks' && item.dueDate) chips.push({ t: item.dueDate });
    return chips;
  }

  function applyClientFilters(list) {
    var out = list.slice().filter(isAiReadyItem);
    out = out.filter(function (it) {
      return it.category === state.category;
    });
    if (state.project) {
      out = out.filter(function (it) {
        return (it.project || '') === state.project;
      });
    }
    if (state.filters.today) {
      out = out.filter(function (it) {
        return isToday(parseItemDate(it));
      });
    }
    if (state.filters.week) {
      out = out.filter(function (it) {
        return isThisWeek(parseItemDate(it));
      });
    }
    if (state.filters.unreviewed) {
      out = out.filter(function (it) {
        return !it.reviewed;
      });
    }
    if (state.filters.syncPending) {
      out = out.filter(function (it) {
        return it.googleSyncPending;
      });
    }
    if (state.hideJunk) {
      out = out.filter(function (it) {
        return !isJunkItem(it);
      });
    }
    out.sort(function (a, b) {
      return parseItemDate(b) - parseItemDate(a);
    });
    return out;
  }

  function renderRingChart(chart) {
    var total = chart.reduce(function (s, c) {
      return s + c.value;
    }, 0);
    if (!total) return '';
    var r = 42;
    var cx = 50;
    var cy = 50;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var segs = chart
      .map(function (c) {
        var frac = c.value / total;
        var len = circ * frac;
        var dash = len + ' ' + (circ - len);
        var rot = (offset / circ) * 360 - 90;
        offset += len;
        return (
          '<circle cx="' +
          cx +
          '" cy="' +
          cy +
          '" r="' +
          r +
          '" fill="none" stroke="' +
          esc(c.color) +
          '" stroke-width="10" stroke-dasharray="' +
          dash +
          '" transform="rotate(' +
          rot +
          ' ' +
          cx +
          ' ' +
          cy +
          ')" />'
        );
      })
      .join('');
    var legend = chart
      .map(function (c) {
        return (
          '<span><span class="tx-ring__dot" style="background:' +
          esc(c.color) +
          '"></span>' +
          esc(c.label) +
          ' ' +
          esc(c.value) +
          '</span>'
        );
      })
      .join('');
    return (
      '<div class="tx-ring"><svg viewBox="0 0 100 100" role="img" aria-label="Category distribution">' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="var(--line,#2a2f3a)" stroke-width="10"/>' +
      segs +
      '<text x="50" y="52" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">' +
      esc(total) +
      '</text></svg><div class="tx-ring__legend">' +
      legend +
      '</div></div>'
    );
  }

  function renderDistribution() {
    var el = byId('txDistribution');
    if (!el) return;
    if (state.chart && state.chart.length) {
      el.innerHTML = renderRingChart(state.chart);
      el.hidden = false;
      el.removeAttribute('hidden');
      return;
    }
    el.innerHTML = '';
    el.hidden = true;
    el.setAttribute('hidden', '');
  }

  function renderStats() {
    var el = byId('txStats');
    if (!el) return;
    var c = state.counts || {};
    var rs = state.rawSources || {};
    var pipe = state.pipeline || {};
    var cards = [
      { label: 'Meeting summaries', n: c.meetings || 0 },
      { label: 'Personal notes', n: c.notes || 0 },
      { label: 'Extracted tasks', n: c.tasks || 0 },
      { label: 'Calendar events', n: c.calendar || 0 },
      { label: 'Project updates', n: c.projects || 0 },
      { label: 'Decisions', n: c.decisions || 0 },
      { label: 'Open points', n: c['open-points'] || 0 },
      { label: 'Sources waiting for AI', n: rs.waitingForProcessing || 0, muted: true },
      { label: 'Raw files on disk', n: rs.total != null ? rs.total : state.rawTranscriptionCount || 0, muted: true },
      { label: 'Needs review', n: state.needsReviewCount || 0, muted: true },
      {
        label: 'Last pipeline run',
        n: pipe.lastRun ? new Date(pipe.lastRun).toLocaleString() : '—',
        text: true,
      },
    ];
    el.innerHTML = cards
      .map(function (card) {
        var cls = 'tx-stat' + (card.muted ? ' tx-stat--muted' : '');
        return (
          '<div class="' +
          cls +
          '"><span class="tx-stat__n">' +
          esc(String(card.n)) +
          '</span><span class="tx-stat__l">' +
          esc(card.label) +
          '</span></div>'
        );
      })
      .join('');
  }

  function formatPipelineStatus(status) {
    var map = {
      detected: 'Detected',
      raw_created: 'Raw created',
      ai_processing_pending: 'Waiting for AI processing',
      ai_processing_running: 'AI processing running',
      ai_processed: 'AI processed (not on main list)',
      ready_for_site: 'AI-ready (published)',
      failed: 'Failed processing',
      needs_review: 'Needs review',
    };
    return map[status] || status || 'Unknown';
  }

  function renderRawSourcesBox() {
    var el = byId('txRawSources');
    if (!el) return;
    var rs = state.rawSources || {};
    var total = rs.total != null ? rs.total : state.rawTranscriptionCount || 0;
    var waiting = rs.waitingForProcessing || 0;
    var pending = rs.pendingSources || [];
    var rows = pending
      .slice(0, 24)
      .map(function (p) {
        var name =
          (p.rawTranscriptionPath && p.rawTranscriptionPath.split('/').pop()) ||
          p.sourceAudio ||
          p.id ||
          '—';
        var st = p.status || 'raw_created';
        var chip =
          st === 'failed' || st === 'needs_review'
            ? ' tx-pending-row__status--warn'
            : ' tx-pending-row__status--pending';
        return (
          '<li class="tx-pending-row"><span class="tx-pending-row__name mono">' +
          esc(name) +
          '</span><span class="tx-pending-row__status' +
          chip +
          '">' +
          esc(formatPipelineStatus(st)) +
          '</span></li>'
        );
      })
      .join('');
    el.innerHTML =
      '<h3 class="tx-raw-sources__title">Raw / Pending / Failed Sources</h3>' +
      '<p class="tx-raw-sources__note tf-admin-muted">Admin only. Shows detected, raw_created, ai_processing_pending, ai_processing_running, failed, and needs_review. Not mixed with AI-ready category lists above.</p>' +
      '<ul class="tx-raw-sources__list mono">' +
      '<li><strong>Raw files on disk:</strong> ' +
      esc(total) +
      ' <span class="tf-admin-muted">(archived sources, not the main feed)</span></li>' +
      '<li><strong>Waiting for AI / review:</strong> ' +
      esc(waiting) +
      '</li>' +
      '<li><strong>Latest raw file:</strong> ' +
      esc(rs.latestRawFile || '—') +
      '</li>' +
      '<li><strong>Latest AI-processed:</strong> ' +
      esc(rs.latestProcessedFile || '—') +
      '</li>' +
      '</ul>' +
      (rows
        ? '<ul class="tx-pending-list">' + rows + '</ul>'
        : '<p class="tf-admin-muted" style="margin:0.5rem 0 0;font-size:0.74rem">No pending or failed sources.</p>');
  }

  function renderCategoryButton(c, counts, activeKey) {
    var n = counts[c.key] != null ? counts[c.key] : 0;
    var active = activeKey === c.key ? ' is-active' : '';
    var theme = catTheme(c.key);
    return (
      '<button type="button" class="tx-cat-card' +
      active +
      '" data-tx-cat="' +
      esc(c.key) +
      '" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '" role="tab" aria-selected="' +
      (active ? 'true' : 'false') +
      '">' +
      iconSvg(c.key) +
      '<span class="tx-cat-card__n">' +
      esc(n) +
      '</span><span class="tx-cat-card__l">' +
      esc(c.short) +
      '</span></button>'
    );
  }

  function selectCategory(key) {
    state.category = key || 'meetings';
    renderCategoryCards();
    renderOverview();
    renderCategoryHeader();
    renderFeed();
    closeTxSheet();
  }

  function renderCategoryCards() {
    var el = byId('txCatScroll');
    var sheetList = byId('txCatSheetList');
    var counts = state.counts || {};
    var html = CATEGORIES.map(function (c) {
      return renderCategoryButton(c, counts, state.category);
    }).join('');
    if (el) {
      el.innerHTML = html;
      el.querySelectorAll('[data-tx-cat]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectCategory(btn.getAttribute('data-tx-cat'));
        });
      });
    }
    if (sheetList) {
      sheetList.innerHTML = html;
      sheetList.querySelectorAll('[data-tx-cat]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectCategory(btn.getAttribute('data-tx-cat'));
        });
      });
    }
    var mobileCat = byId('txMobileCatBtn');
    if (mobileCat) {
      var n = counts[state.category] != null ? counts[state.category] : 0;
      mobileCat.textContent = categoryShortLabel(state.category) + ' · ' + n;
      mobileCat.setAttribute('aria-label', 'Category: ' + categoryShortLabel(state.category));
    }
  }

  var openSheetId = null;

  function openTxSheet(id) {
    var sheet = byId(id);
    if (!sheet) return;
    closeTxSheet();
    openSheetId = id;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    if (id === 'txSearchSheet') {
      var search = byId('txSearch');
      if (search) setTimeout(function () { search.focus(); }, 120);
    }
  }

  function closeTxSheet() {
    if (!openSheetId) return;
    var sheet = byId(openSheetId);
    if (sheet) {
      sheet.classList.remove('is-open');
      sheet.setAttribute('aria-hidden', 'true');
    }
    openSheetId = null;
  }

  function closeCardMenus(except) {
    document.querySelectorAll('.tx-card__menu-pop.is-open').forEach(function (pop) {
      if (except && pop === except) return;
      pop.classList.remove('is-open');
      pop.hidden = true;
      var wrap = pop.closest('.tx-card__menu-wrap');
      if (wrap) {
        var t = wrap.querySelector('.tx-card__menu-btn');
        if (t) t.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function syncFilterPills() {

    var wrap = byId('txFilters');
    if (!wrap) return;
    wrap.querySelectorAll('[data-tx-filter]').forEach(function (btn) {
      var key = btn.getAttribute('data-tx-filter');
      var on = false;
      if (key === 'today') on = state.filters.today;
      if (key === 'week') on = state.filters.week;
      if (key === 'unreviewed') on = state.filters.unreviewed;
      if (key === 'sync-pending') on = state.filters.syncPending;
      if (key === 'hide-junk') on = state.hideJunk;
      btn.classList.toggle('is-active', on);
    });
  }

  function emptyState(kind) {
    var map = {
      none: {
        title: 'No AI-ready outputs yet',
        body: 'Run the Voice Recorder pipeline to create meetings, notes, tasks, and more.',
      },
      raw: {
        title: 'Raw sources only',
        body: 'Sources exist but are not yet converted into structured outputs.',
      },
      filter: { title: '', body: 'Try another category or clear filters.' },
      category: { title: '', body: 'Process voice recordings to publish AI-ready outputs here.' },
      search: { title: 'No search results', body: 'Try different keywords or clear search.' },
    };
    var cat = state.category || 'notes';
    var theme = catTheme(cat);
    var e = map[kind] || map.filter;
    if (kind === 'category' || (kind === 'filter' && !e.title)) {
      e = { title: 'No ' + categoryShortLabel(cat) + ' yet', body: e.body || map.category.body };
    }
    return (
      '<div class="tx-empty tx-empty--visual" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      '<div class="tx-empty__icon-wrap">' +
      iconSvg(cat).replace('tx-cat-card__icon', '') +
      '</div><p class="tx-empty__title">' +
      esc(e.title) +
      '</p><p class="tf-admin-muted" style="margin:0;font-size:0.78rem">' +
      esc(e.body) +
      '</p></div>'
    );
  }

  function outputBasename(item) {
    var p = item.path || item.filepath || '';
    if (!p) return '';
    var parts = p.split('/');
    return parts[parts.length - 1] || p;
  }

  function selectedCount() {
    return Object.keys(state.selectedIds).filter(function (id) {
      return state.selectedIds[id];
    }).length;
  }

  function transcriptionsSectionEl() {
    return byId('transcriptionsSection');
  }

  function maybeBulkOnboardToast() {
    try {
      if (localStorage.getItem(BULK_ONBOARDED_KEY) === '1') return;
      localStorage.setItem(BULK_ONBOARDED_KEY, '1');
    } catch (e) {
      /* ignore */
    }
    toast('Long-press to select · then bulk sync or mark read.');
  }

  function ensureBulkChrome() {
    var mobileBar = byId('txMobileBar');
    if (mobileBar && !byId('txBulkCounter')) {
      var counter = document.createElement('span');
      counter.id = 'txBulkCounter';
      counter.className = 'tx-bulk-counter mono';
      counter.setAttribute('aria-live', 'polite');
      counter.setAttribute('aria-atomic', 'true');
      mobileBar.insertBefore(counter, mobileBar.children[1] || null);
    }
    if (mobileBar && !byId('txBulkSelectBtn')) {
      var selBtn = document.createElement('button');
      selBtn.type = 'button';
      selBtn.id = 'txBulkSelectBtn';
      selBtn.className = 'tx-mobile-bar__icon tx-bulk-select-btn';
      selBtn.setAttribute('aria-label', 'Select items');
      selBtn.textContent = 'Sel';
      mobileBar.insertBefore(selBtn, byId('txMobileFilterBtn'));
    }
    var toolbar = document.querySelector('#transcriptionsSection .tx-toolbar-desktop');
    if (toolbar && !byId('txBulkCounterDesktop')) {
      var deskCounter = document.createElement('span');
      deskCounter.id = 'txBulkCounterDesktop';
      deskCounter.className = 'tx-bulk-counter tx-bulk-counter--desktop mono';
      deskCounter.setAttribute('aria-live', 'polite');
      deskCounter.setAttribute('aria-atomic', 'true');
      toolbar.appendChild(deskCounter);
    }
    if (toolbar && !byId('txBulkSelectBtnDesktop')) {
      var desk = document.createElement('button');
      desk.type = 'button';
      desk.id = 'txBulkSelectBtnDesktop';
      desk.className = 'tf-admin-toolbar__btn tx-bulk-select-btn';
      desk.textContent = 'Select';
      toolbar.appendChild(desk);
    }
    var section = transcriptionsSectionEl();
    if (section && !byId('txBulkBar')) {
      var bar = document.createElement('di' + 'v');
      bar.id = 'txBulkBar';
      bar.className = 'tx-bulk-bar';
      bar.setAttribute('aria-label', 'Bulk actions');
      bar.innerHTML =
        '<button type="button" id="txBulkSyncBtn" class="tf-admin-toolbar__btn">Sync to Google</button>' +
        '<button type="button" id="txBulkMarkBtn" class="tf-admin-toolbar__btn">Mark read</button>' +
        '<button type="button" id="txBulkCancelBtn" class="tf-admin-toolbar__btn">Cancel</button>';
      var feed = byId('txFeed');
      if (feed && feed.parentNode) feed.parentNode.insertBefore(bar, feed);
    }
  }

  function updateBulkUI() {
    ensureBulkChrome();
    var n = selectedCount();
    var bar = byId('txBulkBar');
    var syncBtn = byId('txBulkSyncBtn');
    var markBtn = byId('txBulkMarkBtn');
    var autoOn = !!state.syncSettings.auto_sync_google;
    if (bar) bar.classList.toggle('is-visible', state.selectMode);
    if (syncBtn) {
      syncBtn.textContent = 'Sync ' + n + ' item' + (n === 1 ? '' : 's') + ' to Google';
      syncBtn.disabled = autoOn || state.bulkSyncing || n < 1;
      syncBtn.title = autoOn ? 'Auto-sync is on — items sync individually' : '';
    }
    if (markBtn) {
      markBtn.textContent = 'Mark ' + n + ' read';
      markBtn.disabled = state.bulkSyncing || n < 1;
    }
    var cancelBtn = byId('txBulkCancelBtn');
    if (cancelBtn) cancelBtn.disabled = state.bulkSyncing;
    [byId('txBulkSelectBtn'), byId('txBulkSelectBtnDesktop')].forEach(function (btn) {
      if (btn) btn.classList.toggle('is-active', state.selectMode);
    });
    updateBulkCounter();
  }

  function updateBulkCounter() {
    var text = '';
    if (state.bulkSyncing) {
      text =
        'Syncing ' + state.bulkSyncProgress.done + '/' + state.bulkSyncProgress.total + '…';
    } else if (state.selectMode) {
      var n = selectedCount();
      text = n ? n + ' selected' : 'Tap cards to select';
    }
    [byId('txBulkCounter'), byId('txBulkCounterDesktop')].forEach(function (el) {
      if (el) el.textContent = text;
    });
  }

  function enterSelectMode(firstId) {
    closeOverlay();
    closeTxSheet();
    closeCardMenus();
    state.selectMode = true;
    if (firstId) state.selectedIds[firstId] = true;
    var section = transcriptionsSectionEl();
    if (section) section.classList.add('tx-admin--select-mode');
    updateBulkUI();
    renderFeed();
  }

  function exitSelectMode() {
    state.selectMode = false;
    state.selectedIds = {};
    state.bulkSyncing = false;
    state.bulkSyncProgress = { done: 0, total: 0 };
    state.itemSyncState = {};
    var section = transcriptionsSectionEl();
    if (section) section.classList.remove('tx-admin--select-mode');
    updateBulkUI();
    renderFeed();
  }

  function toggleSelectId(id) {
    if (!id) return;
    if (state.selectedIds[id]) delete state.selectedIds[id];
    else state.selectedIds[id] = true;
    updateBulkUI();
    renderFeed();
  }

  function runConcurrent(ids, worker, limit) {
    var index = 0;
    var active = 0;
    var results = [];
    return new Promise(function (resolve) {
      function pump() {
        if (index >= ids.length && active === 0) {
          resolve(results);
          return;
        }
        while (active < limit && index < ids.length) {
          var i = index++;
          active++;
          worker(ids[i], i)
            .then(function (r) {
              results[i] = r;
            })
            .catch(function (err) {
              results[i] = { ok: false, error: err };
            })
            .finally(function () {
              active--;
              pump();
            });
        }
      }
      pump();
    });
  }

  function retrySyncOne(id) {
    if (!id || state.bulkSyncing) return;
    state.itemSyncState[id] = 'syncing';
    updateBulkCounter();
    renderFeed();
    syncItem(id, { quiet: true, skipFeedRender: true }).then(function () {
      renderFeed();
      updateBulkUI();
    });
  }

  function runBulkSync() {
    if (state.syncSettings.auto_sync_google || state.bulkSyncing) return;
    var ids = Object.keys(state.selectedIds).filter(function (id) {
      return state.selectedIds[id];
    });
    if (!ids.length) return;
    state.bulkSyncing = true;
    state.bulkSyncProgress = { done: 0, total: ids.length };
    ids.forEach(function (id) {
      state.itemSyncState[id] = 'pending';
    });
    updateBulkUI();
    renderFeed();
    runConcurrent(
      ids,
      function (id) {
        state.itemSyncState[id] = 'syncing';
        updateBulkCounter();
        renderFeed();
        return syncItem(id, { quiet: true, skipFeedRender: true }).then(function (result) {
          state.bulkSyncProgress.done += 1;
          state.itemSyncState[id] = result.ok ? 'ok' : 'fail';
          updateBulkCounter();
          renderFeed();
          return result;
        });
      },
      BULK_SYNC_CONCURRENCY
    ).then(function (results) {
      state.bulkSyncing = false;
      var failed = results.filter(function (r) {
        return r && !r.ok;
      }).length;
      updateBulkUI();
      renderFeed();
      toast(failed ? 'Bulk sync finished with ' + failed + ' failure(s).' : 'Bulk sync finished.');
    });
  }

  function runBulkMarkRead() {
    if (state.bulkSyncing) return;
    var ids = Object.keys(state.selectedIds).filter(function (id) {
      return state.selectedIds[id];
    });
    if (!ids.length) return;
    state.bulkSyncing = true;
    state.bulkSyncProgress = { done: 0, total: ids.length };
    updateBulkUI();
    runConcurrent(
      ids,
      function (id) {
        return markReviewedRequest(id).then(function (result) {
          state.bulkSyncProgress.done += 1;
          updateBulkCounter();
          return result;
        });
      },
      BULK_SYNC_CONCURRENCY
    ).then(function (results) {
      state.bulkSyncing = false;
      results.forEach(function (r) {
        if (r && r.ok) {
          state.items.forEach(function (it) {
            if (it.id === r.id) it.reviewed = true;
          });
        }
      });
      updateBulkUI();
      renderFeed();
      toast('Marked selected items as read.');
    });
  }

  function bindBulkChrome() {
    ensureBulkChrome();
    var syncBtn = byId('txBulkSyncBtn');
    var markBtn = byId('txBulkMarkBtn');
    var cancelBtn = byId('txBulkCancelBtn');
    if (syncBtn && !syncBtn.dataset.txBound) {
      syncBtn.dataset.txBound = '1';
      syncBtn.addEventListener('click', runBulkSync);
    }
    if (markBtn && !markBtn.dataset.txBound) {
      markBtn.dataset.txBound = '1';
      markBtn.addEventListener('click', runBulkMarkRead);
    }
    if (cancelBtn && !cancelBtn.dataset.txBound) {
      cancelBtn.dataset.txBound = '1';
      cancelBtn.addEventListener('click', exitSelectMode);
    }
    [byId('txBulkSelectBtn'), byId('txBulkSelectBtnDesktop')].forEach(function (btn) {
      if (!btn || btn.dataset.txBound) return;
      btn.dataset.txBound = '1';
      btn.addEventListener('click', function () {
        if (state.selectMode) exitSelectMode();
        else enterSelectMode();
      });
    });
  }

  function clearLongPressTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function renderFeedCard(item) {
    var points = itemKeyPoints(item);
    var chips = itemFeedChips(item);
    var unread = !item.reviewed ? ' is-unread' : '';
    var junk = isJunkCard(item);
    var title = item.title || item.path || '';
    var catKey = String(item.category || 'notes').toLowerCase();
    var theme = catTheme(catKey);
    var audioName = audioBasename(item);
    var processed = formatProcessedDate(item);
    var metaRows =
      '<span class="tx-dash-card__meta-row"><span class="tx-dash-card__cat">' +
      esc(categoryShortLabel(item.category)) +
      '</span>' +
      (item.project
        ? '<span class="tx-dash-card__sep">·</span><span class="tx-dash-card__proj">' + esc(item.project) + '</span>'
        : '') +
      '</span>';
    if (audioName) {
      metaRows +=
        '<span class="tx-dash-card__meta-row tx-dash-card__meta--muted">from ' + esc(audioName) + '</span>';
    }
    if (processed) {
      metaRows +=
        '<span class="tx-dash-card__meta-row tx-dash-card__meta--muted">' + esc(processed) + '</span>';
    }
    var syncSt = state.itemSyncState[item.id] || '';
    var syncCls = syncSt ? ' tx-card--sync-' + syncSt : '';
    var isSelected = !!state.selectedIds[item.id];
    var roleAttrs = state.selectMode
      ? ' role="checkbox" aria-checked="' + (isSelected ? 'true' : 'false') + '"'
      : '';
    var pointsHtml = points.length
      ? '<div class="tx-dash-card__points-wrap"><h4 class="tx-dash-card__points-label">Key points</h4><ul class="tx-dash-card__points">' +
        points
          .map(function (p) {
            return '<li>' + esc(p) + '</li>';
          })
          .join('') +
        '</ul></div>'
      : '<p class="tx-dash-card__points-empty tf-admin-muted">Open for structured highlights</p>';
    return (
      '<article class="tx-dash-card tx-card' +
      unread +
      (junk ? ' tx-item--junk tx-item--junk-collapsed tx-card--junk tx-card--junk-collapsed' : '') +
      (state.selectMode ? ' tx-card--select-mode' : '') +
      (isSelected ? ' is-selected' : '') +
      syncCls +
      '" data-tx-id="' +
      esc(item.id) +
      '" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '"' +
      roleAttrs +
      ' tabindex="0">' +
      (state.selectMode ? '<span class="tx-dash-card__select" aria-hidden="true"></span>' : '') +
      itemCardVisual(item) +
      '<div class="tx-dash-card__body">' +
      '<div class="tx-dash-card__head-row">' +
      '<h3 class="tx-dash-card__title">' +
      esc(title) +
      '</h3></div>' +
      '<p class="tx-dash-card__meta">' +
      metaRows +
      '</p>' +
      pointsHtml +
      '<div class="tx-dash-card__chips">' +
      chips.map(renderDashChip).join('') +
      '</div>' +
      '<div class="tx-dash-card__actions">' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="open" data-tx-id="' +
      esc(item.id) +
      '">Open</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="read" data-tx-id="' +
      esc(item.id) +
      '"' +
      (item.reviewed ? ' disabled' : '') +
      '>Mark read</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="sync" data-tx-id="' +
      esc(item.id) +
      '">Sync Google</button>' +
      '</div></div></article>'
    );
  }

  function bindFeedActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-tx-action]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-tx-id');
        var action = btn.getAttribute('data-tx-action');
        if (action === 'open') openDetail(id);
        else if (action === 'read') markReviewed(id);
        else if (action === 'sync') syncItem(id);
        else if (action === 'copy') copyItem(id);
        closeCardMenus();
      });
    });
    root.querySelectorAll('.tx-card__menu-btn').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var pop = btn.parentElement && btn.parentElement.querySelector('.tx-card__menu-pop');
        if (!pop) return;
        var wasOpen = pop.classList.contains('is-open');
        closeCardMenus();
        if (!wasOpen) {
          pop.hidden = false;
          pop.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
    root.querySelectorAll('.tx-dash-card, .tx-card').forEach(function (card) {
      var id = card.getAttribute('data-tx-id');

      function onPointerDown() {
        if (state.selectMode || state.bulkSyncing) return;
        longPressDidTrigger = false;
        clearLongPressTimer();
        longPressTimer = setTimeout(function () {
          longPressDidTrigger = true;
          enterSelectMode(id);
          maybeBulkOnboardToast();
        }, LONG_PRESS_MS);
      }

      function onPointerUp() {
        clearLongPressTimer();
      }

      card.addEventListener('mousedown', onPointerDown);
      card.addEventListener('mouseup', onPointerUp);
      card.addEventListener('mouseleave', onPointerUp);
      card.addEventListener('touchstart', onPointerDown, { passive: true });
      card.addEventListener('touchend', onPointerUp);
      card.addEventListener('touchcancel', onPointerUp);

      card.addEventListener('click', function (ev) {
        if (longPressDidTrigger) {
          longPressDidTrigger = false;
          ev.preventDefault();
          return;
        }
        if (ev.target.closest('[data-tx-action]') || ev.target.closest('.tx-card__menu-wrap')) return;
        if (state.selectMode) {
          ev.preventDefault();
          if (state.itemSyncState[id] === 'fail') {
            retrySyncOne(id);
            return;
          }
          toggleSelectId(id);
          return;
        }
        if (
          card.classList.contains('tx-item--junk-collapsed') ||
          card.classList.contains('tx-card--junk-collapsed')
        ) {
          card.classList.remove('tx-item--junk-collapsed', 'tx-card--junk-collapsed');
          return;
        }
        openDetail(id);
      });
      card.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        card.click();
      });
    });
  }

  function renderFeed() {
    var feed = byId('txFeed');
    var hint = byId('txFeedHint');
    if (!feed) return;

    renderDigest();
    renderOverview();
    renderCategoryHeader();
    renderDistribution();

    var list;
    if (state.searchQuery.trim() && state.searchResults) {
      list = state.searchResults;
      if (state.hideJunk) {
        list = list.filter(function (it) {
          return !isJunkItem(it);
        });
      }
    } else if (state.searchQuery.trim() && state.searchLoading) {
      feed.innerHTML = '<p class="tf-admin-muted">Searching…</p>';
      if (hint) hint.textContent = '';
      return;
    } else {
      list = applyClientFilters(state.items);
    }

    state.filtered = list;

    if (!state.items.length && !state.loading) {
      feed.innerHTML =
        (state.rawTranscriptionCount || 0) > 0 && !(state.counts.total || 0)
          ? emptyState('raw')
          : emptyState('none');
      if (hint) hint.textContent = '';
      renderTimeline();
      return;
    }

    if (!list.length) {
      feed.innerHTML = state.searchQuery.trim() ? emptyState('search') : emptyState('category');
      if (hint) hint.textContent = '0 items';
      renderTimeline();
      return;
    }

    if (hint) hint.textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
    feed.innerHTML = renderFeedBody(list);
    bindFeedActions(feed);
    renderTimeline();
  }

  function renderTimeline() {
    var body = byId('txTimelineBody');
    if (!body) return;
    var todayItems = state.items
      .filter(function (it) {
        return isToday(parseItemDate(it));
      })
      .sort(function (a, b) {
        return parseItemDate(b) - parseItemDate(a);
      });
    if (!todayItems.length) {
      body.innerHTML = '<p class="tf-admin-muted" style="margin:0;font-size:0.74rem">Nessuna voce per oggi.</p>';
      return;
    }
    body.innerHTML = todayItems
      .map(function (it) {
        var t = parseItemDate(it);
        var time = t
          ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          : '—';
        return (
          '<div class="tx-timeline__item">' +
          '<span class="tx-timeline__time mono">' +
          esc(time) +
          '</span><span><strong>' +
          esc(it.categoryLabel || it.category) +
          '</strong> — ' +
          esc(it.title || '') +
          '</span></div>'
        );
      })
      .join('');
  }

  function relatedItems(item) {
    if (!item) return [];
    var audio = item.sourceAudio || '';
    var trans = item.sourceTranscription || '';
    return state.items
      .filter(function (it) {
        if (it.id === item.id) return false;
        if (audio && it.sourceAudio === audio) return true;
        if (trans && it.sourceTranscription === trans) return true;
        return false;
      })
      .slice(0, 12);
  }

  function sectionHtml(title, content) {
    if (!content) return '';
    return (
      '<details class="tx-detail__section" open><summary>' +
      esc(title) +
      '</summary><div>' +
      content +
      '</div></details>'
    );
  }

  function bulletsHtml(arr) {
    if (!arr || !arr.length) return '';
    return '<ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  function renderDetailContent(item) {
    var el = byId('txDetailScroll');
    var catEl = byId('txDetailCat');
    var titleEl = byId('txDetailTitle');
    if (!el || !item) return;
    var cat = item.category || 'notes';
    var theme = catTheme(cat);
    if (catEl) {
      catEl.textContent =
        CATEGORY_LABELS[item.category] || item.categoryLabel || item.category || '';
    }
    if (titleEl) titleEl.textContent = item.title || item.path || '';

    var points = itemDetailKeyPoints(item);
    var chips = dashStatChips(item);
    var segs = categoryDonutSegments(cat, [item]);
    var heroVisual = segs
      ? renderCompactRing(segs, 1)
      : renderLargeCategoryIcon(cat);

    var pointsBlock = points.length
      ? '<div class="tx-detail-points"><h4>Key points</h4><ul>' +
        points
          .map(function (p) {
            return '<li>' + esc(p) + '</li>';
          })
          .join('') +
        '</ul></div>'
      : '';

    var rel = relatedItems(item);
    var relHtml = rel.length
      ? '<div class="tx-detail__related">' +
        rel
          .map(function (r) {
            return (
              '<button type="button" class="tx-detail__related-card" data-tx-rel-id="' +
              esc(r.id) +
              '"><strong>' +
              esc(r.categoryLabel || r.category) +
              '</strong><br>' +
              esc(r.title || '') +
              '</button>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="tf-admin-muted">No related items from the same source.</p>';

    el.innerHTML =
      '<div class="tx-detail-hero" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      '<div>' +
      heroVisual +
      '</div>' +
      '<div>' +
      '<p class="tf-admin-muted" style="margin:0;font-size:0.72rem">' +
      esc(CATEGORY_LABELS[cat] || cat) +
      '</p>' +
      '<div class="tx-dash-card__chips" style="margin-top:0.35rem">' +
      chips.map(renderDashChip).join('') +
      '</div></div></div>' +
      pointsBlock +
      sectionHtml(
        'Source & meta',
        '<ul class="tf-admin-muted" style="margin:0;padding-left:1rem;font-size:0.74rem;line-height:1.5">' +
          '<li><strong>Project:</strong> ' +
          esc(item.project || '—') +
          '</li><li><strong>Processed:</strong> ' +
          esc(item.processedDate || '—') +
          '</li><li><strong>Audio:</strong> ' +
          esc(item.sourceAudio || '—') +
          '</li><li><strong>Transcription:</strong> <code>' +
          esc(item.sourceTranscription || item.source_transcription || '—') +
          '</code></li><li><strong>Output:</strong> <code>' +
          esc(item.path || item.filepath || '—') +
          '</code></li></ul>'
      ) +
      sectionHtml('Decisions', bulletsHtml(item.decisions)) +
      sectionHtml('Tasks', bulletsHtml(item.tasks)) +
      sectionHtml('Calendar', bulletsHtml(item.calendarEvents || item.calendar || [])) +
      sectionHtml('Open points', bulletsHtml(item.openPoints)) +
      sectionHtml('Next steps', bulletsHtml(item.nextSteps)) +
      sectionHtml('Related items', relHtml) +
      sectionHtml(
        'Full transcription reference',
        item.summary
          ? '<p style="font-size:0.78rem;line-height:1.45">' + esc(item.summary) + '</p>'
          : item.preview
            ? '<p style="font-size:0.78rem;line-height:1.45">' + esc(item.preview) + '</p>'
            : '<p class="tf-admin-muted">No extended reference text.</p>'
      ) +
      '<div class="tx-detail__actions">' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txDetailCopyBtn">Copy</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txDetailMarkBtn">Mark reviewed</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txDetailSyncBtn">Sync Google</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" disabled title="Coming soon">Reprocess</button>' +
      '</div>';


    el.querySelectorAll('[data-tx-rel-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openDetail(btn.getAttribute('data-tx-rel-id'));
      });
    });

    var syncBtn = byId('txDetailSyncBtn');
    if (syncBtn) syncBtn.addEventListener('click', function () { syncItem(item.id); });
    var markBtn = byId('txDetailMarkBtn');
    if (markBtn) markBtn.addEventListener('click', function () { markReviewed(item.id); });
    var copyBtn = byId('txDetailCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = [item.title]
          .concat(points)
          .concat([item.summary || ''])
          .filter(Boolean)
          .join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { toast('Copied.'); },
            function () { toast('Copy failed.'); }
          );
        } else {
          toast('Clipboard not available.');
        }
      });
    }
  }

  function openOverlay() {
    var ov = byId('txOverlay');
    if (!ov) return;
    ov.classList.add('is-open');
    ov.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay() {
    var ov = byId('txOverlay');
    if (!ov) return;
    ov.classList.remove('is-open');
    ov.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.selectedId = null;
    state.detailItem = null;
  }

  function copyItem(id) {
    var item = state.items.find(function (it) {
      return it.id === id;
    });
    if (!item) return;
    var points = itemKeyPoints(item);
    var text = [item.title]
      .concat(points)
      .concat([item.summary || ''])
      .filter(Boolean)
      .join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Copied.'); },
        function () { toast('Copy failed.'); }
      );
    } else {
      toast('Clipboard not available.');
    }
  }

  function openDetail(id) {
    if (!id) return;
    state.selectedId = id;
    var local = state.items.find(function (it) {
      return it.id === id;
    });
    if (local) {
      state.detailItem = local;
      renderDetailContent(local);
      openOverlay();
    }
    tryApi(['/api/admin/transcriptions/item?id=' + encodeURIComponent(id)], { method: 'GET' }).then(
      function (pack) {
        if (pack.ok && pack.j && (pack.j.item || pack.j.id)) {
          var item = normalizeItem(pack.j.item || pack.j);
          state.detailItem = item;
          var idx = state.items.findIndex(function (it) {
            return it.id === id;
          });
          if (idx >= 0) state.items[idx] = Object.assign(state.items[idx], item);
          renderDetailContent(item);
          openOverlay();
        } else if (!local && pack.status !== 404) {
          toast((pack.j && pack.j.error) || 'Could not load item.');
        }
      }
    );
  }

  function markReviewedRequest(id) {
    return tryApi(['/api/admin/transcriptions/mark-reviewed'], {
      method: 'POST',
      body: { id: id },
    }).then(function (pack) {
      return { id: id, ok: pack.ok, status: pack.status, j: pack.j };
    });
  }

  function markReviewed(id, opts) {
    opts = opts || {};
    return markReviewedRequest(id).then(function (result) {
      if (result.ok) {
        state.items.forEach(function (it) {
          if (it.id === id) it.reviewed = true;
        });
        if (state.detailItem && state.detailItem.id === id) state.detailItem.reviewed = true;
        if (!opts.skipFeedRender) renderFeed();
        if (state.detailItem) renderDetailContent(state.detailItem);
        if (!opts.quiet) toast('Marked as reviewed.');
      } else if (result.status === 404) {
        if (!opts.quiet) toast('Mark reviewed API not available yet.');
      } else if (!opts.quiet) {
        toast((result.j && result.j.error) || 'Could not mark reviewed.');
      }
      return result;
    });
  }

  function syncItemRequest(id) {
    return tryApi(['/api/admin/transcriptions/sync-item'], {
      method: 'POST',
      body: { id: id },
    }).then(function (pack) {
      return { id: id, ok: pack.ok, status: pack.status, j: pack.j };
    });
  }

  function syncItem(id, opts) {
    opts = opts || {};
    return syncItemRequest(id).then(function (result) {
      if (result.ok) {
        state.items.forEach(function (it) {
          if (it.id === id) {
            it.googleSyncPending = false;
            it.googleSynced = true;
          }
        });
        if (!opts.skipFeedRender) renderFeed();
        if (!opts.quiet) toast('Google sync queued.');
      } else if (result.status === 404) {
        if (!opts.quiet) toast('Google sync API not available yet.');
      } else if (!opts.quiet) {
        toast((result.j && result.j.error) || 'Sync failed.');
      }
      return result;
    });
  }

  function syncBulk(id) {
    tryApi(['/api/admin/transcriptions/sync-bulk'], {
      method: 'POST',
      body: { id: id },
    }).then(function (pack) {
      if (pack.ok) {
        toast('Bulk sync started.');
      } else if (pack.status === 404) {
        toast('Bulk sync API not available yet.');
      } else {
        toast((pack.j && pack.j.error) || 'Bulk sync failed.');
      }
    });
  }

  function runReindex() {
    if (reindexBusy) return;
    var btn = byId('txReindexBtn');
    if (btn && btn.disabled) return;

    reindexBusy = true;
    var previousHint = getLoadHintText();
    var btnLabel = btn ? btn.textContent : '';

    setReindexBtnDisabled(true);
    if (btn) btn.textContent = 'Indexing…';
    setLoadHint('Indexing…');

    function finishReindexUi() {
      window.setTimeout(function () {
        reindexBusy = false;
        setReindexBtnDisabled(false);
        if (btn) btn.textContent = btnLabel;
      }, REINDEX_DEBOUNCE_MS);
    }

    tryApi(['/api/admin/transcriptions/reindex'], { method: 'POST' })
      .then(function (pack) {
        if (pack.ok) {
          toast('Reindex complete.');
          loadIndex();
          return;
        }
        if (pack.status === 404) {
          setLoadHint('Reindex API not available — reload index only.');
          loadIndex();
          toast('Reindex endpoint not ready; refreshed index.');
          return;
        }
        var err = apiErrorMessage(pack, 'Reindex failed.');
        if (pack.status === 429) {
          setLoadHint(err);
        } else {
          setLoadHint(previousHint);
        }
        toast(err);
      })
      .catch(function () {
        setLoadHint(previousHint);
        toast('Network error during reindex.');
      })
      .then(finishReindexUi);
  }

  function saveSyncSettings(enabled) {
    tryApi(['/api/admin/transcriptions/sync-settings'], {
      method: 'PUT',
      body: { auto_sync_google: enabled },
    }).then(function (pack) {
      if (pack.ok) {
        state.syncSettings.auto_sync_google = enabled;
        toast(enabled ? 'Auto-sync enabled.' : 'Auto-sync disabled.');
        updateBulkUI();
      } else if (pack.status === 404) {
        state.syncSettings.auto_sync_google = enabled;
        toast('Sync settings API not available — preference kept locally.');
        updateBulkUI();
      } else {
        toast((pack.j && pack.j.error) || 'Could not save sync settings.');
        var tgl = byId('txAutoSyncToggle');
        if (tgl) tgl.checked = state.syncSettings.auto_sync_google;
      }
    });
  }

  function runSearch(q) {
    if (!q.trim()) {
      state.searchResults = null;
      state.searchLoading = false;
      renderFeed();
      return;
    }
    state.searchLoading = true;
    renderFeed();
    tryApi(['/api/admin/transcriptions/search?q=' + encodeURIComponent(q)], { method: 'GET' }).then(
      function (pack) {
        state.searchLoading = false;
        if (pack.ok && pack.j) {
          state.searchResults = (pack.j.items || pack.j.results || []).map(normalizeItem);
        } else if (pack.status === 404) {
          var ql = q.trim().toLowerCase();
          state.searchResults = state.items.filter(function (it) {
            var blob = [
              it.title,
              it.preview,
              it.summary,
              it.path,
              it.sourceAudio,
              it.project,
              it.body,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return blob.indexOf(ql) !== -1;
          });
        } else {
          state.searchResults = [];
          toast(apiErrorMessage(pack, 'Search failed.'));
        }
        renderFeed();
      }
    );
  }

  function loadIndex() {
    state.loading = true;
    setLoadHint('Loading…');
    var feed = byId('txFeed');
    if (feed) feed.setAttribute('aria-busy', 'true');

    return tryApi(['/api/admin/transcriptions/index', '/api/admin/transcriptions-index'], {
      method: 'GET',
    })
      .then(function (pack) {
        state.loading = false;
        if (feed) feed.setAttribute('aria-busy', 'false');
        if (!pack.ok) {
          state.apiUnavailable = pack.status === 404;
          setLoadHint(apiErrorMessage(pack, 'Could not load transcriptions.'));
          renderOverview();
          renderCategoryHeader();
          byId('txFeed').innerHTML = emptyState('none');
          return;
        }
        var norm = normalizeIndex(pack.j);
        state.items = norm.items;
        state.counts = norm.counts;
        state.rawTranscriptionCount = norm.rawTranscriptionCount;
        state.rawSources = norm.rawSources || {};
        state.pipeline = norm.pipeline || {};
        state.needsReviewCount = norm.needsReviewCount || 0;
        state.generatedAt = norm.generatedAt;
        state.indexMeta.projects = norm.projects;
        state.syncSettings = norm.syncSettings;
        state.hasChartData = norm.hasChartData;
        state.chart = norm.chart;
        state.searchResults = null;

        var tgl = byId('txAutoSyncToggle');
        if (tgl) tgl.checked = state.syncSettings.auto_sync_google;

        var rsHint = norm.rawSources || {};
        var waiting = rsHint.waitingForProcessing || 0;
        var rawOnDisk = rsHint.total != null ? rsHint.total : norm.rawTranscriptionCount || 0;
        setLoadHint(
          'Index ' +
            (norm.generatedAt ? new Date(norm.generatedAt).toLocaleString() : 'now') +
            ' · ' +
            (norm.counts.total || 0) +
            ' AI-ready output(s) · ' +
            waiting +
            ' source(s) waiting for AI' +
            (rawOnDisk ? ' · ' + rawOnDisk + ' raw file(s) archived' : '')
        );

        renderStats();
        renderRawSourcesBox();
        renderCategoryCards();
        renderProjectSelect();
        syncFilterPills();
        renderDistribution();
        renderFeed();
      })
      .catch(function () {
        state.loading = false;
        if (feed) feed.setAttribute('aria-busy', 'false');
        setLoadHint('Network error loading transcriptions.');
      });
  }

  function bindControls() {
    if (bound) return;
    bound = true;

    var reindex = byId('txReindexBtn');
    if (reindex) reindex.addEventListener('click', runReindex);

    var processRaw = byId('txProcessRawBtn');
    if (processRaw) {
      processRaw.addEventListener('click', function () {
        window.location.href = '/admin/voice-recorder';
      });
    }

    var tgl = byId('txAutoSyncToggle');
    if (tgl) {
      tgl.addEventListener('change', function () {
        saveSyncSettings(tgl.checked);
        updateBulkUI();
      });
    }

    state.hideJunk = loadHideJunkPref();
    ensureHideJunkFilter();

    var filters = byId('txFilters');
    if (filters) {
      filters.querySelectorAll('[data-tx-filter]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-tx-filter');
          if (key === 'today') state.filters.today = !state.filters.today;
          if (key === 'week') state.filters.week = !state.filters.week;
          if (key === 'unreviewed') state.filters.unreviewed = !state.filters.unreviewed;
          if (key === 'sync-pending') state.filters.syncPending = !state.filters.syncPending;
          if (key === 'hide-junk') {
            state.hideJunk = !state.hideJunk;
            saveHideJunkPref(state.hideJunk);
          }
          syncFilterPills();
          renderFeed();
        });
      });
      syncFilterPills();
    }

    var proj = byId('txProjectSelect');
    if (proj) {
      proj.addEventListener('change', function () {
        state.project = proj.value || '';
        renderFeed();
      });
    }

    var search = byId('txSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.searchQuery = search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          runSearch(state.searchQuery);
        }, 300);
      });
    }

    document.querySelectorAll('[data-tx-close]').forEach(function (el) {
      el.addEventListener('click', closeOverlay);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (state.selectMode) exitSelectMode();
        else if (openSheetId) closeTxSheet();
        else closeOverlay();
        closeCardMenus();
      }
    });

    bindBulkChrome();

    var mobileCat = byId('txMobileCatBtn');
    if (mobileCat) {
      mobileCat.addEventListener('click', function () {
        openTxSheet('txCatSheet');
      });
    }
    var mobileFilter = byId('txMobileFilterBtn');
    if (mobileFilter) {
      mobileFilter.addEventListener('click', function () {
        openTxSheet('txFilterSheet');
      });
    }
    var mobileSearch = byId('txMobileSearchBtn');
    if (mobileSearch) {
      mobileSearch.addEventListener('click', function () {
        openTxSheet('txSearchSheet');
      });
    }
    document.querySelectorAll('[data-tx-sheet]').forEach(function (el) {
      el.addEventListener('click', function () {
        closeTxSheet();
      });
    });
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('.tx-card__menu-wrap')) closeCardMenus();
    });
  }

  window.initAdminTranscriptions = function () {
    var section = byId('transcriptionsSection');
    if (section) {
      section.classList.add('tx-admin--dashboard');
      section.setAttribute('data-tx-dashboard-rev', String(window.TX_DASHBOARD_UI_REV || 0));
    }
    bindControls();
    renderOverview();
    renderCategoryHeader();
    renderDistribution();
    loadIndex();
  };
})();
