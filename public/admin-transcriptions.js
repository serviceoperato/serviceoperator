/**
 * Admin /admin/transcriptions — mobile-first feed UI for AI-ready voice outputs.
 */
(function () {
  'use strict';

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
  };

  var searchTimer = null;
  var bound = false;

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
    CATEGORIES.forEach(function (c, i) {
      var n = counts[c.key] != null ? counts[c.key] : 0;
      if (n > 0) {
        chart.push({ category: c.key, label: c.short, value: n, color: CHART_COLORS[i % CHART_COLORS.length] });
      }
    });
    return { hasChartData: chart.length > 1, chart: chart };
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

  function renderHero() {
    var el = byId('txHero');
    if (!el) return;
    if (state.hasChartData && state.chart && state.chart.length) {
      el.innerHTML = renderRingChart(state.chart);
      el.setAttribute('aria-hidden', 'false');
      return;
    }
    var cat = state.category === 'all' ? 'meetings' : state.category;
    el.innerHTML = iconSvg(cat).replace('tx-cat-card__icon', 'tx-hero__icon');
    el.setAttribute('aria-hidden', 'false');
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

  function renderCategoryCards() {
    var el = byId('txCatScroll');
    if (!el) return;
    var counts = state.counts || {};
    el.innerHTML = CATEGORIES.map(function (c) {
      var n = counts[c.key] != null ? counts[c.key] : 0;
      var active = state.category === c.key ? ' is-active' : '';
      return (
        '<button type="button" class="tx-cat-card' +
        active +
        '" data-tx-cat="' +
        esc(c.key) +
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
    }).join('');
    el.querySelectorAll('[data-tx-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.getAttribute('data-tx-cat') || 'meetings';
        renderCategoryCards();
        renderFeed();
      });
    });
  }

  function renderProjectSelect() {
    var sel = byId('txProjectSelect');
    if (!sel) return;
    var cur = state.project;
    var opts = '<option value="">All</option>';
    (state.indexMeta.projects || []).forEach(function (p) {
      opts += '<option value="' + esc(p) + '"' + (p === cur ? ' selected' : '') + '>' + esc(p) + '</option>';
    });
    sel.innerHTML = opts;
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
      btn.classList.toggle('is-active', on);
    });
  }

  function emptyState(kind) {
    var map = {
      none: {
        title: 'No AI-ready transcription outputs found yet',
        body: 'Run the Voice Recorder processing pipeline to convert raw transcriptions into meetings, notes, tasks, calendar events, project updates, decisions, and open points.',
      },
      raw: {
        title: 'Raw sources only',
        body: 'Raw transcription sources exist, but they have not yet been converted into AI-ready outputs. Use Process raw transcriptions (Voice Recorder page).',
      },
      filter: {
        title: 'No matches',
        body: 'Try clearing filters or choosing another category.',
      },
      search: {
        title: 'No search results',
        body: 'Try different keywords or clear the search field.',
      },
    };
    var e = map[kind] || map.filter;
    return (
      '<div class="tx-empty"><div class="tx-empty__icon">' +
      iconSvg(state.category).replace('tx-cat-card__icon', '') +
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

  function renderFeedCard(item) {
    var bullets = topBullets(item);
    var chips = statChips(item);
    if (!chips.some(function (c) { return c.t === 'AI-ready'; })) {
      chips.unshift({ t: 'AI-ready', ok: true });
    }
    var unread = !item.reviewed ? ' is-unread' : '';
    var outFile = outputBasename(item);
    return (
      '<article class="tx-card' +
      unread +
      '" data-tx-id="' +
      esc(item.id) +
      '"><div class="tx-card__head">' +
      iconSvg(item.category).replace('tx-cat-card__icon', 'tx-card__icon') +
      '<div class="tx-card__main"><h3 class="tx-card__title">' +
      esc(item.title || item.path) +
      '</h3><p class="tx-card__meta mono">' +
      esc(item.project || '—') +
      ' · ' +
      esc(relativeDate(item)) +
      (outFile ? ' · ' + esc(outFile) : '') +
      '</p>' +
      (bullets.length
        ? '<ul class="tx-card__bullets">' +
          bullets
            .map(function (b) {
              return '<li>' + esc(b) + '</li>';
            })
            .join('') +
          '</ul>'
        : '') +
      '<p class="tx-card__preview">' +
      esc(item.preview || '') +
      '</p><div class="tx-card__chips">' +
      chips
        .map(function (c) {
          var cls = 'tx-chip';
          if (c.ok) cls += ' tx-chip--ok';
          if (c.warn) cls += ' tx-chip--warn';
          return '<span class="' + cls + '">' + esc(c.t) + '</span>';
        })
        .join('') +
      '</div></div></div><div class="tx-card__actions">' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="sync" data-tx-id="' +
      esc(item.id) +
      '">Sync Google</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="read" data-tx-id="' +
      esc(item.id) +
      '">Mark read</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="open" data-tx-id="' +
      esc(item.id) +
      '">Open</button></div></article>'
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
      });
    });
    root.querySelectorAll('.tx-card').forEach(function (card) {
      card.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-tx-action]')) return;
        openDetail(card.getAttribute('data-tx-id'));
      });
    });
  }

  function renderFeed() {
    var feed = byId('txFeed');
    var hint = byId('txFeedHint');
    if (!feed) return;

    var list;
    if (state.searchQuery.trim() && state.searchResults) {
      list = state.searchResults;
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
      feed.innerHTML = state.searchQuery.trim() ? emptyState('search') : emptyState('filter');
      if (hint) hint.textContent = '0 items';
      renderTimeline();
      return;
    }

    if (hint) hint.textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
    feed.innerHTML = list.map(renderFeedCard).join('');
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
    if (catEl) {
      catEl.textContent =
        CATEGORY_LABELS[item.category] || item.categoryLabel || item.category || '';
    }
    if (titleEl) titleEl.textContent = item.title || item.path || '';

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
      : '<p class="tf-admin-muted">No related files.</p>';

    el.innerHTML =
      sectionHtml(
        'Meta',
        '<ul class="tf-admin-muted" style="margin:0;padding-left:1rem;font-size:0.74rem;line-height:1.5">' +
          '<li><strong>Project:</strong> ' +
          esc(item.project || '—') +
          '</li><li><strong>Processed:</strong> ' +
          esc(item.processedDate || '—') +
          '</li><li><strong>Audio:</strong> ' +
          esc(item.sourceAudio || '—') +
          '</li><li><strong>Transcription:</strong> <code>' +
          esc(item.sourceTranscription || item.source_transcription || '—') +
          '</code> <span class="tf-admin-muted">(raw source)</span></li><li><strong>Output file:</strong> <code>' +
          esc(item.path || item.filepath || '—') +
          '</code></li></ul>'
      ) +
      sectionHtml('Summary', item.summary ? '<p>' + esc(item.summary) + '</p>' : '') +
      sectionHtml('Decisions', bulletsHtml(item.decisions)) +
      sectionHtml('Tasks', bulletsHtml(item.tasks)) +
      sectionHtml('Open points', bulletsHtml(item.openPoints)) +
      sectionHtml('Next steps', bulletsHtml(item.nextSteps)) +
      sectionHtml(
        'Source transcription reference',
        item.sourceTranscription || item.source_transcription
          ? '<p class="mono" style="font-size:0.72rem">Raw source: <code>' +
            esc(item.sourceTranscription || item.source_transcription) +
            '</code> (not listed in the main feed)</p>'
          : '<p class="tf-admin-muted">No linked raw transcription file.</p>'
      ) +
      sectionHtml('Related items', relHtml) +
      '<div class="tx-detail__actions">' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txDetailCopyBtn">Copy item</button>' +
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
    var bulkBtn = byId('txDetailBulkSyncBtn');
    if (bulkBtn) bulkBtn.addEventListener('click', function () { syncBulk(item.id); });
    var markBtn = byId('txDetailMarkBtn');
    if (markBtn) markBtn.addEventListener('click', function () { markReviewed(item.id); });
    var copyBtn = byId('txDetailCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = [item.title, item.summary || item.preview].filter(Boolean).join('\n\n');
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

  function markReviewed(id) {
    tryApi(['/api/admin/transcriptions/mark-reviewed'], {
      method: 'POST',
      body: { id: id },
    }).then(function (pack) {
      if (pack.ok) {
        state.items.forEach(function (it) {
          if (it.id === id) it.reviewed = true;
        });
        if (state.detailItem && state.detailItem.id === id) state.detailItem.reviewed = true;
        renderFeed();
        if (state.detailItem) renderDetailContent(state.detailItem);
        toast('Marked as reviewed.');
      } else if (pack.status === 404) {
        toast('Mark reviewed API not available yet.');
      } else {
        toast((pack.j && pack.j.error) || 'Could not mark reviewed.');
      }
    });
  }

  function syncItem(id) {
    tryApi(['/api/admin/transcriptions/sync-item'], {
      method: 'POST',
      body: { id: id },
    }).then(function (pack) {
      if (pack.ok) {
        state.items.forEach(function (it) {
          if (it.id === id) {
            it.googleSyncPending = false;
            it.googleSynced = true;
          }
        });
        renderFeed();
        toast('Google sync queued.');
      } else if (pack.status === 404) {
        toast('Google sync API not available yet.');
      } else {
        toast((pack.j && pack.j.error) || 'Sync failed.');
      }
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
    var btn = byId('txReindexBtn');
    if (btn) btn.disabled = true;
    setLoadHint('Reindexing…');
    tryApi(['/api/admin/transcriptions/reindex'], { method: 'POST' }).then(function (pack) {
      if (btn) btn.disabled = false;
      if (pack.ok) {
        toast('Reindex complete.');
        loadIndex();
      } else if (pack.status === 404) {
        setLoadHint('Reindex API not available — reload index only.');
        loadIndex();
        toast('Reindex endpoint not ready; refreshed index.');
      } else {
        setLoadHint((pack.j && pack.j.error) || 'Reindex failed.');
        toast((pack.j && pack.j.error) || 'Reindex failed.');
      }
    });
  }

  function saveSyncSettings(enabled) {
    tryApi(['/api/admin/transcriptions/sync-settings'], {
      method: 'PUT',
      body: { auto_sync_google: enabled },
    }).then(function (pack) {
      if (pack.ok) {
        state.syncSettings.auto_sync_google = enabled;
        toast(enabled ? 'Auto-sync enabled.' : 'Auto-sync disabled.');
      } else if (pack.status === 404) {
        state.syncSettings.auto_sync_google = enabled;
        toast('Sync settings API not available — preference kept locally.');
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
          toast((pack.j && pack.j.error) || 'Search failed.');
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
          setLoadHint((pack.j && pack.j.error) || 'Could not load transcriptions.');
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
      });
    }

    var filters = byId('txFilters');
    if (filters) {
      filters.querySelectorAll('[data-tx-filter]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-tx-filter');
          if (key === 'today') state.filters.today = !state.filters.today;
          if (key === 'week') state.filters.week = !state.filters.week;
          if (key === 'unreviewed') state.filters.unreviewed = !state.filters.unreviewed;
          if (key === 'sync-pending') state.filters.syncPending = !state.filters.syncPending;
          syncFilterPills();
          renderFeed();
        });
      });
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
      if (ev.key === 'Escape') closeOverlay();
    });
  }

  window.initAdminTranscriptions = function () {
    bindControls();
    loadIndex();
  };
})();
