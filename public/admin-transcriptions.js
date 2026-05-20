/**
 * Admin /admin/transcriptions — visual dashboard for AI-ready voice outputs.
 */
(function () {
  'use strict';

  /** Bumped when dashboard markup/behavior changes (cache-bust aid). */
  window.TX_DASHBOARD_UI_REV = 20;

  /** Detail page: collapsed preview length for full transcription reference (chars). */
  var DETAIL_REF_PREVIEW_CHARS = 650;
  /** List/card preview: max words (index preview / cardSummary). */
  var CARD_PREVIEW_MAX_WORDS = 70;
  var CARD_PREVIEW_MIN_WORDS = 40;

  function txLog() {
    if (typeof console !== 'undefined' && console.log) {
      console.log.apply(console, ['[tx]'].concat([].slice.call(arguments)));
    }
  }

  var CATEGORIES = [
    { key: 'meetings', label: 'Meeting summaries', short: 'Meetings' },
    { key: 'notes', label: 'Personal notes', short: 'Notes' },
    { key: 'tasks', label: 'Tasks', short: 'Tasks' },
    { key: 'calendar', label: 'Calendar events', short: 'Calendar' },
    { key: 'projects', label: 'Project updates', short: 'Projects' },
    { key: 'decisions', label: 'Decision log', short: 'Decisions' },
    { key: 'open-points', label: 'Open points', short: 'Open' },
  ];

  /** Nav-only filter — not a content category folder. */
  var NAV_ALL_CATEGORY = { key: 'all', label: 'All transcriptions', short: 'All' };

  var CATEGORY_LABELS = {
    meetings: 'Meeting summary',
    notes: 'Personal note',
    tasks: 'Task',
    calendar: 'Calendar event',
    projects: 'Project update',
    decisions: 'Decision',
    'open-points': 'Open point',
  };

  var PRIMARY_CATEGORY_ALIASES = {
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

  function normalizePrimaryCategory(value, fallback) {
    var raw = String(value || '')
      .trim()
      .toLowerCase();
    if (PRIMARY_CATEGORY_ALIASES[raw]) return PRIMARY_CATEGORY_ALIASES[raw];
    var fb = String(fallback || 'notes').toLowerCase();
    var keys = CATEGORIES.map(function (c) {
      return c.key;
    });
    if (keys.indexOf(fb) !== -1) return fb;
    return PRIMARY_CATEGORY_ALIASES[fb] || 'notes';
  }

  function itemPrimaryCategory(item) {
    if (!item) return 'notes';
    return normalizePrimaryCategory(
      item.primaryCategory || item.mainCategory || item.category,
      'notes'
    );
  }

  var HIDE_JUNK_STORAGE_KEY = 'tf.tx.hideJunk';
  var FAVORITES_STORAGE_KEY = 'tf.tx.favorites';
  var SHOW_EMPTY_CATEGORIES_KEY = 'tf.tx.showEmptyCategories';
  var GROUP_BY_STORAGE_KEY = 'so_tx_group_by';
  var TIME_BUCKET_ORDER = ['today', 'yesterday', 'week', 'month', 'year', 'older'];
  var TIME_BUCKET_LABELS = {
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'This week',
    month: 'This month',
    year: 'This year',
    older: 'Older',
  };
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
    sourceCounts: {},
    filtered: [],
    searchResults: null,
    category: 'meetings',
    rawSources: {},
    pipeline: {},
    needsReviewCount: 0,
    filters: { today: false, week: false, unreviewed: false, syncPending: false },
    hideJunk: true,
    favoriteIds: {},
    showEmptyCategories: false,
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
    sortOrder: 'recent',
    groupByDate: 'processed',
  };

  var searchTimer = null;
  var bound = false;
  var indexLoadGen = 0;
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

  var ADMIN_JWT_KEY = 'so_admin_jwt';

  function adminJwt() {
    if (typeof window.getAdminBearer === 'function') return window.getAdminBearer() || '';
    if (typeof readStoredAdminJwt === 'function') return readStoredAdminJwt() || '';
    try {
      return localStorage.getItem(ADMIN_JWT_KEY) || sessionStorage.getItem(ADMIN_JWT_KEY) || '';
    } catch (eJwt) {
      return '';
    }
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

  var TX_PERSON_SCALAR_KEYS = [
    'owner',
    'assignedTo',
    'assignee',
    'madeBy',
    'decidedBy',
    'affectedBy',
    'speaker',
    'organizer',
    'facilitator',
  ];
  var TX_PERSON_ARRAY_KEYS = [
    'speakers',
    'participants',
    'people',
    'attendees',
    'names',
    'assignedTo',
  ];
  var TX_OWNER_PLACEHOLDER_RE = /^(owner\s+)?to\s+confirm$/i;

  function regexEscape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isPersonPlaceholder(name) {
    if (name == null) return true;
    var t = String(name).trim();
    if (!t || t === '—' || t === '-') return true;
    if (TX_OWNER_PLACEHOLDER_RE.test(t)) return true;
    if (/^unknown$/i.test(t) || /^unclear$/i.test(t)) return true;
    return false;
  }

  function pushPersonName(out, seen, name) {
    if (isPersonPlaceholder(name)) return;
    var t = String(name).trim();
    if (t.length < 2) return;
    var key = t.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(t);
  }

  function collectPeopleValues(val, out, seen) {
    if (val == null) return;
    if (Array.isArray(val)) {
      val.forEach(function (v) {
        collectPeopleValues(v, out, seen);
      });
      return;
    }
    if (typeof val === 'object') {
      if (val.name) pushPersonName(out, seen, val.name);
      if (val.speaker) pushPersonName(out, seen, val.speaker);
      if (val.label) pushPersonName(out, seen, val.label);
      return;
    }
    var parts = String(val).split(/[,;/|]+/);
    parts.forEach(function (p) {
      pushPersonName(out, seen, p);
    });
  }

  function extractPeopleFromItem(item) {
    if (!item) return [];
    var out = [];
    var seen = {};
    TX_PERSON_SCALAR_KEYS.forEach(function (key) {
      if (item[key] != null) collectPeopleValues(item[key], out, seen);
    });
    TX_PERSON_ARRAY_KEYS.forEach(function (key) {
      if (item[key] != null) collectPeopleValues(item[key], out, seen);
    });
    var ex = item.extracted_items || item.extractedItems;
    if (ex && typeof ex === 'object') {
      TX_PERSON_SCALAR_KEYS.forEach(function (key) {
        if (ex[key] != null) collectPeopleValues(ex[key], out, seen);
      });
      TX_PERSON_ARRAY_KEYS.forEach(function (key) {
        if (ex[key] != null) collectPeopleValues(ex[key], out, seen);
      });
    }
    var transcript = item.transcript || item.transcription;
    if (transcript && typeof transcript === 'object') {
      if (transcript.speakers) collectPeopleValues(transcript.speakers, out, seen);
      if (Array.isArray(transcript.segments)) {
        transcript.segments.forEach(function (seg) {
          if (seg && seg.speaker) pushPersonName(out, seen, seg.speaker);
        });
      }
    }
    if (item.transcriptSpeakers) collectPeopleValues(item.transcriptSpeakers, out, seen);
    if (Array.isArray(item.segments)) {
      item.segments.forEach(function (seg) {
        if (seg && seg.speaker) pushPersonName(out, seen, seg.speaker);
      });
    }
    return out;
  }

  function highlightPeopleInText(text, people) {
    if (!text) return '';
    var safe = esc(text);
    if (!people || !people.length) return safe;
    var sorted = people.slice().sort(function (a, b) {
      return b.length - a.length;
    });
    sorted.forEach(function (name) {
      if (!name || name.length < 2) return;
      var escapedName = regexEscape(esc(name));
      var re = new RegExp(escapedName, 'gi');
      safe = safe.replace(re, function (match) {
        return (
          '<strong class="tx-person">' +
          match +
          '</strong>'
        );
      });
    });
    return safe;
  }

  var TX_ROLE_NAMES = {
    padre: 'Padre',
    papa: 'Padre',
    papà: 'Padre',
    madre: 'Madre',
    mamma: 'Mamma',
    psicologa: 'Psicologa',
    psicologo: 'Psicologo',
    nonno: 'Nonno',
    nonna: 'Nonna',
  };
  var TX_SPEAKER_ALREADY_RE = /^([\wÀ-ÿ][\wÀ-ÿ\s.'-]{0,48})\s*:\s+/u;
  var TX_SPEECH_VERB_RE =
    '(?:ha\\s+detto(?:\\s+che)?|ha\\s+chiesto|ha\\s+deciso|ha\\s+promesso|ha\\s+richiesto|ha\\s+confermato|ha\\s+spiegato|ha\\s+affermato|ha\\s+sostenuto|ha\\s+proposto|hanno\\s+discusso|hanno\\s+deciso|chiede|dice|disse|afferma|sostiene|vuole|vogliono)';
  var TX_NAME_TOKEN = "[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’]+(?:\\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’]+)?";
  var TX_OWNER_SUFFIX_RE = /\s*\|\s*owner:\s*.+$/i;

  function stripOwnerSuffix(text) {
    return String(text || '')
      .replace(TX_OWNER_SUFFIX_RE, '')
      .trim();
  }

  function normalizeSpeakerName(raw, people) {
    var token = String(raw || '').trim();
    if (!token) return token;
    var low = token.toLowerCase();
    if (TX_ROLE_NAMES[low]) return TX_ROLE_NAMES[low];
    if (people && people.length) {
      for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (!p) continue;
        if (p.toLowerCase() === low || p.toLowerCase().indexOf(low + ' ') === 0) {
          return p.split(' ')[0];
        }
      }
    }
    return token.charAt(0).toUpperCase() + token.slice(1);
  }

  function nameAllowedForSpeaker(name, people) {
    if (!name || name.length < 2) return false;
    var low = name.toLowerCase();
    if (TX_ROLE_NAMES[low]) return true;
    for (var k in TX_ROLE_NAMES) {
      if (TX_ROLE_NAMES[k] === name) return true;
    }
    if (!people || !people.length) return /^[A-ZÀ-ÖØ-Ý]/.test(name);
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      if (!p) continue;
      var pl = p.toLowerCase();
      if (pl === low || pl.split(' ')[0] === low || pl.indexOf(low + ' ') === 0) return true;
    }
    return false;
  }

  function trimSpeechFraming(body) {
    var out = String(body || '').trim();
    var trimRe = new RegExp('^' + TX_SPEECH_VERB_RE + '\\s+(?:che\\s+)?', 'iu');
    for (var n = 0; n < 2; n++) {
      var next = out.replace(trimRe, '').trim();
      if (next === out) break;
      out = next;
    }
    return out;
  }

  function formatSpeakerLine(text, people) {
    if (!text) return text || '';
    people = people || [];
    var raw = stripOwnerSuffix(text);
    if (!raw) return raw;
    var lead = raw.match(TX_SPEAKER_ALREADY_RE);
    if (lead) {
      var bodyLead = trimSpeechFraming(raw.slice(lead[0].length));
      return bodyLead ? lead[1].trim() + ': ' + bodyLead : raw;
    }
    var patterns = [
      {
        re: new RegExp('^(?:[Hh]a\\s+detto|ha\\s+detto)\\s+(' + TX_NAME_TOKEN + ')\\s+che\\s+', 'u'),
        groups: 1,
      },
      {
        re: new RegExp(
          '^(?:[Ll]a\\s+|[Ii]l\\s+|[Ll]o\\s+|[Ii]\\s+|[Gg]li\\s+|[Ll]e\\s+)?(padre|madre|mamma|papà|papa|psicologa|psicologo|nonno|nonna)\\s+' +
            TX_SPEECH_VERB_RE +
            '\\s+',
          'iu'
        ),
        groups: 1,
      },
      {
        re: new RegExp('^(?:[Tt]ua\\s+|[Ss]ua\\s+)?(madre|padre|mamma|papà)\\s+' + TX_SPEECH_VERB_RE + '\\s+', 'iu'),
        groups: 1,
      },
      {
        re: new RegExp(
          '^(' + TX_NAME_TOKEN + ')\\s+e\\s+(' + TX_NAME_TOKEN + ')\\s+' + TX_SPEECH_VERB_RE + '\\s+',
          'iu'
        ),
        groups: 2,
      },
      {
        re: new RegExp('^(' + TX_NAME_TOKEN + ')\\s+' + TX_SPEECH_VERB_RE + '\\s+', 'iu'),
        groups: 1,
      },
    ];
    for (var pi = 0; pi < patterns.length; pi++) {
      var spec = patterns[pi];
      var m = raw.match(spec.re);
      if (!m) continue;
      var names;
      var body;
      if (spec.groups === 2) {
        var n1 = normalizeSpeakerName(m[1], people);
        var n2 = normalizeSpeakerName(m[2], people);
        if (!nameAllowedForSpeaker(n1, people) || !nameAllowedForSpeaker(n2, people)) continue;
        names = n1 + ' / ' + n2;
        body = trimSpeechFraming(raw.slice(m[0].length));
      } else {
        names = normalizeSpeakerName(m[1], people);
        if (!nameAllowedForSpeaker(names, people)) continue;
        body = trimSpeechFraming(raw.slice(m[0].length));
      }
      if (!body) return raw;
      return names + ': ' + body;
    }
    return raw;
  }

  function renderSpeakerText(text, people) {
    if (!text) return '';
    var formatted = formatSpeakerLine(text, people);
    var m = formatted.match(TX_SPEAKER_ALREADY_RE);
    if (!m) return highlightPeopleInText(formatted, people);
    var names = m[1].trim();
    var body = formatted.slice(m[0].length);
    return (
      '<strong class="tx-person tx-speaker">' +
      esc(names) +
      '</strong>: ' +
      highlightPeopleInText(body, people)
    );
  }

  function applySpeakerFormatToItem(item) {
    if (!item) return item;
    var people = extractPeopleFromItem(item);
    var fmt = function (s) {
      return s ? formatSpeakerLine(s, people) : s;
    };
    ['summary', 'preview', 'cardSummary', 'description', 'notes', 'decisionText', 'issue'].forEach(function (key) {
      if (typeof item[key] === 'string') item[key] = fmt(item[key]);
    });
    [
      'decisions',
      'tasks',
      'openPoints',
      'open_points',
      'nextSteps',
      'next_steps',
      'importantPoints',
      'important_points',
      'possibleActions',
      'possible_actions',
      'calendarEvents',
      'calendar_events',
      'blockers',
      'bullets',
    ].forEach(function (key) {
      if (Array.isArray(item[key])) item[key] = item[key].map(fmt);
    });
    var ex = item.extracted_items || item.extractedItems;
    if (ex && typeof ex === 'object') {
      Object.keys(ex).forEach(function (key) {
        if (Array.isArray(ex[key]) && ex[key].every(function (x) { return typeof x === 'string'; })) {
          ex[key] = ex[key].map(fmt);
        }
      });
    }
    return item;
  }

  function renderPersonBadge(name, extraClass) {
    return (
      '<span class="tx-person-badge' +
      (extraClass ? ' ' + extraClass : '') +
      '">' +
      esc(name) +
      '</span>'
    );
  }

  function renderPeopleInvolvedBlock(people, options) {
    options = options || {};
    if (!people || !people.length) return '';
    var chips = people
      .map(function (name) {
        return renderPersonBadge(name);
      })
      .join('');
    return (
      '<section class="tx-people-involved' +
      (options.compact ? ' tx-people-involved--compact' : '') +
      '" aria-label="People involved">' +
      '<h4>People involved</h4>' +
      '<div class="tx-people-involved__chips">' +
      chips +
      '</div></section>'
    );
  }

  function renderPeopleChipsRow(people, max) {
    if (!people || !people.length) return '';
    var slice = people.slice(0, max || 3);
    return (
      '<div class="tx-dash-card__people" aria-label="People">' +
      slice.map(function (name) {
        return renderPersonBadge(name);
      }).join('') +
      '</div>'
    );
  }

  function openPointOwnerDisplay(item) {
    var raw = item.owner || item.assignedTo;
    if (!raw || isPersonPlaceholder(raw)) {
      return { label: 'Owner to confirm', confirm: true, person: null };
    }
    return { label: String(raw).trim(), confirm: false, person: String(raw).trim() };
  }

  function renderCategoryPeopleMeta(item) {
    if (!item) return '';
    var cat = String(item.category || '').toLowerCase();
    var rows = [];
    if (cat === 'tasks') {
      var assignee = item.assignedTo || item.assignee || item.owner;
      if (assignee && !isPersonPlaceholder(assignee)) {
        rows.push(
          '<p class="tx-detail-person-meta"><span class="tx-detail-person-meta__label">Owner</span> ' +
            renderPersonBadge(assignee) +
            '</p>'
        );
      }
    } else if (cat === 'decisions') {
      var maker = item.madeBy || item.decidedBy;
      var affected = item.affectedBy;
      if (maker && !isPersonPlaceholder(maker)) {
        rows.push(
          '<p class="tx-detail-person-meta"><span class="tx-detail-person-meta__label">Decided by</span> ' +
            renderPersonBadge(maker) +
            '</p>'
        );
      }
      if (affected && !isPersonPlaceholder(affected)) {
        rows.push(
          '<p class="tx-detail-person-meta"><span class="tx-detail-person-meta__label">Affects</span> ' +
            renderPersonBadge(affected) +
            '</p>'
        );
      }
    } else if (cat === 'open-points') {
      var op = openPointOwnerDisplay(item);
      rows.push(
        '<p class="tx-detail-person-meta"><span class="tx-detail-person-meta__label">Owner</span> ' +
          (op.confirm
            ? renderPersonBadge(op.label, 'tx-person-badge--confirm')
            : renderPersonBadge(op.label)) +
          '</p>'
      );
    }
    return rows.length ? '<div class="tx-detail-person-fields">' + rows.join('') + '</div>' : '';
  }

  function bulletsHtml(arr, people) {
    if (!arr || !arr.length) return '';
    return (
      '<ul>' +
      arr
        .map(function (x) {
          var html = renderSpeakerText(x, people);
          return '<li>' + html + '</li>';
        })
        .join('') +
      '</ul>'
    );
  }

  function renderTranscriptSpeakersBlock(item, people) {
    var segments = (item.transcript && item.transcript.segments) || item.segments;
    if (!segments || !segments.length) return '';
    var lines = segments
      .map(function (seg) {
        var speaker = seg.speaker || seg.name || '';
        var text = seg.text || seg.content || '';
        if (!text) return '';
        var speakerHtml = speaker
          ? '<strong class="tx-person">' + esc(speaker) + '</strong>: '
          : '';
        return (
          '<p class="tx-transcript-line">' +
          speakerHtml +
          highlightPeopleInText(text, people) +
          '</p>'
        );
      })
      .filter(Boolean)
      .join('');
    if (!lines) return '';
    return '<div class="tx-transcript-speakers">' + lines + '</div>';
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function hideToast() {
    var el = byId('txToast');
    if (!el) return;
    clearTimeout(toast._t);
    toast._t = null;
    el.textContent = '';
    el.classList.remove('is-visible', 'is-error', 'is-sticky');
    el.removeAttribute('title');
    el.onclick = null;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
  }

  function toastPersist(msg) {
    var el = byId('txToast');
    if (!el) return;
    clearTimeout(toast._t);
    toast._t = null;
    el.textContent = msg;
    el.classList.add('is-visible', 'is-error', 'is-sticky');
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('title', 'Click to dismiss');
    el.onclick = function () {
      hideToast();
    };
  }

  function toast(msg) {
    var el = byId('txToast');
    if (!el) return;
    clearTimeout(toast._t);
    toast._t = null;
    el.onclick = null;
    el.removeAttribute('title');
    el.classList.remove('is-error', 'is-sticky');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = msg;
    el.classList.add('is-visible');
    toast._t = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2800);
  }

  function adminFetch(path, opts) {
    opts = opts || {};
    var headers = {};
    if (typeof window.adminAuthHeaders === 'function') {
      Object.assign(headers, window.adminAuthHeaders());
    } else {
      var jwt = adminJwt();
      if (jwt) headers.Authorization = 'Bearer ' + jwt;
    }
    Object.assign(headers, opts.headers || {});
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
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (j) {
            return { ok: r.ok, status: r.status, j: j, url: api(path) };
          });
      })
      .catch(function (err) {
        return {
          ok: false,
          status: 0,
          networkError: true,
          url: api(path),
          j: { error: err && err.message ? err.message : 'Network request failed' },
        };
      });
  }

  function formatIndexFetchError(pack, err) {
    var origin =
      typeof soApiOrigin === 'function' ? String(soApiOrigin() || '').trim() : '';
    var target = (pack && pack.url) || (typeof soApiUrl === 'function' ? soApiUrl('/api/admin/transcriptions/index') : '/api/admin/transcriptions/index');
    if (pack && pack.networkError) {
      var netMsg = (pack.j && pack.j.error) || 'Network request failed';
      return (
        netMsg +
        ' · GET ' +
        target +
        (origin ? ' · API origin ' + origin : ' · same-origin /api') +
        ' · Check console, so-api.js / SERVICEOPERA_API_UPSTREAM, or Rebuild index.'
      );
    }
    if (pack && pack.status) {
      var body = pack.j && (pack.j.error || pack.j.message);
      var snippet = body ? String(body).replace(/\s+/g, ' ').trim().slice(0, 140) : '';
      return (
        'Could not load transcriptions: HTTP ' +
        pack.status +
        ' · GET ' +
        target +
        (snippet ? ' — ' + snippet : '')
      );
    }
    if (err && err.message) {
      return 'Could not load transcriptions: ' + err.message + ' · GET ' + target;
    }
    return 'Could not load transcriptions. · GET ' + target;
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
  var TITLE_MAX_WORDS = 12;
  var UNCLEAR_ITEM_TITLE = 'Unclear audio / Needs review';
  var TRAILING_DATE_RE = /\s*[—–-]\s*(?:\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2})\s*$/;

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

  function txKeyPointsLib() {
    return window.TxKeyPoints || null;
  }

  function isValidKeyPoint(text) {
    var lib = txKeyPointsLib();
    if (lib) return lib.isValidKeyPoint(text);
    var s = String(text || '').trim().toLowerCase();
    return !!(
      s &&
      s !== '(none)' &&
      s !== 'none' &&
      s !== 'n/a' &&
      s !== 'null' &&
      s !== 'undefined'
    );
  }

  function keyPointsEmptyFallback() {
    var lib = txKeyPointsLib();
    return lib ? lib.EMPTY_FALLBACK : 'No strong key points detected. Review the summary below.';
  }

  function keyPointsSectionTitle(count) {
    var lib = txKeyPointsLib();
    return lib ? lib.keyPointsHeading(count) : count === 3 ? 'Top 3 key points' : 'Top key points';
  }

  var CATEGORY_THEME = {
    all: { accent: '#64748b', subtitle: 'Every AI-ready transcription' },
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

  function txTopicVisuals() {
    return window.TxTopicVisuals || null;
  }

  function txContentNumbers() {
    return window.TxContentNumbers || null;
  }

  /** Numeric breakdowns per category (≥2 states → donut). Colors align with catTheme accents. */
  var CATEGORY_SEGMENT_DEFS = {
    meetings: [
      { key: 'reviewed', label: 'Reviewed', color: '#10b981' },
      { key: 'needsReview', label: 'Needs review', color: '#f59e0b' },
    ],
    notes: [
      { key: 'processed', label: 'Processed', color: '#10b981' },
      { key: 'pending', label: 'Pending', color: '#94a3b8' },
    ],
    tasks: [
      { key: 'open', label: 'Open', color: '#f59e0b' },
      { key: 'done', label: 'Done', color: '#10b981' },
      { key: 'unclear', label: 'Unclear', color: '#94a3b8' },
    ],
    calendar: [
      { key: 'dated', label: 'Dated', color: '#8b5cf6' },
      { key: 'toConfirm', label: 'To confirm', color: '#ef4444' },
      { key: 'unclear', label: 'Unclear', color: '#94a3b8' },
    ],
    projects: [
      { key: 'categorized', label: 'Categorized', color: '#f59e0b' },
      { key: 'uncategorized', label: 'Uncategorized', color: '#cbd5e1' },
    ],
    decisions: [
      { key: 'confirmed', label: 'Confirmed', color: '#10b981' },
      { key: 'needsReview', label: 'Needs review', color: '#ef4444' },
    ],
    'open-points': [
      { key: 'unresolved', label: 'Unresolved', color: '#64748b' },
      { key: 'assigned', label: 'Assigned', color: '#4f46e5' },
      { key: 'unclear', label: 'Unclear', color: '#eab308' },
    ],
  };

  function aiReadyItems() {
    return state.items.filter(function (it) {
      if (!isAiReadyItem(it)) return false;
      if (state.hideJunk && isJunkItem(it)) return false;
      return true;
    });
  }

  var PRIMARY_SOURCE_CATEGORY_ORDER = [
    'meetings',
    'notes',
    'projects',
    'tasks',
    'calendar',
    'decisions',
    'open-points',
  ];

  function isSourceEntry(item) {
    return !!(
      item &&
      (item.isSourceEntry ||
        item.source_entry ||
        item.item_type === 'source_entry' ||
        (item.extractedCategories && item.extractedCategories.length) ||
        (item.sourceEntries && item.sourceEntries.length > 1))
    );
  }

  function itemSourceKey(it) {
    var raw = it.sourceTranscription || it.source_transcription;
    if (raw) {
      if (raw.indexOf('content/') !== 0) {
        raw = 'content/transcriptions/' + String(raw).replace(/^.*[\\/]/, '');
      }
      return raw;
    }
    var audio = it.sourceAudio || it.source_audio;
    if (audio) return 'audio:' + String(audio).trim().toLowerCase();
    return 'path:' + (it.path || it.filepath || it.id || '');
  }

  function mergeStringList(a, b) {
    var seen = {};
    var out = [];
    function add(val) {
      var t = String(val || '').trim();
      if (!t) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
    }
    (a || []).forEach(add);
    (b || []).forEach(add);
    return out;
  }

  function mergeExtractedItems(a, b) {
    var out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(function (key) {
      var val = b[key];
      if (!out[key]) {
        out[key] = Array.isArray(val) ? val.slice() : val;
      } else if (Array.isArray(out[key]) && Array.isArray(val)) {
        var seen = {};
        out[key] = out[key].concat(val).filter(function (entry) {
          var k = typeof entry === 'object' ? JSON.stringify(entry) : String(entry);
          if (seen[k]) return false;
          seen[k] = true;
          return true;
        });
      }
    });
    return out;
  }

  function pickPrimaryFromGroup(group) {
    var byCat = {};
    group.forEach(function (it) {
      byCat[String(it.category || '')] = it;
    });
    var i;
    for (i = 0; i < PRIMARY_SOURCE_CATEGORY_ORDER.length; i++) {
      var cat = PRIMARY_SOURCE_CATEGORY_ORDER[i];
      if (byCat[cat]) return byCat[cat];
    }
    return group[0];
  }

  function extractionSnapshot(child) {
    return {
      id: child.id,
      category: child.category,
      title: child.title,
      path: child.path || child.filepath,
      preview: child.preview,
      summary: child.summary,
      project: child.project,
      date: child.date,
      dueDate: child.dueDate,
      eventDate: child.eventDate,
      status: child.status,
      extracted_items: child.extracted_items || child.extractedItems || {},
    };
  }

  function groupFlatItemsToSources(flatItems) {
    var groups = {};
    flatItems.forEach(function (it) {
      var key = itemSourceKey(it);
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    });
    var entries = [];
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      var primary = pickPrimaryFromGroup(group);
      var primaryCat = itemPrimaryCategory(primary);
      group.forEach(function (child) {
        var mc =
          (child.extracted_items && child.extracted_items.main_category) ||
          child.main_category ||
          child.mainCategory;
        if (mc) primaryCat = normalizePrimaryCategory(mc, child.category);
      });
      var categories = [];
      var extractions = {};
      var mergedExtracted = {};
      var mergedRawSections = {};
      var mergedStats = {
        tasks_count: 0,
        calendar_events_count: 0,
        decisions_count: 0,
        open_points_count: 0,
      };
      var childIds = [];
      group.forEach(function (child) {
        var cat = String(child.category || '');
        if (cat) {
          if (!extractions[cat]) extractions[cat] = [];
          extractions[cat].push(extractionSnapshot(child));
        }
        mergedExtracted = mergeExtractedItems(mergedExtracted, child.extracted_items || child.extractedItems || {});
        mergedRawSections = Object.assign(mergedRawSections, child.raw_sections || child.rawSections || {});
        var st = child.stats || {};
        mergedStats.tasks_count += st.tasks_count || 0;
        mergedStats.calendar_events_count += st.calendar_events_count || 0;
        mergedStats.decisions_count += st.decisions_count || 0;
        mergedStats.open_points_count += st.open_points_count || 0;
        if (child.id) childIds.push(child.id);
      });
      if (mergedStats.tasks_count > 0) categories.push('tasks');
      if (mergedStats.calendar_events_count > 0) categories.push('calendar');
      if (mergedStats.decisions_count > 0) categories.push('decisions');
      if (mergedStats.open_points_count > 0) categories.push('open-points');
      var entry = Object.assign({}, primary, {
        id: 'src_' + key.replace(/[^a-z0-9]+/gi, '').slice(0, 8) + '_' + String(primary.id || '').slice(0, 8),
        item_type: 'source_entry',
        isSourceEntry: true,
        source_entry: true,
        category: primaryCat,
        primaryCategory: primaryCat,
        mainCategory: primaryCat,
        categories: categories,
        extractedCategories: categories,
        hasTasks: mergedStats.tasks_count > 0,
        hasCalendar: mergedStats.calendar_events_count > 0,
        hasDecisions: mergedStats.decisions_count > 0,
        hasOpenPoints: mergedStats.open_points_count > 0,
        stats: mergedStats,
        extractions: extractions,
        extracted_items: mergedExtracted,
        extractedItems: mergedExtracted,
        raw_sections: mergedRawSections,
        rawSections: mergedRawSections,
        childIds: childIds,
        related_files: [],
        sourceKey: key,
        sourceGroupKey: key,
        reviewed: group.every(function (c) {
          return !!c.reviewed;
        }),
      });
      group.forEach(function (child) {
        entry.decisions = mergeStringList(entry.decisions, child.decisions);
        entry.tasks = mergeStringList(entry.tasks, child.tasks);
        entry.openPoints = mergeStringList(entry.openPoints, child.open_points || child.openPoints);
        entry.nextSteps = mergeStringList(entry.nextSteps, child.next_steps || child.nextSteps);
        entry.importantPoints = mergeStringList(
          entry.importantPoints,
          child.important_points || child.importantPoints
        );
        entry.calendarEvents = mergeStringList(
          entry.calendarEvents,
          child.calendar_events || child.calendarEvents
        );
        entry.possibleActions = mergeStringList(
          entry.possibleActions,
          child.possible_actions || child.possibleActions
        );
      });
      entries.push(applyCardCopyFields(entry));
    });
    return sortItemsNewestFirst(entries, false);
  }

  function sourceHasCategory(item, cat) {
    if (!item || !cat) return false;
    if (cat === 'all') return true;
    return itemPrimaryCategory(item) === cat;
  }

  function extractionCountForCategory(item, cat) {
    var st = item.stats || {};
    if (cat === 'tasks') return sectionCountFrom(item.tasks, st.tasks_count);
    if (cat === 'calendar') {
      return sectionCountFrom(item.calendarEvents || item.calendar_events, st.calendar_events_count);
    }
    if (cat === 'decisions') return sectionCountFrom(item.decisions, st.decisions_count);
    if (cat === 'open-points') {
      return sectionCountFrom(item.openPoints || item.open_points, st.open_points_count);
    }
    if (cat === 'projects') {
      var updates =
        (item.extracted_items && item.extracted_items.project_updates) ||
        (item.extractedItems && item.extractedItems.project_updates) ||
        [];
      return Array.isArray(updates) ? updates.length : 0;
    }
    return 0;
  }

  function itemSecondaryExtractionBadges(item) {
    var badges = [];
    var cats = item.extractedCategories || item.categories || [];
    function has(cat) {
      return cats.indexOf(cat) !== -1;
    }
    if (item.hasTasks || has('tasks')) badges.push('Tasks');
    if (item.hasCalendar || has('calendar')) badges.push('Calendar');
    if (item.hasDecisions || has('decisions')) badges.push('Decisions');
    if (item.hasOpenPoints || has('open-points')) badges.push('Open points');
    if (item.hasProjects || has('projects')) badges.push('Projects');
    return badges;
  }

  function categoryItems(cat) {
    if (cat === 'all') return aiReadyItems().slice();
    return aiReadyItems().filter(function (it) {
      return sourceHasCategory(it, cat);
    });
  }

  function categoryCount(key) {
    if (key === 'all') return aiReadyItems().length;
    var sourceCounts = state.sourceCounts || {};
    if (sourceCounts[key] != null) return sourceCounts[key];
    return categoryItems(key).length;
  }

  function refreshDashboardCounts() {
    var pack = countsFromItems(aiReadyItems());
    state.counts = pack.extraction;
    state.sourceCounts = pack.source;
    var chartPack = buildChartFromCounts(pack.source);
    state.chart = chartPack.chart;
    state.hasChartData = chartPack.hasChartData;
    ensureActiveCategory();
  }

  function shouldShowCategory(key) {
    if (key === 'all') return true;
    if (state.showEmptyCategories) return true;
    return categoryCount(key) > 0;
  }

  function categoriesForNav() {
    return [NAV_ALL_CATEGORY].concat(
      CATEGORIES.filter(function (c) {
        return shouldShowCategory(c.key);
      })
    );
  }

  function ensureActiveCategory() {
    if (state.category === 'all') return;
    if (shouldShowCategory(state.category)) return;
    var first = categoriesForNav()[0];
    if (first) state.category = first.key;
  }

  function loadShowEmptyCategoriesPref() {
    try {
      return localStorage.getItem(SHOW_EMPTY_CATEGORIES_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveShowEmptyCategoriesPref(on) {
    try {
      localStorage.setItem(SHOW_EMPTY_CATEGORIES_KEY, on ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  function toggleShowEmptyCategories() {
    state.showEmptyCategories = !state.showEmptyCategories;
    saveShowEmptyCategoriesPref(state.showEmptyCategories);
    ensureActiveCategory();
    renderCategoryCards();
    renderOverview();
    renderCategoryHeader();
    renderStats();
    renderDistribution();
    renderFeed();
  }

  function renderEmptyCategoriesToggle() {
    var el = byId('txShowEmptyCats');
    if (!el) {
      var anchor = byId('txOverview') || byId('txCatScroll');
      if (!anchor || !anchor.parentNode) return;
      el = document.createElement('p');
      el.id = 'txShowEmptyCats';
      el.className = 'tx-show-empty-cats';
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
    var hidden = CATEGORIES.filter(function (c) {
      return categoryCount(c.key) === 0;
    }).length;
    if (!hidden) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var label = state.showEmptyCategories ? 'Hide empty categories' : 'Show empty categories';
    el.innerHTML =
      '<button type="button" class="tx-show-empty-cats__btn tf-admin-muted" data-tx-toggle-empty-cats>' +
      esc(label) +
      '</button>';
    var btn = el.querySelector('[data-tx-toggle-empty-cats]');
    if (btn && !btn.dataset.txBound) {
      btn.dataset.txBound = '1';
      btn.addEventListener('click', function () {
        toggleShowEmptyCategories();
      });
    }
  }

  function truncatePoint(s, max) {
    var t = String(s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '\u2026';
  }

  function uniquePoints(list, maxChars) {
    var limit = maxChars === undefined ? KEY_POINT_MAX : maxChars;
    var seen = {};
    var out = [];
    list.forEach(function (p) {
      var t = limit > 0 ? truncatePoint(p, limit) : String(p || '').trim();
      if (!t || !isValidKeyPoint(t)) return;
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

  function splitTextToPoints(text, max, maxChars) {
    var t = String(text || '').trim();
    if (!t || isGenericPlaceholderText(t)) return [];
    var parts = t
      .split(/(?<=[.!?])\s+|[\n;•]+/)
      .map(function (s) {
        return s.replace(/^[-*•]\s*/, '').trim();
      })
      .filter(function (s) {
        return s.length > 8 && !isGenericPlaceholderText(s) && isValidKeyPoint(s);
      });
    return uniquePoints(parts, maxChars).slice(0, max || 3);
  }

  function shortenToWords(text, maxWords) {
    var words = String(text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return '';
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ');
  }

  function stripTrailingDate(text) {
    return String(text || '')
      .replace(TRAILING_DATE_RE, '')
      .trim();
  }

  function textOverlaps(a, b) {
    if (!a || !b) return false;
    var ka = normalizeCompareKey(a);
    var kb = normalizeCompareKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    if (ka.length >= 12 && (ka.indexOf(kb) !== -1 || kb.indexOf(ka) !== -1)) return true;
    return false;
  }

  function isLowQualityTranscriptionItem(item) {
    if (!item) return false;
    if (item.needs_review || item.needsReview) return true;
    var body = item.summary || item.preview || '';
    if (isGenericPlaceholderText(body) && !(item.importantPoints || []).length && !(item.bullets || []).length) {
      return true;
    }
    if (isJunkItem(item) && !hasExtractedActions(item)) return true;
    var blob = itemText(item);
    if (blob.toLowerCase().indexOf('| confidence: low') !== -1) return true;
    return false;
  }

  function taskActionTitle(taskText) {
    var t = stripTrailingDate(String(taskText || ''));
    t = t.replace(/^\s*-\s*\[\s*\]\s+/, '').replace(/\s*\(from [^)]+\)\s*$/i, '').trim();
    return shortenToWords(t, TITLE_MAX_WORDS) || t;
  }

  function itemDisplayTitle(item) {
    if (!item) return '';
    if (isLowQualityTranscriptionItem(item)) return UNCLEAR_ITEM_TITLE;
    if (isSourceEntry(item)) {
      var extractions = item.extractions || {};
      var pickOrder = ['notes', 'meetings', 'tasks', 'calendar', 'projects', 'decisions', 'open-points'];
      var i;
      for (i = 0; i < pickOrder.length; i++) {
        var kids = extractions[pickOrder[i]];
        if (kids && kids.length && kids[0].title) {
          var picked = shortenToWords(stripTrailingDate(kids[0].title), TITLE_MAX_WORDS);
          if (picked && !isGenericPlaceholderText(picked)) return picked;
        }
      }
    }
    var cat = String(item.category || 'notes').toLowerCase();
    var raw = String(item.rawTitle || item.title || item.path || '').trim();
    if (cat === 'tasks') {
      var taskLine = (item.tasks && item.tasks[0]) || item.taskText || raw;
      if (taskLine) return taskActionTitle(taskLine);
    }
    return shortenToWords(stripTrailingDate(raw), TITLE_MAX_WORDS) || raw;
  }

  function filterDistinctFromTitle(title, list) {
    return (list || []).filter(function (p) {
      return p && isValidKeyPoint(p) && !textOverlaps(title, p) && !isGenericPlaceholderText(p);
    });
  }

  function formatMetaDateLabel(dateVal) {
    if (!dateVal) return '';
    try {
      var d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch (eDate) {
      /* ignore */
    }
    return String(dateVal).trim();
  }

  function taskMetaKeyPoints(item, title) {
    var pts = [];
    var dateLabel = formatMetaDateLabel(item.date || item.eventDate || item.dueDate);
    if (dateLabel) pts.push('Date mentioned: ' + dateLabel);
    if (item.project) pts.push('Related project: ' + item.project);
    if (audioBasename(item) || item.sourceAudio) pts.push('Source audio detected');
    var people = extractPeopleFromItem(item);
    if (people.length) pts.push('Owner: ' + people[0]);
    if (!item.reviewed) pts.push('Status: open');
    return filterDistinctFromTitle(title, pts);
  }

  function lowQualityKeyPoints(item, title) {
    var pts = ['Source audio detected', 'Transcription quality is low', 'Manual review needed'];
    if (!audioBasename(item) && !item.sourceAudio) {
      pts.shift();
    }
    return filterDistinctFromTitle(title, pts);
  }

  function wordCount(text) {
    var m = String(text || '').match(/\b\w+\b/g);
    return m ? m.length : 0;
  }

  function cardPreviewFromFull(fullText) {
    var t = String(fullText || '').trim();
    if (!t) return '';
    var wc = wordCount(t);
    if (wc <= CARD_PREVIEW_MAX_WORDS) return t;
    return shortenToWords(t, CARD_PREVIEW_MAX_WORDS) + '\u2026';
  }

  function cardPreviewText(item) {
    if (!item) return '';
    var card = String(item.cardSummary || item.preview || '').trim();
    if (card && !textLooksTruncated(card) && wordCount(card) <= CARD_PREVIEW_MAX_WORDS) {
      return card;
    }
    var full = itemDetailSummary(item) || itemSummaryParagraph(item);
    if (!full) return card;
    return cardPreviewFromFull(full);
  }

  function itemSummaryForDisplay(item, title, points) {
    return cardPreviewText(item);
  }

  function applyCardCopyFields(item) {
    if (!item) return item;
    item.rawTitle = item.rawTitle || item.title || '';
    var title = itemDisplayTitle(item);
    var points = itemKeyPoints(item);
    item.title = title;
    var card = itemSummaryForDisplay(item, title, points);
    if (card) {
      item.preview = card;
      item.cardSummary = card;
    } else if (item.preview && textOverlaps(title, item.preview)) {
      item.preview = '';
      item.cardSummary = '';
    }
    return item;
  }

  function buildKeyPoints(item, maxChars) {
    var title = itemDisplayTitle(item);
    if (isLowQualityTranscriptionItem(item)) {
      return uniquePoints(lowQualityKeyPoints(item, title), maxChars).slice(0, 3);
    }
    var cat = String(item.category || 'notes').toLowerCase();
    var pool = [];
    if (cat === 'tasks') {
      pool = pool.concat(taskMetaKeyPoints(item, title));
    }
    pool = pool.concat(pointValuesForKeys(item, CATEGORY_POINT_KEYS[cat] || []));
    if (!pool.length) pool = pointValuesForKeys(item, KEY_POINT_FALLBACK_KEYS);
    pool = pool.filter(function (p) {
      return isValidKeyPoint(p) && !isGenericPlaceholderText(p);
    });
    if (!pool.length && item.decisionText) pool.push(item.decisionText);
    if (!pool.length && item.issue) pool.push(item.issue);
    if (!pool.length && item.summary) pool = pool.concat(splitTextToPoints(item.summary, 3, maxChars));
    if (!pool.length && item.preview) pool = pool.concat(splitTextToPoints(item.preview, 3, maxChars));
    pool = filterDistinctFromTitle(title, pool);
    pool = pool.filter(function (p) {
      return isValidKeyPoint(p) && !isGenericPlaceholderText(p);
    });
    if (!pool.length) return [];
    return uniquePoints(pool, maxChars).slice(0, 3);
  }

  function itemKeyPoints(item) {
    return buildKeyPoints(item, KEY_POINT_MAX);
  }

  function itemDetailKeyPoints(item) {
    return buildKeyPoints(item, 0);
  }

  function txItemDetailPath(id) {
    return '/admin/transcriptions/item/' + encodeURIComponent(String(id || ''));
  }

  function parseTxDetailIdFromPath(pathname) {
    var path = String(pathname != null ? pathname : window.location.pathname || '')
      .replace(/\/+$/, '') || '/';
    var m = path.match(/\/admin\/transcriptions\/item\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function isTranscriptionDetailRoute() {
    return !!parseTxDetailIdFromPath();
  }

  function isTranscriptionsListRoute() {
    return txShellPath() === '/admin/transcriptions';
  }

  function navigateToDetail(id, replace) {
    if (!id) return;
    var href = txItemDetailPath(id);
    if (typeof adminShellNavigate === 'function' && adminShellNavigate(href, null, !!replace)) {
      if (typeof window.initAdminTranscriptionDetail === 'function') {
        window.initAdminTranscriptionDetail();
      }
      return;
    }
    if (replace) window.location.replace(href);
    else window.location.assign(href);
  }

  function itemSummaryParagraph(item) {
    var fields = [item.summary, item.preview, item.description, item.notes];
    for (var i = 0; i < fields.length; i++) {
      var t = String(fields[i] || '').trim();
      if (t && !isGenericPlaceholderText(t)) return t;
    }
    return '';
  }

  function itemNextActionLine(item) {
    var steps = item.nextSteps || [];
    if (steps.length) return String(steps[0] || '').trim();
    var actions = item.possibleActions || [];
    if (actions.length) return String(actions[0] || '').trim();
    return '';
  }

  function itemRawSections(item) {
    return item.raw_sections || item.rawSections || {};
  }

  function parseMarkdownSections(text) {
    var sections = {};
    if (!text) return sections;
    String(text)
      .split(/\n(?=##\s+)/)
      .forEach(function (part) {
        var m = part.match(/^##\s+([^\n]+)\n([\s\S]*)/);
        if (m) sections[m[1].trim()] = m[2].trim();
      });
    return sections;
  }

  function isNoneSectionText(t) {
    return !t || /^\(none(\s+extracted)?\)?\.?$/i.test(String(t).trim());
  }

  function sectionTextFromItem(item, names) {
    var raw = itemRawSections(item);
    var i;
    for (i = 0; i < names.length; i++) {
      var fromRaw = raw[names[i]];
      if (fromRaw && !isNoneSectionText(fromRaw)) return String(fromRaw).trim();
    }
    if (item.fullContent) {
      var parsed = parseMarkdownSections(item.fullContent);
      for (i = 0; i < names.length; i++) {
        var fromMd = parsed[names[i]];
        if (fromMd && !isNoneSectionText(fromMd)) return String(fromMd).trim();
      }
    }
    return '';
  }

  function textLooksTruncated(t) {
    var s = String(t || '').trim();
    return /\u2026$/.test(s) || /\.{3}$/.test(s);
  }

  function itemDetailSummary(item) {
    var full = sectionTextFromItem(item, ['Summary', 'Clean Summary', 'Clean summary']);
    if (full) return full;
    var fallback = itemSummaryParagraph(item);
    if (fallback && !textLooksTruncated(fallback)) return fallback;
    if (item.fullContent) {
      full = sectionTextFromItem(item, ['Summary', 'Clean Summary', 'Clean summary']);
      if (full) return full;
    }
    return fallback || '';
  }

  function extractTranscriptionBody(md) {
    if (!md) return '';
    var cleaned = String(md).replace(/^<!--[\s\S]*?-->\s*/m, '').trim();
    var sections = parseMarkdownSections(cleaned);
    if (sections.Transcription && !isNoneSectionText(sections.Transcription)) {
      return sections.Transcription.trim();
    }
    return cleaned;
  }

  function resolveFullTranscriptionReference(item) {
    if (item.sourceTranscriptionContent) {
      return extractTranscriptionBody(item.sourceTranscriptionContent);
    }
    var refHint = sectionTextFromItem(item, ['Full Transcription Reference']);
    if (refHint && !/^See\s+`/i.test(refHint)) return refHint;
    return refHint || '';
  }

  function detailProseHtml(text, people) {
    if (!text) return '';
    return (
      '<div class="tx-detail-page__prose tx-detail-prose">' +
      renderSpeakerText(text, people) +
      '</div>'
    );
  }

  function renderFullTranscriptionReferenceBlock(item) {
    var text = resolveFullTranscriptionReference(item);
    var meta =
      (item.sourceTranscription
        ? '<p class="tx-detail-ref__meta"><strong>Source file:</strong> <code>' +
          esc(item.sourceTranscription) +
          '</code></p>'
        : '') +
      (item.path || item.filepath
        ? '<p class="tx-detail-ref__meta"><strong>Output:</strong> <code>' +
          esc(item.path || item.filepath) +
          '</code></p>'
        : '');
    if (!text) {
      return (
        meta +
        '<p class="tf-admin-muted">Full reference text loads when the detail API returns the source transcription file.</p>'
      );
    }
    var needsExpand = text.length > DETAIL_REF_PREVIEW_CHARS;
    var previewPart = needsExpand ? text.slice(0, DETAIL_REF_PREVIEW_CHARS) : text;
    return (
      '<div class="tx-detail-ref-wrap" data-tx-full-ref>' +
      meta +
      '<div class="tx-detail-ref tx-detail-ref--full' +
      (needsExpand ? ' is-collapsed' : '') +
      '">' +
      '<div class="tx-detail-ref__scroll">' +
      '<pre class="tx-detail-ref__text"><span class="tx-detail-ref__preview">' +
      esc(previewPart) +
      (needsExpand ? '\u2026' : '') +
      '</span>' +
      (needsExpand
        ? '<span class="tx-detail-ref__remainder" hidden>' +
          esc(text.slice(DETAIL_REF_PREVIEW_CHARS)) +
          '</span>'
        : '') +
      '</pre></div></div>' +
      '<div class="tx-detail-ref__toolbar">' +
      (needsExpand
        ? '<button type="button" class="tf-admin-toolbar__btn tx-detail-ref__toggle" data-tx-ref-toggle aria-expanded="false">Show full transcription</button>'
        : '') +
      '<button type="button" class="tf-admin-toolbar__btn tx-detail-ref__copy" data-tx-ref-copy>Copy full reference</button>' +
      '</div></div>'
    );
  }

  function bindDetailReferenceControls(root, item) {
    if (!root) return;
    var wrap = root.querySelector('[data-tx-full-ref]');
    if (!wrap) return;
    var text = resolveFullTranscriptionReference(item);
    var toggle = wrap.querySelector('[data-tx-ref-toggle]');
    var remainder = wrap.querySelector('.tx-detail-ref__remainder');
    var refEl = wrap.querySelector('.tx-detail-ref');
    if (toggle && remainder && refEl) {
      toggle.addEventListener('click', function () {
        var expanded = toggle.getAttribute('aria-expanded') === 'true';
        if (expanded) {
          remainder.setAttribute('hidden', '');
          refEl.classList.add('is-collapsed');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.textContent = 'Show full transcription';
        } else {
          remainder.removeAttribute('hidden');
          refEl.classList.remove('is-collapsed');
          toggle.setAttribute('aria-expanded', 'true');
          toggle.textContent = 'Collapse';
        }
      });
    }
    var copyBtn = wrap.querySelector('[data-tx-ref-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (!text) {
          toast('Nothing to copy.');
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              toast('Full reference copied.');
            },
            function () {
              toast('Copy failed.');
            }
          );
        } else {
          toast('Clipboard not available.');
        }
      });
    }
  }

  function detailSectionCard(title, bodyHtml) {
    if (!bodyHtml) return '';
    return (
      '<article class="tx-detail-page__card tx-text--full"><h3 class="tx-detail-page__card-title">' +
      esc(title) +
      '</h3><div class="tx-detail-page__card-body tx-text--full">' +
      bodyHtml +
      '</div></article>'
    );
  }

  function detailListSection(title, arr, people) {
    if (!arr || !arr.length) return '';
    return detailSectionCard(title, bulletsHtml(arr, people));
  }

  function detailFieldTable(rows) {
    var html = rows
      .filter(function (row) {
        if (!row) return false;
        if (row.html) return true;
        return row.value != null && String(row.value).trim();
      })
      .map(function (row) {
        var cell = row.html
          ? row.html
          : row.code
            ? '<code>' + esc(row.value) + '</code>'
            : esc(row.value);
        return (
          '<tr><th scope="row">' +
          esc(row.label) +
          '</th><td>' +
          cell +
          '</td></tr>'
        );
      })
      .join('');
    if (!html) return '';
    return '<table class="tx-detail-page__fields"><tbody>' + html + '</tbody></table>';
  }

  function detailRelatedLinks(items) {
    if (!items || !items.length) return '';
    return (
      '<div class="tx-detail-page__related">' +
      items
        .map(function (r) {
          return (
            '<a class="tx-detail-page__related-link" href="' +
            esc(txItemDetailPath(r.id)) +
            '"><strong>' +
            esc(r.categoryLabel || r.category) +
            '</strong><span>' +
            esc(r.title || '') +
            '</span></a>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function detailSourceRefBlock(item) {
    var rows = [
      { label: 'Source audio', value: audioBasename(item) || item.sourceAudio },
      { label: 'Source transcription', value: item.sourceTranscription, code: true },
      { label: 'Output file', value: item.path || item.filepath, code: true },
    ];
    var table = detailFieldTable(rows);
    if (!table) return '';
    return detailSectionCard('Source reference', table);
  }

  function mergedExtractionLines(item, cat) {
    var lines = [];
    var children = (item.extractions || {})[cat] || [];
    children.forEach(function (child) {
      var ex = child.extracted_items || child.extractedItems || {};
      if (cat === 'tasks') {
        lines = lines.concat(ex.tasks || []);
        if (child.title) lines.push(child.title);
      } else if (cat === 'calendar') {
        lines = lines.concat(ex.calendar_events || []);
        if (child.title) lines.push(child.title);
      } else if (cat === 'decisions') {
        lines = lines.concat(ex.decisions || []);
        if (child.title) lines.push(child.title);
      } else if (cat === 'open-points') {
        lines = lines.concat(ex.open_points || []);
        if (child.title) lines.push(child.title);
      } else if (child.preview) {
        lines.push(child.preview);
      } else if (child.title) {
        lines.push(child.title);
      }
    });
    return lines;
  }

  function detailSourceExtractionsSections(item) {
    var people = extractPeopleFromItem(item);
    var html = renderCategoryPeopleMeta(item);
    html +=
      detailListSection('Decisions', item.decisions || mergedExtractionLines(item, 'decisions'), people) +
      detailListSection('Tasks', item.tasks || mergedExtractionLines(item, 'tasks'), people) +
      detailListSection('Open points', item.openPoints || mergedExtractionLines(item, 'open-points'), people) +
      detailListSection('Next steps', item.nextSteps, people) +
      detailListSection('Important points', item.importantPoints, people) +
      detailListSection('Possible actions', item.possibleActions, people) +
      detailListSection(
        'Calendar events',
        item.calendarEvents || mergedExtractionLines(item, 'calendar'),
        people
      ) +
      detailListSection('Blockers', item.blockers, people);
    var cats = item.categories || [];
    if (cats.length) {
      html += detailSectionCard(
        'Content from this source',
        '<p class="tf-admin-muted">' +
          esc(
            cats
              .map(function (c) {
                return CATEGORY_LABELS[c] || c;
              })
              .join(' · ')
          ) +
          '</p>'
      );
    }
    return html + detailSourceRefBlock(item);
  }

  function detailOperationalSections(item) {
    if (isSourceEntry(item)) return detailSourceExtractionsSections(item);
    var cat = String(item.category || 'notes').toLowerCase();
    var people = extractPeopleFromItem(item);
    var html = renderCategoryPeopleMeta(item);
    var rel = relatedItems(item);
    var relTasks = rel.filter(function (r) {
      return r.category === 'tasks';
    });
    var relCal = rel.filter(function (r) {
      return r.category === 'calendar';
    });
    var relMeetNotes = rel.filter(function (r) {
      return r.category === 'meetings' || r.category === 'notes';
    });

    if (cat === 'meetings') {
      html +=
        detailListSection('Decisions', item.decisions, people) +
        detailListSection('Tasks', item.tasks, people) +
        detailListSection('Open points', item.openPoints, people) +
        detailListSection('Next steps', item.nextSteps, people) +
        detailSourceRefBlock(item);
    } else if (cat === 'notes') {
      html +=
        detailListSection('Important points', item.importantPoints, people) +
        detailListSection('Possible actions', item.possibleActions, people) +
        (relTasks.length ? detailSectionCard('Related tasks', detailRelatedLinks(relTasks)) : '') +
        (relCal.length ? detailSectionCard('Related calendar', detailRelatedLinks(relCal)) : '') +
        detailSourceRefBlock(item);
    } else if (cat === 'tasks') {
      var taskLine = (item.tasks && item.tasks[0]) || item.taskText || item.title;
      var taskOwner = item.assignedTo || item.assignee || item.owner;
      var taskRows = [
            { label: 'Task', value: taskLine },
            { label: 'Status', value: item.status || taskStatusBucket(item) },
            { label: 'Due date', value: item.dueDate },
            { label: 'Project', value: item.project },
            { label: 'Source audio', value: audioBasename(item) || item.sourceAudio },
            {
              label: 'Related note / meeting',
              value: relMeetNotes.length
                ? relMeetNotes
                    .map(function (r) {
                      return r.title;
                    })
                    .join('; ')
                : '',
            },
          ];
      if (taskOwner && !isPersonPlaceholder(taskOwner)) {
        taskRows.splice(1, 0, {
          label: 'Owner',
          html: renderPersonBadge(taskOwner),
        });
      }
      html +=
        detailSectionCard('Task', detailFieldTable(taskRows)) + detailSourceRefBlock(item);
    } else if (cat === 'calendar') {
      var calLines = item.calendarEvents || [];
      var eventTitle = calLines[0] || item.title;
      html +=
        detailSectionCard(
          'Calendar event',
          detailFieldTable([
            { label: 'Event title', value: eventTitle },
            { label: 'Date', value: item.eventDate || item.date },
            { label: 'Time', value: item.eventTime },
            { label: 'Status', value: item.status || item.confidence },
            { label: 'Source audio', value: audioBasename(item) || item.sourceAudio },
            {
              label: 'Related task / note',
              value: rel.length
                ? rel
                    .map(function (r) {
                      return r.title;
                    })
                    .join('; ')
                : '',
            },
          ])
        ) + detailSourceRefBlock(item);
    } else if (cat === 'projects') {
      html +=
        detailSectionCard(
          'Project update',
          itemDetailSummary(item) ? detailProseHtml(itemDetailSummary(item), people) : ''
        ) +
        detailListSection('Decisions', item.decisions, people) +
        detailListSection('Tasks', item.tasks, people) +
        detailListSection('Blockers', item.blockers, people) +
        detailListSection('Next steps', item.nextSteps, people) +
        detailSourceRefBlock(item);
    } else if (cat === 'decisions') {
      var decisionRows = [
        { label: 'Decision', value: item.decisionText || (item.decisions && item.decisions[0]) },
        { label: 'Context', value: item.context },
        { label: 'Reason', value: item.reason },
        { label: 'Related project', value: item.project },
      ];
      var decidedBy = item.madeBy || item.decidedBy;
      var affects = item.affectedBy;
      if (decidedBy && !isPersonPlaceholder(decidedBy)) {
        decisionRows.push({ label: 'Decided by', html: renderPersonBadge(decidedBy) });
      }
      if (affects && !isPersonPlaceholder(affects)) {
        decisionRows.push({ label: 'Affects', html: renderPersonBadge(affects) });
      }
      html +=
        detailSectionCard('Decision', detailFieldTable(decisionRows)) + detailSourceRefBlock(item);
    } else if (cat === 'open-points') {
      var opOwner = openPointOwnerDisplay(item);
      html +=
        detailSectionCard(
          'Open point',
          detailFieldTable([
            { label: 'Question / issue', value: item.issue || item.title },
            {
              label: 'Owner',
              html: opOwner.confirm
                ? renderPersonBadge(opOwner.label, 'tx-person-badge--confirm')
                : renderPersonBadge(opOwner.label),
            },
            { label: 'Deadline', value: item.deadline || item.dueDate || item.eventDate },
            { label: 'Related project', value: item.project },
            { label: 'Next step', value: (item.nextSteps && item.nextSteps[0]) || '' },
          ])
        ) + detailSourceRefBlock(item);
    }
    return html;
  }

  function detailNavList() {
    if (state.filtered && state.filtered.length) return state.filtered.slice();
    return applyClientFilters(aiReadyItems());
  }

  function detailNeighbors(item) {
    var list = detailNavList();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) {
        idx = i;
        break;
      }
    }
    return {
      prev: idx > 0 ? list[idx - 1] : null,
      next: idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null,
    };
  }

  function renderDetailStatusBadges(item) {
    var chips = dashStatChips(item);
    chips.unshift({ t: item.reviewed ? 'Reviewed' : 'Unreviewed', ok: !!item.reviewed, warn: !item.reviewed });
    return chips.map(renderDashChip).join('');
  }

  function renderDetailPageNotFound(message) {
    var root = byId('txDetailPageRoot');
    if (!root) return;
    root.innerHTML =
      '<div class="tx-detail-page__empty"><h2>Not available</h2><p>' +
      esc(message || 'Item not found or not AI-ready.') +
      '</p><a href="/admin/transcriptions" class="tf-admin-toolbar__btn">Back to Transcriptions</a></div>';
    updateDetailPager(null);
  }

  function updateDetailPager(item) {
    var prevBtn = byId('txDetailPrevBtn');
    var nextBtn = byId('txDetailNextBtn');
    if (!prevBtn || !nextBtn) return;
    if (!item) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    var neighbors = detailNeighbors(item);
    prevBtn.disabled = !neighbors.prev;
    nextBtn.disabled = !neighbors.next;
    prevBtn.dataset.txNavId = neighbors.prev ? neighbors.prev.id : '';
    nextBtn.dataset.txNavId = neighbors.next ? neighbors.next.id : '';
  }

  var detailChromeBound = false;

  function bindDetailPageChrome() {
    if (detailChromeBound) return;
    detailChromeBound = true;
    var back = document.querySelector('[data-tx-detail-back]');
    if (back) {
      back.addEventListener('click', function (ev) {
        if (typeof adminShellNavigate === 'function' && adminShellNavigate('/admin/transcriptions', ev)) {
          if (typeof window.initAdminTranscriptions === 'function') window.initAdminTranscriptions();
        }
      });
    }
    var prevBtn = byId('txDetailPrevBtn');
    var nextBtn = byId('txDetailNextBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        var id = prevBtn.dataset.txNavId;
        if (id) navigateToDetail(id);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var id = nextBtn.dataset.txNavId;
        if (id) navigateToDetail(id);
      });
    }
    var copySummary = byId('txDetailCopySummaryBtn');
    if (copySummary) {
      copySummary.addEventListener('click', function () {
        if (!state.detailItem) return;
        var dItem = state.detailItem;
        var dTitle = itemDisplayTitle(dItem);
        var dPoints = itemKeyPoints(dItem);
        var text = itemSummaryForDisplay(dItem, dTitle, dPoints) || dTitle || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              toast('Summary copied.');
            },
            function () {
              toast('Copy failed.');
            }
          );
        } else {
          toast('Clipboard not available.');
        }
      });
    }
  }

  function renderDetailPage(item) {
    var root = byId('txDetailPageRoot');
    var hint = byId('txDetailPageHint');
    if (!root || !item) return;
    if (hint) hint.textContent = '';
    state.detailItem = item;

    var cat = String(item.category || 'notes').toLowerCase();
    var theme = catTheme(cat);
    var people = extractPeopleFromItem(item);
    var points = itemDetailKeyPoints(item);
    var summary = itemDetailSummary(item);
    var nextAction = itemNextActionLine(item);
    var heroVisual = itemInsightVisual(item, {
      legend: true,
      size: 'hero',
    });
    var datesHtml = renderDetailDatesHtml(item);
    var audioName = audioBasename(item);
    var title = item.title || item.path || '';

    var pointsBlock = points.length
      ? '<section class="tx-detail-page__keypoints tx-text--full" aria-labelledby="txDetailKeyPointsTitle">' +
        '<h3 id="txDetailKeyPointsTitle">' +
        esc(keyPointsSectionTitle(points.length)) +
        '</h3><ul class="tx-text--full">' +
        points
          .map(function (p) {
            return '<li>' + renderSpeakerText(p, people) + '</li>';
          })
          .join('') +
        '</ul></section>'
      : '<p class="tx-detail-page__keypoints-empty tf-admin-muted">' + esc(keyPointsEmptyFallback()) + '</p>';

    var peopleBlock = renderPeopleInvolvedBlock(people);

    var summaryBody =
      detailProseHtml(summary || 'No summary available in the index for this item.', people);
    if (nextAction) {
      summaryBody +=
        '<p class="tx-detail-page__next-action"><strong>Next action:</strong> ' +
        renderSpeakerText(nextAction, people) +
        '</p>';
    }

    var metaRows = detailFieldTable([
      { label: 'Category', value: CATEGORY_LABELS[cat] || item.categoryLabel || cat },
      { label: 'Project', value: item.project },
      { label: 'Source audio', value: audioName || item.sourceAudio },
      { label: 'Processed', value: formatProcessedDate(item) || item.processedDate },
    ]);

    root.innerHTML =
      '<header class="tx-detail-page__hero" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      renderTxStarButton(item.id) +
      '<div class="tx-detail-page__hero-visual" aria-hidden="true">' +
      heroVisual +
      '</div>' +
      '<div class="tx-detail-page__hero-copy">' +
      '<p class="tx-detail-page__eyebrow">' +
      esc(CATEGORY_LABELS[cat] || cat) +
      '</p>' +
      '<h1 class="tx-detail-page__title">' +
      highlightPeopleInText(title || item.path || 'Untitled', people) +
      '</h1>' +
      '<div class="tx-detail-page__badges">' +
      renderDetailStatusBadges(item) +
      '</div>' +
      renderItemSectionCountChips(item) +
      metaRows +
      '</div></header>' +
      peopleBlock +
      pointsBlock +
      detailSectionCard('Summary', summaryBody) +
      '<div class="tx-detail-page__ops">' +
      detailOperationalSections(item) +
      '</div>' +
      detailSectionCard('Full transcription reference', renderFullTranscriptionReferenceBlock(item)) +
      '<div class="tx-detail-page__actions">' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txDetailMarkBtn">Mark reviewed</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txDetailSyncBtn">Sync Google</button>' +
      '</div>';

    updateDetailPager(item);

    var markBtn = byId('txDetailMarkBtn');
    if (markBtn) markBtn.addEventListener('click', function () { markReviewed(item.id); });
    var syncBtn = byId('txDetailSyncBtn');
    if (syncBtn) syncBtn.addEventListener('click', function () { syncItem(item.id); });
    var favBtn = root.querySelector('[data-tx-action="favorite"]');
    if (favBtn) {
      favBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleFavorite(item.id, { scrollToZone: false });
      });
    }

    root.querySelectorAll('.tx-detail-page__related-link').forEach(function (link) {
      link.addEventListener('click', function (ev) {
        if (typeof adminShellNavigate === 'function' && adminShellNavigate(link.getAttribute('href'), ev)) {
          if (typeof window.initAdminTranscriptionDetail === 'function') {
            window.initAdminTranscriptionDetail();
          }
        }
      });
    });
    bindDetailReferenceControls(root, item);
  }

  function fetchDetailItem(id) {
    return tryApi(
      [
        '/api/admin/transcriptions/item/' + encodeURIComponent(id),
        '/api/admin/transcriptions/item?id=' + encodeURIComponent(id),
      ],
      { method: 'GET' }
    );
  }

  function loadAndRenderDetailPage() {
    var id = parseTxDetailIdFromPath();
    var root = byId('txDetailPageRoot');
    if (!id) {
      renderDetailPageNotFound('Item not found or not AI-ready.');
      return;
    }
    if (root) root.innerHTML = '<p class="tf-admin-muted">Loading item…</p>';
    var local = state.items.find(function (it) {
      return it.id === id;
    });
    if (local && isAiReadyItem(local)) renderDetailPage(local);
    fetchDetailItem(id).then(function (pack) {
      if (pack.ok && pack.j && pack.j.item) {
        var item = normalizeItem(pack.j.item);
        if (!isAiReadyItem(item)) {
          renderDetailPageNotFound('Item not found or not AI-ready.');
          return;
        }
        var idx = state.items.findIndex(function (it) {
          return it.id === id;
        });
        if (idx >= 0) state.items[idx] = Object.assign(state.items[idx], item);
        renderDetailPage(item);
      } else if (!local || !isAiReadyItem(local)) {
        renderDetailPageNotFound('Item not found or not AI-ready.');
      }
    });
  }

  function renderCompactRing(segments, centerLabel, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var chart = segments.filter(function (s) {
      return s.value > 0;
    });
    if (chart.length < 2) return '';
    var chartTotal = chart.reduce(function (s, c) {
      return s + c.value;
    }, 0);
    if (!chartTotal) return '';
    var r = 18;
    var cx = 24;
    var cy = 24;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var arcs;
    arcs = chart
        .map(function (c) {
          var frac = c.value / chartTotal;
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
    var center = centerLabel != null ? centerLabel : chartTotal;
    var sizeCls = opts.size === 'hero' ? ' tx-ring--hero' : opts.size === 'card' ? ' tx-ring--card' : '';
    var ringCls = opts.legend ? ' tx-ring--legend' : ' tx-ring--compact';
    var legendHtml = '';
    if (opts.legend && segments.some(function (s) {
      return s.label;
    })) {
      legendHtml =
        '<ul class="tx-ring__legend">' +
        segments
          .map(function (s) {
            return (
              '<li class="tx-ring__legend-item"><span class="tx-ring__legend-swatch" style="background:' +
              esc(s.color) +
              '"></span><span class="tx-ring__legend-label">' +
              esc(s.label) +
              '</span><span class="tx-ring__legend-val">' +
              esc(s.raw != null ? s.raw : s.value != null ? s.value : 0) +
              '</span></li>'
            );
          })
          .join('') +
        '</ul>';
    }
    return (
      '<div class="tx-mini-ring' +
      ringCls +
      sizeCls +
      '" aria-hidden="true"><svg viewBox="0 0 48 48" class="tx-ring__svg">' +
      '<circle cx="24" cy="24" r="18" fill="none" stroke="var(--tx-dash-line,#e2e8f0)" stroke-width="5"/>' +
      arcs +
      '<text x="24" y="26" text-anchor="middle" font-size="9" fill="currentColor" font-weight="700">' +
      esc(center) +
      '</text></svg>' +
      legendHtml +
      '</div>'
    );
  }
  function renderLargeCategoryIcon(cat, extraClass) {
    var TV = txTopicVisuals();
    if (TV) {
      return TV.renderTopicVisual(TV.categoryVisualKey(cat), { size: 'list', extraClass: extraClass });
    }
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
    var ts = getProcessedTimestamp(item);
    if (Number.isNaN(ts)) return '';
    return formatDateLine(ts, Date.now());
  }

  function itemFeedChips(item) {
    var chips = [{ t: 'AI-ready', ok: true }];
    if (!item.reviewed) chips.push({ t: 'Needs review', warn: true });
    chips.push({ t: categoryShortLabel(itemPrimaryCategory(item)), accent: true });
    itemSecondaryExtractionBadges(item).forEach(function (label) {
      chips.push({ t: label });
    });
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

  var TASK_STATUS_DEFS = [
    { key: 'done', label: 'Completed', color: '#10b981' },
    { key: 'open', label: 'Open', color: '#f59e0b' },
    { key: 'unclear', label: 'Unclear / to confirm', color: '#94a3b8' },
  ];
  var DECISION_STATUS_DEFS = [
    { key: 'confirmed', label: 'Confirmed', color: '#10b981' },
    { key: 'needsReview', label: 'Needs review', color: '#f59e0b' },
    { key: 'toConfirm', label: 'To confirm', color: '#ef4444' },
  ];
  var OPEN_POINT_STATUS_DEFS = [
    { key: 'resolved', label: 'Resolved', color: '#10b981' },
    { key: 'unresolved', label: 'Unresolved', color: '#64748b' },
    { key: 'ownerToConfirm', label: 'Owner to confirm', color: '#eab308' },
    { key: 'dateToConfirm', label: 'Date/time to confirm', color: '#8b5cf6' },
  ];
  var NEXT_STEP_STATUS_DEFS = [
    { key: 'done', label: 'Done', color: '#10b981' },
    { key: 'pending', label: 'Pending', color: '#f59e0b' },
    { key: 'blocked', label: 'Blocked', color: '#ef4444' },
  ];
  var CALENDAR_STATUS_DEFS = [
    { key: 'dated', label: 'Dated', color: '#8b5cf6' },
    { key: 'confirm', label: 'To confirm', color: '#ef4444' },
    { key: 'unclear', label: 'Unclear', color: '#94a3b8' },
  ];

  function entryText(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return String(entry).trim();
    if (typeof entry === 'object') {
      return String(entry.text || entry.title || entry.label || entry.issue || '').trim();
    }
    return String(entry).trim();
  }

  function isMeaningfulEntry(entry) {
    return isValidKeyPoint(entryText(entry));
  }

  function meaningfulEntries(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(isMeaningfulEntry);
  }

  function entryTaskStatus(entry) {
    if (entry && typeof entry === 'object') {
      if (entry.done === true || entry.completed === true) return 'done';
      var s = String(entry.status || '').toLowerCase();
      if (s) return taskStatusBucket({ status: s });
    }
    var t = entryText(entry);
    if (/^\s*[-*]?\s*\[[xX]\]/.test(t)) return 'done';
    var low = t.toLowerCase();
    if (/\b(done|completed|complete|closed)\b/.test(low)) return 'done';
    if (/\b(unclear|to confirm|unknown|tbd)\b/.test(low)) return 'unclear';
    return 'open';
  }

  function entryDecisionStatus(entry, parentItem) {
    if (entry && typeof entry === 'object') {
      if (entry.confirmed === true || entry.reviewed === true) return 'confirmed';
      var s = String(entry.status || '').toLowerCase();
      if (s === 'confirmed' || s === 'done' || s === 'approved') return 'confirmed';
      if (s === 'to confirm' || s === 'confirm' || s === 'tbd') return 'toConfirm';
      if (s === 'needs review' || s === 'needs_review' || s === 'review') return 'needsReview';
      if (entry.reviewed === false) return 'needsReview';
    }
    var low = entryText(entry).toLowerCase();
    if (/\b(confirmed|decided|approved|agreed)\b/.test(low)) return 'confirmed';
    if (/\b(to confirm|needs confirmation)\b/.test(low)) return 'toConfirm';
    if (/\b(needs review|review|tbd|pending)\b/.test(low)) return 'needsReview';
    if (parentItem && parentItem.reviewed) return 'confirmed';
    return 'needsReview';
  }

  function entryOpenPointStatus(entry) {
    if (entry && typeof entry === 'object') {
      var s = String(entry.status || '').toLowerCase();
      if (s === 'resolved' || s === 'closed' || s === 'done') return 'resolved';
      if (s === 'owner to confirm' || s === 'owner_to_confirm') return 'ownerToConfirm';
      if (s === 'date to confirm' || s === 'date_to_confirm') return 'dateToConfirm';
    }
    var low = entryText(entry).toLowerCase();
    if (/\b(resolved|closed|done)\b/.test(low)) return 'resolved';
    if (
      (/\b(date|time|when|schedule|deadline)\b/.test(low) && /\b(confirm|tbd|unclear)\b/.test(low)) ||
      /\b(date\/time to confirm|confirm date)\b/.test(low)
    ) {
      return 'dateToConfirm';
    }
    if (
      (/\b(owner|assignee|who)\b/.test(low) && /\b(confirm|tbd|unclear)\b/.test(low)) ||
      /\bowner to confirm\b/.test(low)
    ) {
      return 'ownerToConfirm';
    }
    var pseudo =
      entry && typeof entry === 'object'
        ? entry
        : { issue: entryText(entry), owner: null, assignedTo: null };
    if (openPointBucket(pseudo) === 'unclear') return 'ownerToConfirm';
    return 'unresolved';
  }

  function entryNextStepStatus(entry) {
    if (entry && typeof entry === 'object') {
      var s = String(entry.status || '').toLowerCase();
      if (s === 'done' || s === 'completed' || s === 'complete') return 'done';
      if (s === 'blocked') return 'blocked';
      return 'pending';
    }
    var t = entryText(entry);
    if (/^\s*[-*]?\s*\[[xX]\]/.test(t)) return 'done';
    var low = t.toLowerCase();
    if (/\b(done|completed|complete)\b/.test(low)) return 'done';
    if (/\bblocked\b/.test(low)) return 'blocked';
    return 'pending';
  }

  function countStatusSegments(entries, statusFn, defs) {
    if (!entries.length) return [];
    var counts = {};
    defs.forEach(function (d) {
      counts[d.key] = 0;
    });
    entries.forEach(function (e) {
      var k = statusFn(e);
      if (counts[k] != null) counts[k] += 1;
    });
    return defs
      .map(function (d) {
        var v = counts[d.key] || 0;
        if (v <= 0) return null;
        return { label: d.label, value: v, color: d.color };
      })
      .filter(Boolean);
  }

  function compactInsightSegments(parts) {
    parts = (parts || []).filter(Boolean);
    return parts.length >= 2 ? parts : null;
  }

  function mergeInsightSegments(arrays) {
    var map = {};
    (arrays || []).forEach(function (arr) {
      (arr || []).forEach(function (seg) {
        if (!map[seg.label]) {
          map[seg.label] = { label: seg.label, value: 0, color: seg.color };
        }
        map[seg.label].value += seg.value;
      });
    });
    return compactInsightSegments(
      Object.keys(map).map(function (k) {
        return map[k];
      })
    );
  }

  function sectionCountFrom(arr, statVal) {
    var n = meaningfulEntries(arr || []).length;
    if (n > 0) return n;
    if (arr && arr.length && !meaningfulEntries(arr).length) return 0;
    return statVal != null ? statVal | 0 : 0;
  }

  function itemSourceSectionCounts(item) {
    var st = item.stats || {};
    return {
      tasks: sectionCountFrom(item.tasks, st.tasks_count),
      decisions: sectionCountFrom(item.decisions, st.decisions_count),
      openPoints: sectionCountFrom(item.openPoints || item.open_points, st.open_points_count),
      nextSteps: sectionCountFrom(item.nextSteps || item.next_steps, st.next_steps_count),
    };
  }

  function itemSectionCountChipText(item) {
    var c = itemSourceSectionCounts(item);
    var parts = [];
    if (c.tasks > 0) parts.push(c.tasks + ' task' + (c.tasks === 1 ? '' : 's'));
    if (c.decisions > 0) parts.push(c.decisions + ' decision' + (c.decisions === 1 ? '' : 's'));
    if (c.openPoints > 0) parts.push(c.openPoints + ' open point' + (c.openPoints === 1 ? '' : 's'));
    if (c.nextSteps > 0) parts.push(c.nextSteps + ' next step' + (c.nextSteps === 1 ? '' : 's'));
    return parts.join(' · ');
  }

  function renderItemSectionCountChips(item) {
    var text = itemSectionCountChipText(item);
    if (!text) return '';
    return (
      '<p class="tx-section-counts" aria-label="Section counts">' +
      text
        .split(' · ')
        .map(function (part) {
          return '<span class="tx-section-counts__chip">' + esc(part) + '</span>';
        })
        .join('<span class="tx-section-counts__sep" aria-hidden="true">·</span>') +
      '</p>'
    );
  }

  function categoryBreakdownStats(cat, items) {
    var n = items.length;
    if (!n || !CATEGORY_SEGMENT_DEFS[cat]) return null;
    switch (cat) {
      case 'meetings': {
        var reviewed = countWhere(items, function (it) {
          return it.reviewed;
        });
        return { reviewed: reviewed, needsReview: n - reviewed };
      }
      case 'notes': {
        var processed = countWhere(items, function (it) {
          return it.reviewed;
        });
        return { processed: processed, pending: n - processed };
      }
      case 'tasks': {
        var open = countWhere(items, function (it) {
          return taskStatusBucket(it) === 'open';
        });
        var done = countWhere(items, function (it) {
          return taskStatusBucket(it) === 'done';
        });
        return { open: open, done: done, unclear: n - open - done };
      }
      case 'calendar': {
        var dated = countWhere(items, function (it) {
          return calendarDateState(it) === 'dated';
        });
        var toConfirm = countWhere(items, function (it) {
          return calendarDateState(it) === 'confirm';
        });
        return { dated: dated, toConfirm: toConfirm, unclear: n - dated - toConfirm };
      }
      case 'projects': {
        var categorized = countWhere(items, function (it) {
          return projectBucket(it) === 'categorized';
        });
        return { categorized: categorized, uncategorized: n - categorized };
      }
      case 'decisions': {
        var confirmed = countWhere(items, function (it) {
          return it.reviewed;
        });
        return { confirmed: confirmed, needsReview: n - confirmed };
      }
      case 'open-points': {
        var unresolved = countWhere(items, function (it) {
          return openPointBucket(it) === 'unresolved';
        });
        var assigned = countWhere(items, function (it) {
          return openPointBucket(it) === 'assigned';
        });
        return { unresolved: unresolved, assigned: assigned, unclear: n - unresolved - assigned };
      }
      default:
        return null;
    }
  }

  function buildSegmentsFromStats(stats, catKey) {
    if (!stats) return [];
    var defs = CATEGORY_SEGMENT_DEFS[catKey];
    if (!defs || defs.length < 2) return [];
    return defs.map(function (d) {
      return {
        label: d.label,
        value: stats[d.key] != null ? stats[d.key] : 0,
        color: d.color,
      };
    });
  }

  function arrayLen(val) {
    return Array.isArray(val) ? val.length : 0;
  }

  /** Top-level category counters: icon only — never donut/ring. */
  function categoryCounterVisual(catKey, iconExtraClass, opts) {
    opts = opts || {};
    var TV = txTopicVisuals();
    if (TV) {
      if (opts.item && TV.renderTopicVisualForItem) {
        return TV.renderTopicVisualForItem(opts.item, {
          size: opts.size === 'hero' ? 'hero' : 'list',
          extraClass: iconExtraClass,
        });
      }
      var key = TV.categoryVisualKey(catKey);
      var size = opts.size === 'hero' ? 'hero' : 'list';
      return TV.renderTopicVisual(key, { size: size, extraClass: iconExtraClass, seed: TV.itemSeed ? TV.itemSeed({ id: catKey }) : 0 });
    }
    return renderLargeCategoryIcon(catKey, iconExtraClass);
  }

  function itemTopicVisual(item, opts) {
    opts = opts || {};
    var TV = txTopicVisuals();
    if (TV && TV.renderTopicVisualForItem) {
      return TV.renderTopicVisualForItem(item, {
        size: opts.size === 'hero' ? 'hero' : 'list',
        extraClass: opts.extraClass,
      });
    }
    var cat = String((item && item.category) || 'notes').toLowerCase();
    return categoryCounterVisual(cat, opts.extraClass, { item: item, size: opts.size });
  }

  /** Content numbers from transcription text → donut | stat cards | topic SVG. */
  function itemContentInsight(item) {
    var CN = txContentNumbers();
    if (!CN) return { mode: 'topic', numbers: [] };
    var numbers = CN.extractContentNumbers(item);
    if (CN.filterVisualSegments) numbers = CN.filterVisualSegments(numbers);
    if (!numbers.length) return { mode: 'topic', numbers: [] };
    var donutSegs = CN.toDonutSegments(numbers);
    if (donutSegs && donutSegs.length >= 2) {
      return { mode: 'donut', segments: donutSegs, numbers: numbers };
    }
    if (numbers.length) return { mode: 'stats', numbers: numbers };
    return { mode: 'topic', numbers: [] };
  }

  function renderContentStatCards(numbers, opts) {
    opts = opts || {};
    if (!numbers || !numbers.length) return '';
    var CN = txContentNumbers();
    var max = opts.size === 'hero' ? 6 : 4;
    var cards = numbers.slice(0, max).map(function (seg, idx) {
      var color = CN && CN.kindColor ? CN.kindColor(seg.kind, idx) : CHART_COLORS[idx % CHART_COLORS.length];
      var val = seg.raw != null ? String(seg.raw) : String(seg.value != null ? seg.value : '');
      var lbl = seg.label || seg.kind || 'Value';
      return (
        '<div class="tx-content-stat" style="--tx-stat-accent:' +
        esc(color) +
        '">' +
        '<span class="tx-content-stat__val">' +
        esc(val) +
        '</span>' +
        '<span class="tx-content-stat__lbl">' +
        esc(lbl) +
        '</span></div>'
      );
    });
    var sizeCls = opts.size === 'hero' ? ' tx-content-stats--hero' : opts.size === 'card' ? ' tx-content-stats--card' : '';
    return '<div class="tx-content-stats' + sizeCls + '" role="list">' + cards.join('') + '</div>';
  }

  function itemInsightVisual(item, opts) {
    opts = opts || {};
    var insight = itemContentInsight(item);
    if (insight.mode === 'donut') {
      var CN = txContentNumbers();
      var center = CN && CN.donutCenterLabel ? CN.donutCenterLabel(insight.segments) : insight.segments.length;
      return renderCompactRing(insight.segments, center, opts);
    }
    if (insight.mode === 'stats') {
      return renderContentStatCards(insight.numbers, opts);
    }
    return itemTopicVisual(item, opts);
  }

  function categoryVisualFromStats(stats, catKey, total, iconExtraClass, opts) {
    opts = opts || {};
    if (!opts.allowRing) {
      return categoryCounterVisual(catKey, iconExtraClass, opts);
    }
    var segs = buildSegmentsFromStats(stats, catKey);
    var active = segs.filter(function (s) {
      return (s.value || 0) > 0;
    });
    var sum = active.reduce(function (s, c) {
      return s + (c.value || 0);
    }, 0);
    var center = total != null ? total : sum;
    if (active.length >= 2 && center > 0) {
      return renderCompactRing(active, center, opts);
    }
    return categoryCounterVisual(catKey, iconExtraClass, opts);
  }

  function categoryDonutSegments(cat, items) {
    if (!items.length) return null;
    var stats = categoryBreakdownStats(cat, items);
    var segs = buildSegmentsFromStats(stats, cat);
    if (segs.length >= 2 && items.length > 0) return segs;
    return null;
  }

  function categorySecondaryStats(cat, items) {
    var n = items.length;
    if (!n) return [];
    var lines = [];
    switch (cat) {
      case 'all':
        lines.push(
          countWhere(items, function (it) {
            return it.reviewed;
          }) + ' reviewed'
        );
        lines.push(
          countWhere(items, function (it) {
            return !it.reviewed;
          }) + ' unreviewed'
        );
        break;
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

  function renderDashboardBanner() {
    var section = byId('transcriptionsSection');
    if (!section) return;
    var id = 'txDashboardBanner';
    var el = byId(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'tx-dashboard-banner';
      el.setAttribute('role', 'status');
      var header = section.querySelector('.tx-admin__header');
      if (header && header.nextSibling) {
        section.insertBefore(el, header.nextSibling);
      } else {
        section.insertBefore(el, section.firstChild);
      }
    }
    el.innerHTML =
      '<span class="tx-dashboard-banner__label">Visual dashboard</span>' +
      '<span class="tx-dashboard-banner__rev mono">UI v' +
      esc(window.TX_DASHBOARD_UI_REV) +
      '</span>';
  }

  function renderOverview() {
    var el = byId('txOverview');
    if (!el) {
      txLog('renderOverview: #txOverview missing');
      return;
    }
    el.innerHTML = categoriesForNav()
      .map(function (c) {
      var items = categoryItems(c.key);
      var n = categoryCount(c.key);
      var theme = catTheme(c.key);
      var active = state.category === c.key ? ' is-active' : '';
      var emptyCls = n === 0 ? ' tx-overview-card--empty' : '';
      var visual =
        '<div class="tx-overview-card__visual">' +
        categoryCounterVisual(c.key, 'tx-overview-card__icon') +
        '</div>';
      var stats = categorySecondaryStats(c.key, items)
        .map(function (s) {
          return '<span><strong>' + esc(s.split(' ')[0]) + '</strong> ' + esc(s.replace(/^\d+\s*/, '')) + '</span>';
        })
        .join('');
      return (
        '<button type="button" class="tx-overview-card' +
        active +
        emptyCls +
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
    })
      .join('');
    renderEmptyCategoriesToggle();
    el.querySelectorAll('[data-tx-overview-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectCategory(btn.getAttribute('data-tx-overview-cat'));
      });
    });
    txLog(
      'render overview:',
      el.querySelectorAll('.tx-overview-card').length,
      'cards ·',
      state.items.length,
      'items loaded'
    );
  }

  function renderProjectSelect() {
    var sel = byId('txProjectSelect');
    if (!sel) return;
    var projects = (state.indexMeta && state.indexMeta.projects) || [];
    if (!projects.length) {
      var set = {};
      state.items.forEach(function (it) {
        var p = String(it.project || '').trim();
        if (p) set[p] = true;
      });
      projects = Object.keys(set).sort();
    }
    var current = state.project || sel.value || '';
    var html = '<option value="">All</option>';
    projects.forEach(function (p) {
      html +=
        '<option value="' +
        esc(p) +
        '"' +
        (p === current ? ' selected' : '') +
        '>' +
        esc(p) +
        '</option>';
    });
    sel.innerHTML = html;
    sel.value = current;
    if (current && sel.value !== current) {
      state.project = '';
      sel.value = '';
    }
  }

  function renderCategoryHeader() {
    var el = byId('txCategoryHeader');
    if (!el) return;
    var cat = state.category;
    var items = categoryItems(cat);
    var theme = catTheme(cat);
    var label = categoryShortLabel(cat);
    var visual = categoryCounterVisual(cat);
    var meta = categorySecondaryStats(cat, items).join(' · ');
    el.innerHTML =
      '<div class="tx-category-header__visual" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      visual +
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
    var sectionLine = itemSectionCountChipText(item);
    if (sectionLine) {
      chips.push({ t: sectionLine, accent: true });
    } else {
      var st = item.stats || {};
      if ((st.tasks_count || 0) > 0 || meaningfulEntries(item.tasks).length) chips.push({ t: 'Has tasks' });
      if ((st.calendar_events_count || 0) > 0) chips.push({ t: 'Has calendar' });
      if ((st.decisions_count || 0) > 0 || meaningfulEntries(item.decisions).length) {
        chips.push({ t: 'Has decisions' });
      }
    }
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
    var insight = itemContentInsight(item);
    if (insight.mode === 'donut') {
      var CN = txContentNumbers();
      var center = CN && CN.donutCenterLabel ? CN.donutCenterLabel(insight.segments) : insight.segments.length;
      return (
        '<div class="tx-dash-card__visual tx-dash-card__visual--ring">' +
        renderCompactRing(insight.segments, center, { legend: false, size: 'card' }) +
        '</div>'
      );
    }
    if (insight.mode === 'stats') {
      return (
        '<div class="tx-dash-card__visual tx-dash-card__visual--stats">' +
        renderContentStatCards(insight.numbers, { size: 'card' }) +
        '</div>'
      );
    }
    return (
      '<div class="tx-dash-card__visual tx-dash-card__visual--topic">' +
      itemTopicVisual(item, { size: 'list' }) +
      '</div>'
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
    if (inSearch) {
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
          var items = sortFeedItemsNewestFirst(groups[key], isSortAscending());
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
    var timeGroups = groupItemsByTimeBucket(list);
    return TIME_BUCKET_ORDER.filter(function (bucket) {
      return timeGroups[bucket] && timeGroups[bucket].length;
    })
      .map(function (bucket) {
        var items = sortFeedItemsNewestFirst(timeGroups[bucket], isSortAscending());
        return (
          '<section class="tx-feed-group" data-tx-time-bucket="' +
          esc(bucket) +
          '">' +
          '<h3 class="tx-feed-group__title">' +
          esc(TIME_BUCKET_LABELS[bucket] || bucket) +
          '<span class="tx-feed-group__count">' +
          esc(items.length) +
          '</span></h3>' +
          '<div class="tx-feed-group__items">' +
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


  function parseSortableTimestamp(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    var t = Date.parse(String(value));
    return Number.isNaN(t) ? NaN : t;
  }

  function dateFromFilenameToken(name) {
    var s = String(name || '');
    var m = s.match(/(?:Voice|Memo)_(\d{2})(\d{2})(\d{2})(?:_\d{6})?/i);
    if (m) {
      var yy = parseInt(m[1], 10);
      var year = yy >= 70 ? 1900 + yy : 2000 + yy;
      var fromVoice = Date.parse(year + '-' + m[2] + '-' + m[3]);
      if (!Number.isNaN(fromVoice)) return fromVoice;
    }
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      var fromIso = Date.parse(m[1] + '-' + m[2] + '-' + m[3]);
      if (!Number.isNaN(fromIso)) return fromIso;
    }
    return NaN;
  }

  function firstSortableTimestamp(candidates) {
    var i;
    for (i = 0; i < candidates.length; i++) {
      var ts = parseSortableTimestamp(candidates[i]);
      if (!Number.isNaN(ts)) return ts;
    }
    return NaN;
  }

  function getProcessedTimestamp(item) {
    if (!item) return NaN;
    return firstSortableTimestamp([
      item.processedAt,
      item.processed_at,
      item.aiProcessedAt,
      item.ai_processed_at,
      item.createdAt,
      item.created_at,
      item.modifiedAt,
      item.modified_at,
      item.processing_date,
      item.processedDate,
      item.processed_date,
      item.date,
    ]);
  }

  function getSourceTimestamp(item) {
    if (!item) return NaN;
    var ts = firstSortableTimestamp([
      item.sourceModifiedAt,
      item.source_modified_at,
      item.sourceAudioModifiedAt,
      item.source_audio_modified_at,
      item.audioModifiedAt,
      item.mtimeMs,
      item.fileMtimeMs,
    ]);
    if (!Number.isNaN(ts)) return ts;
    if (item.modified_time != null) {
      var mt = parseSortableTimestamp(item.modified_time);
      if (!Number.isNaN(mt)) return mt;
    }
    var fnTs = dateFromFilenameToken(
      item.sourceAudio ||
        item.source_audio ||
        item.sourceTranscription ||
        item.source_transcription ||
        item.path ||
        item.filepath ||
        item.title
    );
    if (!Number.isNaN(fnTs)) return fnTs;
    return dateFromFilenameToken(item.path || item.filepath || '');
  }

  function getFeedGroupTimestamp(item) {
    if (state.groupByDate === 'source') {
      var src = getSourceTimestamp(item);
      if (!Number.isNaN(src)) return src;
    }
    var proc = getProcessedTimestamp(item);
    if (!Number.isNaN(proc)) return proc;
    var fallback = getSourceTimestamp(item);
    return Number.isNaN(fallback) ? 0 : fallback;
  }

  function txDateLocale() {
    var lang = String((navigator && navigator.language) || 'en').toLowerCase();
    return lang.indexOf('it') === 0 ? 'it-IT' : 'en-US';
  }

  function formatExactDate(ts) {
    if (!ts || Number.isNaN(ts)) return '';
    try {
      return new Date(ts).toLocaleDateString(txDateLocale(), {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (eFmt) {
      return '';
    }
  }

  function startOfLocalDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function relativeTimeBucket(ts, now) {
    if (!ts || Number.isNaN(ts)) return 'older';
    var ref = now != null && !Number.isNaN(now) ? new Date(now) : new Date();
    var itemDay = startOfLocalDay(ts);
    var todayStart = startOfLocalDay(ref);
    if (itemDay.getTime() >= todayStart.getTime()) return 'today';
    var yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    if (itemDay.getTime() >= yesterdayStart.getTime()) return 'yesterday';
    var weekStart = new Date(todayStart);
    var dow = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - ((dow + 6) % 7));
    if (itemDay.getTime() >= weekStart.getTime()) return 'week';
    if (
      itemDay.getFullYear() === todayStart.getFullYear() &&
      itemDay.getMonth() === todayStart.getMonth()
    ) {
      return 'month';
    }
    if (itemDay.getFullYear() === todayStart.getFullYear()) return 'year';
    return 'older';
  }

  function relativeTimeBucketLabel(bucket) {
    return TIME_BUCKET_LABELS[bucket] || bucket || '';
  }

  function formatDateLine(ts, now) {
    var exact = formatExactDate(ts);
    var bucket = relativeTimeBucket(ts, now);
    var rel = relativeTimeBucketLabel(bucket);
    if (!exact && !rel) return '';
    if (!rel) return exact;
    if (!exact) return rel;
    return exact + ' · ' + rel;
  }

  function calendarDayKey(ts) {
    if (!ts || Number.isNaN(ts)) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  }

  function datesDifferForDisplay(processedTs, sourceTs) {
    if (!processedTs || !sourceTs || Number.isNaN(processedTs) || Number.isNaN(sourceTs)) {
      return false;
    }
    if (calendarDayKey(processedTs) !== calendarDayKey(sourceTs)) return true;
    return Math.abs(processedTs - sourceTs) > 24 * 60 * 60 * 1000;
  }

  function groupItemsByTimeBucket(list) {
    var groups = {};
    var now = Date.now();
    (list || []).forEach(function (it) {
      var ts = getFeedGroupTimestamp(it);
      var bucket = relativeTimeBucket(ts, now);
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(it);
    });
    return groups;
  }

  function sortFeedItemsNewestFirst(items, ascending) {
    var list = (items || []).slice();
    list.sort(function (a, b) {
      var diff = getFeedGroupTimestamp(b) - getFeedGroupTimestamp(a);
      if (diff !== 0) return ascending ? -diff : diff;
      var ida = String(a.id || a.path || '');
      var idb = String(b.id || b.path || '');
      return ascending ? ida.localeCompare(idb) : idb.localeCompare(ida);
    });
    return list;
  }

  function renderCardDatesHtml(item) {
    var now = Date.now();
    var procTs = getProcessedTimestamp(item);
    var srcTs = getSourceTimestamp(item);
    var showBoth = datesDifferForDisplay(procTs, srcTs);
    if (showBoth) {
      var lines = [];
      if (!Number.isNaN(procTs)) {
        lines.push(
          '<span class="tx-card__date-line"><span class="tx-card__date-label">Processed:</span> ' +
            esc(formatDateLine(procTs, now)) +
            '</span>'
        );
      }
      if (!Number.isNaN(srcTs)) {
        lines.push(
          '<span class="tx-card__date-line"><span class="tx-card__date-label">Source:</span> ' +
            esc(formatDateLine(srcTs, now)) +
            '</span>'
        );
      }
      if (!lines.length) return '';
      return '<div class="tx-card__dates">' + lines.join('') + '</div>';
    }
    var primary = !Number.isNaN(procTs) ? procTs : srcTs;
    if (Number.isNaN(primary)) return '';
    return '<div class="tx-card__dates">' + esc(formatDateLine(primary, now)) + '</div>';
  }

  function renderDetailDatesHtml(item) {
    var now = Date.now();
    var procTs = getProcessedTimestamp(item);
    var srcTs = getSourceTimestamp(item);
    var showBoth = datesDifferForDisplay(procTs, srcTs);
    if (showBoth) {
      var lines = [];
      if (!Number.isNaN(procTs)) {
        lines.push(
          '<p class="tx-detail-page__date-line"><span class="tx-card__date-label">Processed:</span> ' +
            esc(formatDateLine(procTs, now)) +
            '</p>'
        );
      }
      if (!Number.isNaN(srcTs)) {
        lines.push(
          '<p class="tx-detail-page__date-line"><span class="tx-card__date-label">Source:</span> ' +
            esc(formatDateLine(srcTs, now)) +
            '</p>'
        );
      }
      if (!lines.length) return '';
      return '<div class="tx-detail-page__dates">' + lines.join('') + '</div>';
    }
    var primary = !Number.isNaN(procTs) ? procTs : srcTs;
    if (Number.isNaN(primary)) return '';
    return (
      '<div class="tx-detail-page__dates"><p class="tx-detail-page__date-line">' +
      esc(formatDateLine(primary, now)) +
      '</p></div>'
    );
  }

  function loadGroupByPref() {
    try {
      var v = sessionStorage.getItem(GROUP_BY_STORAGE_KEY);
      return v === 'source' ? 'source' : 'processed';
    } catch (eGb) {
      return 'processed';
    }
  }

  function saveGroupByPref(mode) {
    try {
      sessionStorage.setItem(GROUP_BY_STORAGE_KEY, mode === 'source' ? 'source' : 'processed');
    } catch (eSave) {
      /* ignore */
    }
  }

  function syncGroupBySelectUi() {
    var sel = byId('txGroupBySelect');
    if (!sel) return;
    sel.value = state.groupByDate === 'source' ? 'source' : 'processed';
  }

  function getItemSortTimestamp(item) {
    if (!item) return 0;
    var proc = getProcessedTimestamp(item);
    if (!Number.isNaN(proc)) return proc;
    var src = getSourceTimestamp(item);
    if (!Number.isNaN(src)) return src;
    var extra = firstSortableTimestamp([
      item.modified_datetime,
      item.eventDate,
      item.dueDate,
    ]);
    return Number.isNaN(extra) ? 0 : extra;
  }

  function getPendingSortTimestamp(entry) {
    if (!entry) return 0;
    var candidates = [
      entry.processedAt,
      entry.processed_at,
      entry.aiProcessedAt,
      entry.ai_processed_at,
      entry.rawCreatedAt,
      entry.createdAt,
      entry.created_at,
      entry.modifiedAt,
      entry.modified_at,
      entry.modified_datetime,
      entry.processed_datetime,
    ];
    var i;
    for (i = 0; i < candidates.length; i++) {
      var ts = parseSortableTimestamp(candidates[i]);
      if (!Number.isNaN(ts)) return ts;
    }
    if (entry.modified_time != null) {
      var mt = parseSortableTimestamp(entry.modified_time);
      if (!Number.isNaN(mt)) return mt;
    }
    var fnTs = dateFromFilenameToken(
      entry.rawTranscriptionPath || entry.sourceAudio || entry.file_name || entry.id || ''
    );
    return Number.isNaN(fnTs) ? 0 : fnTs;
  }

  function sortItemsNewestFirst(items, ascending) {
    var list = (items || []).slice();
    list.sort(function (a, b) {
      var diff = getItemSortTimestamp(b) - getItemSortTimestamp(a);
      if (diff !== 0) return ascending ? -diff : diff;
      var ida = String(a.id || a.path || '');
      var idb = String(b.id || b.path || '');
      return ascending ? ida.localeCompare(idb) : idb.localeCompare(ida);
    });
    return list;
  }

  function sortPendingSourcesNewestFirst(pending, ascending) {
    var list = (pending || []).slice();
    list.sort(function (a, b) {
      var diff = getPendingSortTimestamp(b) - getPendingSortTimestamp(a);
      if (diff !== 0) return ascending ? -diff : diff;
      var ida = String(a.rawTranscriptionPath || a.id || '');
      var idb = String(b.rawTranscriptionPath || b.id || '');
      return ascending ? ida.localeCompare(idb) : idb.localeCompare(ida);
    });
    return list;
  }

  function isSortAscending() {
    return state.sortOrder === 'oldest';
  }

  function applyIndexSort() {
    state.items = sortItemsNewestFirst(state.items, isSortAscending());
    if (state.rawSources && state.rawSources.pendingSources && state.rawSources.pendingSources.length) {
      state.rawSources.pendingSources = sortPendingSourcesNewestFirst(
        state.rawSources.pendingSources,
        isSortAscending()
      );
    }
  }

  function syncSortSelectUi() {
    var sel = byId('txSortSelect');
    if (!sel) return;
    sel.value = state.sortOrder === 'oldest' ? 'oldest' : 'recent';
  }

  function parseItemDate(item) {
    return getItemSortTimestamp(item);
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
    var merged = Object.assign({}, it, {
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
      possibleActions: ex.possible_actions || it.possibleActions || [],
      calendarEvents: ex.calendar_events || it.calendarEvents || it.calendar || [],
      blockers: ex.blockers || it.blockers || [],
      reason: it.reason || ex.reason || '',
      path: it.filepath || it.path,
      sourceAudio: srcAudio,
      source_audio: srcAudio,
      sourceTranscription: srcTrans,
      source_transcription: srcTrans,
      processedDate: it.processedDate || it.processing_date || it.processed_date || null,
      raw_sections: it.raw_sections || it.rawSections || {},
      rawSections: it.raw_sections || it.rawSections || {},
      fullContent: it.fullContent || it.full_content || '',
      sourceTranscriptionContent:
        it.sourceTranscriptionContent || it.source_transcription_content || '',
      readyForSite:
        it.readyForSite !== false &&
        (!it.pipelineStatus || !!VISIBLE_PIPELINE_STATUSES[it.pipelineStatus]),
      primaryCategory: normalizePrimaryCategory(
        it.primaryCategory || it.mainCategory || it.category,
        'notes'
      ),
      mainCategory: normalizePrimaryCategory(
        it.mainCategory || it.primaryCategory || it.category,
        'notes'
      ),
      category: normalizePrimaryCategory(
        it.primaryCategory || it.mainCategory || it.category,
        it.category || 'notes'
      ),
      extractedCategories: it.extractedCategories || it.categories || [],
      categories: it.extractedCategories || it.categories || [],
      hasTasks: !!it.hasTasks,
      hasCalendar: !!it.hasCalendar,
      hasDecisions: !!it.hasDecisions,
      hasOpenPoints: !!it.hasOpenPoints,
      hasProjects: !!it.hasProjects,
      sourceEntries: it.sourceEntries || [],
      sourceGroupKey: it.sourceGroupKey || it.sourceKey || null,
      isSourceEntry: !!(
        it.isSourceEntry ||
        it.source_entry ||
        it.item_type === 'source_entry' ||
        (it.extractedCategories && it.extractedCategories.length)
      ),
      displayTitle: it.displayTitle || it.title,
    });
    applySpeakerFormatToItem(merged);
    return applyCardCopyFields(merged);
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
    'content/ai-ready-transcriptions/',
    'content/meetings/',
    'content/notes/',
    'content/tasks/',
    'content/calendar/',
    'content/projects/',
    'content/decisions/',
    'content/open-points/',
  ];

  function looksLikeRawEcho(item) {
    var summary = String(item.summary || item.preview || item.cardSummary || '').trim();
    var title = String(item.title || item.displayTitle || '').trim();
    if (title && title.toLowerCase().indexOf('so guys we can start') === 0) return true;
    if (!summary || summary.length < 40) return false;
    var prefix = summary.slice(0, 80).toLowerCase();
    if (prefix.indexOf('so guys we can start') === 0) return true;
    if (prefix.indexOf('allora, oggi sto lavorando') === 0 && summary.length < 200) return true;
    var raw = String(item.sourceTranscriptionContent || '').toLowerCase();
    if (raw && prefix.length >= 40 && raw.indexOf(prefix) >= 0) return true;
    return false;
  }

  function feedKeyPoints(item) {
    var ex = item.extracted_items || item.extractedItems || {};
    var pts = []
      .concat(ex.important_points || item.importantPoints || [])
      .concat(item.bullets || []);
    return pts.filter(function (p) {
      return isValidKeyPoint(p) && !isGenericPlaceholderText(p);
    });
  }

  function feedExtractedCount(item) {
    var ex = item.extracted_items || item.extractedItems || {};
    var n = 0;
    ['tasks', 'decisions', 'open_points', 'openPoints'].forEach(function (k) {
      var list = ex[k] || item[k] || [];
      if (Array.isArray(list)) {
        list.forEach(function (line) {
          if (line && isValidKeyPoint(line) && !isGenericPlaceholderText(line)) n += 1;
        });
      }
    });
    return n;
  }

  function hasStructuredFeedFields(it) {
    if (!it) return false;
    var title = String(it.title || it.displayTitle || '').trim();
    if (!title || title.length < 8) return false;
    var summary = String(it.summary || it.preview || it.cardSummary || '').trim();
    if (summary.length < 80) return false;
    var cat = normalizePrimaryCategory(it.primaryCategory || it.mainCategory || it.category, '');
    if (!cat || cat === 'all') return false;
    var points = feedKeyPoints(it);
    var extracted = feedExtractedCount(it);
    if (points.length < 3) {
      var sparseOk =
        points.length >= 2 &&
        (window.TxKeyPoints && typeof window.TxKeyPoints.summaryExplainsSparsePoints === 'function'
          ? window.TxKeyPoints.summaryExplainsSparsePoints(summary)
          : /limited content|frammenti|rumore|nota vocale breve|non intellegibile/i.test(summary));
      if (!sparseOk && (points.length < 2 || extracted < 1)) return false;
    }
    return true;
  }

  function isAiReadyItem(it) {
    if (!it || it.source_only || it.sourceOnly) return false;
    var path = String(it.path || '');
    if (path.indexOf('content/transcriptions/') === 0) return false;
    if (path && !ALLOWED_OUTPUT_PREFIXES.some(function (p) { return path.indexOf(p) === 0; })) return false;
    if (it.readyForSite === false || it.needs_review || it.needsReview) return false;
    var st = it.pipelineStatus;
    if (st === 'failed') return false;
    if (st && !VISIBLE_PIPELINE_STATUSES[st]) return false;
    if (looksLikeRawEcho(it)) return false;
    if (!hasStructuredFeedFields(it)) return false;
    return true;
  }

  function countsFromItems(items, serverCounts, serverSourceCounts) {
    var sourceCounts = {
      meetings: 0,
      notes: 0,
      tasks: 0,
      calendar: 0,
      projects: 0,
      decisions: 0,
      'open-points': 0,
      total: items.length,
    };
    var extractionCounts = {
      meetings: 0,
      notes: 0,
      tasks: 0,
      calendar: 0,
      projects: 0,
      decisions: 0,
      'open-points': 0,
      total: 0,
    };
    items.forEach(function (it) {
      var primary = itemPrimaryCategory(it);
      if (sourceCounts[primary] != null) sourceCounts[primary] += 1;
      extractionCounts.tasks += extractionCountForCategory(it, 'tasks');
      extractionCounts.calendar += extractionCountForCategory(it, 'calendar');
      extractionCounts.decisions += extractionCountForCategory(it, 'decisions');
      extractionCounts['open-points'] += extractionCountForCategory(it, 'open-points');
      extractionCounts.projects += extractionCountForCategory(it, 'projects');
    });
    extractionCounts.total =
      extractionCounts.tasks +
      extractionCounts.calendar +
      extractionCounts.projects +
      extractionCounts.decisions +
      extractionCounts['open-points'];
    if (serverCounts) {
      CATEGORIES.forEach(function (c) {
        if (serverCounts[c.key] != null) extractionCounts[c.key] = serverCounts[c.key];
      });
      if (serverCounts.total != null) extractionCounts.total = serverCounts.total;
      if (serverCounts.needsReview != null) extractionCounts.needsReview = serverCounts.needsReview;
    }
    if (serverSourceCounts) {
      CATEGORIES.forEach(function (c) {
        if (serverSourceCounts[c.key] != null) sourceCounts[c.key] = serverSourceCounts[c.key];
      });
      if (serverSourceCounts.total != null) sourceCounts.total = serverSourceCounts.total;
    }
    sourceCounts.sourceTotal = items.length;
    extractionCounts.sourceTotal = items.length;
    return { extraction: extractionCounts, source: sourceCounts };
  }

  function normalizeIndex(j) {
    var serverCounts = j.counts || j.totals || {};
    var serverSourceCounts = j.sourceTotals || {};
    var flatItems = (j.items || []).map(normalizeItem).filter(isAiReadyItem);
    var readyFlat = flatItems.filter(function (it) {
      return !it.source_only && !it.sourceOnly;
    });
    var items = readyFlat.some(function (it) {
      return it.extractedCategories || it.isSourceEntry || it.sourceGroupKey;
    })
      ? readyFlat
      : groupFlatItemsToSources(readyFlat);
    var countPack = countsFromItems(items, serverCounts, serverSourceCounts);
    var counts = countPack.extraction;
    var sourceCounts = countPack.source;
    var chartPack =
      j.has_chart_data != null
        ? { hasChartData: !!j.has_chart_data, chart: j.chart || [] }
        : buildChartFromCounts(counts);
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
      items: items,
      counts: counts,
      sourceCounts: sourceCounts,
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

  /** Total voice transcriptions on disk — same basis as /admin/voice-recorder "Transcriptions" stat. */
  function voiceTranscriptionCount() {
    var rs = state.rawSources || {};
    var raw = rs.total != null ? rs.total : state.rawTranscriptionCount || 0;
    if (raw > 0) return raw;
    return state.items.length || (state.sourceCounts && state.sourceCounts.total) || 0;
  }

  function aiReadySourceCount() {
    return state.items.length || (state.sourceCounts && state.sourceCounts.total) || 0;
  }

  function setLoadHint(text, kind) {
    var el = byId('txLoadHint');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-error', 'is-warn', 'is-ok');
    if (kind === 'error') el.classList.add('is-error');
    else if (kind === 'warn') el.classList.add('is-warn');
    else if (kind === 'ok') el.classList.add('is-ok');
  }
  window.soTxSetLoadHint = setLoadHint;

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
    if (key === 'all') return NAV_ALL_CATEGORY.short;
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
    var card = cardPreviewText(item);
    if (card) return card;
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

  function loadFavoriteIds() {
    try {
      var raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return {};
      var out = {};
      parsed.forEach(function (id) {
        if (id) out[String(id)] = true;
      });
      return out;
    } catch (eFav) {
      return {};
    }
  }

  function saveFavoriteIds() {
    try {
      var ids = Object.keys(state.favoriteIds).filter(function (id) {
        return state.favoriteIds[id];
      });
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
    } catch (eSave) {
      /* ignore */
    }
  }

  function isFavorite(id) {
    return !!(id && state.favoriteIds[String(id)]);
  }

  function toggleFavorite(id, opts) {
    if (!id) return;
    var key = String(id);
    var next = !isFavorite(key);
    if (next) state.favoriteIds[key] = true;
    else delete state.favoriteIds[key];
    saveFavoriteIds();
    if (state.detailItem && state.detailItem.id === key) {
      var detailStar = document.querySelector('#txDetailPageRoot .tx-favorite-btn[data-tx-id="' + key + '"]');
      if (detailStar) updateFavoriteButtonEl(detailStar, next);
    }
    if (!opts || !opts.skipFeedRender) renderFeed();
    if (next && (!opts || opts.scrollToZone !== false)) scrollToFavoritesZone();
    toast(next ? 'Aggiunto ai preferiti.' : 'Rimosso dai preferiti.');
  }

  function updateFavoriteButtonEl(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti');
    btn.setAttribute('title', on ? 'Preferito' : 'Aggiungi ai preferiti');
    var path = btn.querySelector('path');
    if (path) path.setAttribute('fill', on ? 'currentColor' : 'none');
  }

  function renderTxStarButton(id) {
    var on = isFavorite(id);
    return (
      '<button type="button" class="tx-favorite-btn' +
      (on ? ' is-active' : '') +
      '" data-tx-action="favorite" data-tx-id="' +
      esc(id) +
      '" aria-label="' +
      (on ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti') +
      '" aria-pressed="' +
      (on ? 'true' : 'false') +
      '" title="' +
      (on ? 'Preferito' : 'Aggiungi ai preferiti') +
      '">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<path d="M12 2.5l2.85 5.77 6.37.93-4.61 4.49 1.09 6.35L12 17.2l-5.7 3.84 1.09-6.35-4.61-4.49 6.37-.93L12 2.5z" fill="' +
      (on ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
      '</svg></button>'
    );
  }

  function favoriteItemsForZone() {
    var out = state.items.filter(function (it) {
      return isFavorite(it.id) && isAiReadyItem(it);
    });
    if (state.searchQuery.trim() && state.searchResults) {
      var searchIds = {};
      state.searchResults.forEach(function (it) {
        if (it && it.id) searchIds[it.id] = true;
      });
      out = out.filter(function (it) {
        return searchIds[it.id];
      });
    } else if (state.searchQuery.trim() && state.searchLoading) {
      return [];
    }
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
    return sortFeedItemsNewestFirst(out, isSortAscending());
  }

  function renderFavoritesSection() {
    var items = favoriteItemsForZone();
    if (!items.length) return '';
    return (
      '<section id="txFavoritesZone" class="tx-favorites-zone" aria-label="Preferiti">' +
      '<h3 class="tx-favorites-zone__title">Preferiti <span class="tx-favorites-zone__count">' +
      esc(items.length) +
      '</span></h3>' +
      '<div class="tx-favorites-zone__items">' +
      items.map(renderFeedCard).join('') +
      '</div></section>'
    );
  }

  function scrollToFavoritesZone() {
    var zone = byId('txFavoritesZone');
    if (!zone) return;
    try {
      zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (eScroll) {
      zone.scrollIntoView(true);
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
    if (itemPrimaryCategory(item) === 'tasks') return true;
    var text = itemText(item).trim();
    return ACTION_VERB_RE.test(text);
  }

  function isSeriousItem(item) {
    if (isJunkItem(item)) return false;
    var project = String(item.project || '')
      .toLowerCase()
      .trim();
    if (SERIOUS_PROJECTS[project]) return true;
    if (itemPrimaryCategory(item) === 'projects') return true;
    return false;
  }

  function priorityScore(item) {
    var text = itemText(item);
    var cat = itemPrimaryCategory(item);
    var score = 0;
    if (hasRealCategory(item)) score += 2;
    if (text.length > 200) score += 1;
    if (cat === 'decisions' || cat === 'meetings' || cat === 'tasks') score += 2;
    return score;
  }

  /** All AI-ready sources dated today — ignores category tab, project, and feed filters. */
  function digestTodaySources() {
    return state.items.filter(function (it) {
      return isAiReadyItem(it) && isToday(parseItemDate(it));
    });
  }

  function digestTopPriorityPool() {
    var pool = digestTodaySources();
    if (state.hideJunk) {
      pool = pool.filter(function (it) {
        return !isJunkItem(it);
      });
    }
    return pool;
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

    var today = digestTodaySources();
    var serious = 0;
    var taskCount = 0;
    var junkCount = 0;
    today.forEach(function (it) {
      if (isJunkItem(it)) junkCount += 1;
      else if (isSeriousItem(it)) serious += 1;
      if (isTaskLikeItem(it)) taskCount += 1;
    });

    var top = digestTopPriorityPool()
      .slice()
      .sort(function (a, b) {
        return priorityScore(b) - priorityScore(a) || parseItemDate(b) - parseItemDate(a);
      })
      .slice(0, 3);

    var topHtml = top.length
      ? top
          .map(function (it) {
            var cat = categoryShortLabel(itemPrimaryCategory(it));
            return (
              '<li><a class="tx-digest__pick" href="' +
              esc(txItemDetailPath(it.id)) +
              '">' +
              esc(it.title || it.path || 'Untitled') +
              '<span class="tx-digest__cat mono">' +
              esc(cat) +
              '</span>' +
              '<span class="tx-digest__score mono">+' +
              esc(priorityScore(it)) +
              '</span></a></li>'
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
      return sourceHasCategory(it, state.category);
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
    return sortItemsNewestFirst(out, isSortAscending());
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
    el.innerHTML = '';
    el.hidden = true;
    el.setAttribute('hidden', '');
  }

  function renderStats() {
    var el = byId('txStats');
    if (!el) return;
    var sc = state.sourceCounts || {};
    var ex = state.counts || {};
    var rs = state.rawSources || {};
    var pipe = state.pipeline || {};
    var cards = [
      { label: 'Sources · Meetings', n: sc.meetings != null ? sc.meetings : categoryCount('meetings'), catKey: 'meetings' },
      { label: 'Sources · Notes', n: sc.notes != null ? sc.notes : categoryCount('notes'), catKey: 'notes' },
      { label: 'Sources · Projects', n: sc.projects != null ? sc.projects : categoryCount('projects'), catKey: 'projects' },
      { label: 'Extracted · Tasks', n: ex.tasks || 0, extraction: true },
      { label: 'Extracted · Calendar', n: ex.calendar || 0, extraction: true },
      { label: 'Extracted · Decisions', n: ex.decisions || 0, extraction: true },
      { label: 'Extracted · Open points', n: ex['open-points'] || 0, extraction: true },
      { label: 'Extracted · Project lines', n: ex.projects || 0, extraction: true },
    ];
    el.innerHTML = cards
      .filter(function (card) {
        if (!card.catKey && !card.extraction) return true;
        if (state.showEmptyCategories) return true;
        return (card.n || 0) > 0;
      })
      .map(function (card) {
        var cls = 'tx-stat' + (card.muted ? ' tx-stat--muted' : '');
        if (card.extraction) cls += ' tx-stat--extraction';
        if (card.catKey && (card.n || 0) === 0) cls += ' tx-stat--empty';
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

  function isRawPendingSource(p) {
    if (!p) return false;
    var st = p.status || 'raw_created';
    if (st === 'ready_for_site' || st === 'ai_processed') return false;
    return (
      st === 'detected' ||
      st === 'raw_created' ||
      st === 'ai_processing_pending' ||
      st === 'ai_processing_running' ||
      st === 'failed' ||
      st === 'needs_review'
    );
  }

  function renderRawSourcesBox() {
    var el = byId('txRawSources');
    if (!el) return;
    var rs = state.rawSources || {};
    var total = rs.total != null ? rs.total : state.rawTranscriptionCount || 0;
    var waiting = rs.waitingForProcessing || 0;
    var pending = sortPendingSourcesNewestFirst(rs.pendingSources || [], isSortAscending()).filter(
      isRawPendingSource,
    );
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
    var pipe = state.pipeline || {};
    el.innerHTML =
      '<p class="tx-raw-sources__note tf-admin-muted">Admin/debug only — not part of the AI-ready feed above.</p>' +
      '<ul class="tx-raw-sources__list mono">' +
      '<li><strong>Raw files on disk:</strong> ' +
      esc(total) +
      '</li>' +
      '<li><strong>Waiting for AI / review:</strong> ' +
      esc(waiting) +
      '</li>' +
      '<li><strong>Needs review (index):</strong> ' +
      esc(state.needsReviewCount || 0) +
      '</li>' +
      '<li><strong>Latest raw file:</strong> ' +
      esc(rs.latestRawFile || '—') +
      '</li>' +
      '<li><strong>Latest AI-processed:</strong> ' +
      esc(rs.latestProcessedFile || '—') +
      '</li>' +
      '<li><strong>Last pipeline run:</strong> ' +
      esc(pipe.lastRun ? new Date(pipe.lastRun).toLocaleString() : '—') +
      '</li>' +
      '</ul>' +
      (rows
        ? '<ul class="tx-pending-list">' + rows + '</ul>'
        : '<p class="tf-admin-muted" style="margin:0.5rem 0 0;font-size:0.74rem">No pending or failed sources.</p>');
  }

  function renderCategoryButton(c, counts, activeKey) {
    var n = categoryCount(c.key);
    var active = activeKey === c.key ? ' is-active' : '';
    var emptyCls = n === 0 ? ' tx-cat-card--empty' : '';
    var theme = catTheme(c.key);
    return (
      '<button type="button" class="tx-cat-card' +
      active +
      emptyCls +
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
    var html = categoriesForNav()
      .map(function (c) {
        return renderCategoryButton(c, counts, state.category);
      })
      .join('');
    renderEmptyCategoriesToggle();
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
      var n = categoryCount(state.category);
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
      if (failed) {
        toastPersist('Bulk sync finished with ' + failed + ' failure(s).');
      } else {
        toast('Bulk sync finished.');
      }
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
    var title = itemDisplayTitle(item);
    var points = itemKeyPoints(item);
    var chips = itemFeedChips(item);
    var people = extractPeopleFromItem(item);
    var unread = !item.reviewed ? ' is-unread' : '';
    var junk = isJunkCard(item);
    var catKey = itemPrimaryCategory(item);
    var theme = catTheme(catKey);
    var audioName = audioBasename(item);
    var datesHtml = renderCardDatesHtml(item);
    var metaRows =
      '<span class="tx-dash-card__meta-row"><span class="tx-dash-card__cat">' +
      esc(categoryShortLabel(itemPrimaryCategory(item))) +
      '</span>' +
      (item.project
        ? '<span class="tx-dash-card__sep">·</span><span class="tx-dash-card__proj">' + esc(item.project) + '</span>'
        : '') +
      '</span>';
    if (audioName) {
      metaRows +=
        '<span class="tx-dash-card__meta-row tx-dash-card__meta--muted">from ' + esc(audioName) + '</span>';
    }
    var syncSt = state.itemSyncState[item.id] || '';
    var syncCls = syncSt ? ' tx-card--sync-' + syncSt : '';
    var isSelected = !!state.selectedIds[item.id];
    var roleAttrs = state.selectMode
      ? ' role="checkbox" aria-checked="' + (isSelected ? 'true' : 'false') + '"'
      : '';
    var pointsHtml = points.length
      ? '<div class="tx-dash-card__points-wrap"><h4 class="tx-dash-card__points-label">Key points</h4><ul class="tx-dash-card__points tx-text--preview">' +
        points
          .map(function (p) {
            return '<li>' + renderSpeakerText(p, people) + '</li>';
          })
          .join('') +
        '</ul></div>'
      : '<p class="tx-dash-card__points-empty tf-admin-muted">' + esc(keyPointsEmptyFallback()) + '</p>';
    var peopleRow =
      people.length && people.length <= 3 ? renderPeopleChipsRow(people, 3) : '';
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
      highlightPeopleInText(title, people) +
      '</h3>' +
      renderTxStarButton(item.id) +
      '</div>' +
      '<p class="tx-dash-card__meta">' +
      metaRows +
      '</p>' +
      datesHtml +
      pointsHtml +
      peopleRow +
      '<div class="tx-dash-card__chips">' +
      chips.map(renderDashChip).join('') +
      '</div>' +
      '<div class="tx-dash-card__actions">' +
      '<a class="tf-admin-toolbar__btn" href="' +
      esc(txItemDetailPath(item.id)) +
      '">View page</a>' +
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
        if (action === 'read') markReviewed(id);
        else if (action === 'sync') syncItem(id);
        else if (action === 'copy') copyItem(id);
        else if (action === 'favorite') toggleFavorite(id, { scrollToZone: true });
        closeCardMenus();
      });
    });
    root.querySelectorAll('.tx-dash-card__actions a[href*="/admin/transcriptions/item/"]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        if (typeof adminShellNavigate === 'function' && adminShellNavigate(a.getAttribute('href'), ev)) {
          if (typeof window.initAdminTranscriptionDetail === 'function') {
            window.initAdminTranscriptionDetail();
          }
        }
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
        if (
          ev.target.closest('[data-tx-action]') ||
          ev.target.closest('.tx-card__menu-wrap') ||
          ev.target.closest('.tx-favorite-btn')
        )
          return;
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
        if (ev.target.closest('.tx-dash-card__actions')) return;
        if (id) {
          ev.preventDefault();
          navigateToDetail(id);
        }
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
    if (!feed) {
      txLog('renderFeed: #txFeed missing');
      return;
    }

    renderDigest();
    renderDashboardBanner();
    renderOverview();
    renderCategoryHeader();
    renderDistribution();

    var list;
    if (state.searchQuery.trim() && state.searchResults) {
      list = sortFeedItemsNewestFirst(state.searchResults, isSortAscending());
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

    var TV = txTopicVisuals();
    if (TV && TV.assignIconConceptsForItems && list.length) {
      TV.assignIconConceptsForItems(list);
    }

    if (!state.items.length && !state.loading) {
      var favEmpty = renderFavoritesSection();
      feed.innerHTML =
        favEmpty ||
        ((state.rawTranscriptionCount || 0) > 0 && !(state.counts.total || 0)
          ? emptyState('raw')
          : emptyState('none'));
      if (hint) hint.textContent = '';
      if (favEmpty) bindFeedActions(feed);
      renderTimeline();
      return;
    }

    if (!list.length) {
      var favOnly = renderFavoritesSection();
      feed.innerHTML =
        favOnly + (state.searchQuery.trim() ? emptyState('search') : emptyState('category'));
      if (hint) hint.textContent = favOnly ? '' : '0 items';
      if (favOnly) bindFeedActions(feed);
      renderTimeline();
      return;
    }

    if (hint) hint.textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
    feed.innerHTML = renderFavoritesSection() + renderFeedBody(list);
    bindFeedActions(feed);
    renderTimeline();
    txLog(
      'render feed:',
      feed.querySelectorAll('.tx-dash-card').length,
      'cards ·',
      list.length,
      'filtered ·',
      state.items.length,
      'total'
    );
  }

  function renderTimeline() {
    var body = byId('txTimelineBody');
    if (!body) return;
    var todayItems = sortItemsNewestFirst(
      state.items.filter(function (it) {
        return isToday(parseItemDate(it));
      }),
      false
    );
    if (!todayItems.length) {
      body.innerHTML = '<p class="tf-admin-muted" style="margin:0;font-size:0.74rem">Nessuna voce per oggi.</p>';
      return;
    }
    body.innerHTML = todayItems
      .map(function (it) {
        var id = String(it.id || '').trim();
        var t = parseItemDate(it);
        var time = t
          ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          : '—';
        var href = id ? txItemDetailPath(id) : '#';
        return (
          '<a class="tx-timeline__item" href="' +
          esc(href) +
          '"' +
          (id ? ' data-tx-id="' + esc(id) + '"' : ' aria-disabled="true" tabindex="-1"') +
          '>' +
          '<span class="tx-timeline__time mono">' +
          esc(time) +
          '</span><span class="tx-timeline__label"><strong>' +
          esc(it.categoryLabel || it.category) +
          '</strong> — ' +
          esc(itemDisplayTitle(it) || '') +
          '</span></a>'
        );
      })
      .join('');
    bindTimelineLinks();
  }

  function bindTimelineLinks() {
    var body = byId('txTimelineBody');
    if (!body || body.dataset.txTimelineBound === '1') return;
    body.dataset.txTimelineBound = '1';
    body.addEventListener('click', function (ev) {
      var link = ev.target.closest('a.tx-timeline__item[data-tx-id]');
      if (!link) return;
      var id = link.getAttribute('data-tx-id');
      if (!id) return;
      ev.preventDefault();
      navigateToDetail(id);
    });
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

  function openOverlay() {
    /* Detail uses dedicated page; overlay modal disabled. */
  }

  function closeOverlay() {
    document.body.style.overflow = '';
  }

  function copyItem(id) {
    var item = state.items.find(function (it) {
      return it.id === id;
    });
    if (!item) return;
    var title = itemDisplayTitle(item);
    var points = itemKeyPoints(item);
    var text = [title]
      .concat(points)
      .concat([itemSummaryForDisplay(item, title, points) || item.summary || ''])
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
        if (state.detailItem) {
          if (isTranscriptionDetailRoute()) renderDetailPage(state.detailItem);
        }
        if (!opts.quiet) toast('Marked as reviewed.');
      } else if (result.status === 404) {
        if (!opts.quiet) toast('Mark reviewed API not available yet.');
      } else if (!opts.quiet) {
        toast((result.j && result.j.error) || 'Could not mark reviewed.');
      }
      return result;
    });
  }

  function findItemById(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function resolveSyncIndexId(item, fallbackId) {
    if (!item) return String(fallbackId || '').trim();
    var id = String(item.id || fallbackId || '').trim();
    if (/^src_/i.test(id) && item.childIds && item.childIds.length) {
      return String(item.childIds[0]).trim();
    }
    return id;
  }

  function syncExtractionCount(item) {
    if (!item) return 0;
    return (
      meaningfulEntries(item.tasks).length +
      meaningfulEntries(item.calendarEvents || item.calendar_events).length
    );
  }

  function shouldUseBulkSync(item) {
    if (!item) return true;
    if (isSourceEntry(item) || item.item_type === 'source_entry') return true;
    if (/^src_/i.test(String(item.id || ''))) return true;
    var tasks = meaningfulEntries(item.tasks);
    var events = meaningfulEntries(item.calendarEvents || item.calendar_events);
    if (tasks.length + events.length !== 1) return true;
    if (item.item_type === 'task' && tasks.length === 1 && !events.length) return false;
    if (
      (item.item_type === 'calendar_event' || item.item_type === 'event') &&
      events.length === 1 &&
      !tasks.length
    ) {
      return false;
    }
    return true;
  }

  function syncItemRequest(id) {
    var item = findItemById(id);
    var targetId = resolveSyncIndexId(item, id);
    if (item && syncExtractionCount(item) === 0) {
      return Promise.resolve({
        id: id,
        ok: false,
        status: 0,
        j: { error: 'No tasks or calendar events to sync for this source.' },
      });
    }
    if (shouldUseBulkSync(item)) {
      return tryApi(['/api/admin/transcriptions/sync-bulk'], {
        method: 'POST',
        body: { id: targetId },
      }).then(function (pack) {
        return { id: id, ok: pack.ok, status: pack.status, j: pack.j, mode: 'bulk' };
      });
    }
    var itemType = item.item_type === 'calendar_event' ? 'event' : 'task';
    return tryApi(['/api/admin/transcriptions/sync-item'], {
      method: 'POST',
      body: { id: targetId, item_type: itemType, item_index: 0 },
    }).then(function (pack) {
      return { id: id, ok: pack.ok, status: pack.status, j: pack.j, mode: 'item' };
    });
  }

  function syncItem(id, opts) {
    opts = opts || {};
    if (!opts.quiet) hideToast();
    return syncItemRequest(id).then(function (result) {
      if (result.ok) {
        state.items.forEach(function (it) {
          if (it.id === id) {
            it.googleSyncPending = false;
            it.googleSynced = true;
          }
        });
        if (!opts.skipFeedRender) renderFeed();
        if (!opts.quiet) {
          toast(
            result.mode === 'bulk'
              ? 'Google bulk sync queued.'
              : 'Google sync queued.'
          );
        }
      } else if (result.status === 0) {
        if (!opts.quiet) {
          toastPersist((result.j && result.j.error) || 'Nothing to sync to Google.');
        }
      } else if (result.status === 404) {
        if (!opts.quiet) toastPersist('Google sync API not available yet.');
      } else if (!opts.quiet) {
        toastPersist((result.j && result.j.error) || 'Sync failed.');
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
        toastPersist('Bulk sync API not available yet.');
      } else {
        toastPersist((pack.j && pack.j.error) || 'Bulk sync failed.');
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
    var gen = ++indexLoadGen;
    state.loading = true;
    setLoadHint('Loading transcriptions index…', 'warn');
    var feed = byId('txFeed');
    if (feed) feed.setAttribute('aria-busy', 'true');

    var indexPaths = ['/api/admin/transcriptions/index', '/api/admin/transcriptions-index'];
    txLog(
      'API GET start',
      indexPaths[0],
      '· jwt len',
      adminJwt().length,
      '· url',
      typeof soApiUrl === 'function' ? soApiUrl(indexPaths[0]) : indexPaths[0]
    );

    return tryApi(indexPaths, {
      method: 'GET',
    })
      .then(function (pack) {
        if (gen !== indexLoadGen) {
          txLog('loadIndex: stale response ignored (gen', gen, 'current', indexLoadGen, ')');
          return;
        }
        state.loading = false;
        if (feed) feed.setAttribute('aria-busy', 'false');
        var rawCount = pack && pack.j && Array.isArray(pack.j.items) ? pack.j.items.length : 0;
        txLog('API response', pack.status, 'ok=' + pack.ok, 'raw items=' + rawCount);
        if (!pack.ok) {
          state.apiUnavailable = pack.status === 404;
          if (!state.items.length) {
            state.counts = {};
          }
          setLoadHint(formatIndexFetchError(pack), 'error');
          renderOverview();
          renderCategoryHeader();
          renderCategoryCards();
          renderFeed();
          return;
        }
        var norm;
        try {
          norm = normalizeIndex(pack.j);
        } catch (normErr) {
          console.error('[transcriptions] normalizeIndex failed', normErr);
          setLoadHint(formatIndexFetchError(null, normErr), 'error');
          renderFeed();
          return;
        }
        state.items = norm.items;
        state.counts = norm.counts;
        state.sourceCounts = norm.sourceCounts;
        state.rawTranscriptionCount = norm.rawTranscriptionCount;
        state.rawSources = norm.rawSources || {};
        applyIndexSort();
        state.pipeline = norm.pipeline || {};
        state.needsReviewCount = norm.needsReviewCount || 0;
        state.generatedAt = norm.generatedAt;
        state.indexMeta.projects = norm.projects;
        state.syncSettings = norm.syncSettings;
        state.searchResults = null;
        state.apiUnavailable = false;
        refreshDashboardCounts();

        var tgl = byId('txAutoSyncToggle');
        if (tgl) tgl.checked = state.syncSettings.auto_sync_google;

        var aiReady = aiReadySourceCount();
        var rawTotal = (state.rawSources && state.rawSources.total) || state.rawTranscriptionCount || 0;
        var excludedHint =
          rawTotal > aiReady
            ? ' · ' + (rawTotal - aiReady) + ' not in feed (open Processing diagnostics)'
            : '';
        setLoadHint(
          'Index ' +
            (norm.generatedAt ? new Date(norm.generatedAt).toLocaleString() : 'now') +
            ' · ' +
            aiReady +
            ' AI-ready source(s) · ' +
            (state.counts.total || 0) +
            ' extracted item(s)' +
            excludedHint,
          'ok'
        );

        renderStats();
        renderRawSourcesBox();
        renderOverview();
        renderCategoryHeader();
        renderCategoryCards();
        renderProjectSelect();
        syncFilterPills();
        renderDistribution();
        renderFeed();
      })
      .catch(function (err) {
        if (gen !== indexLoadGen) return;
        state.loading = false;
        if (feed) feed.setAttribute('aria-busy', 'false');
        console.error('[transcriptions] loadIndex failed', err);
        setLoadHint(formatIndexFetchError(null, err), 'error');
        renderOverview();
        renderCategoryHeader();
        renderCategoryCards();
        renderFeed();
        renderTimeline();
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

    var viewDiag = byId('txViewRawBtn');
    var diagDetails = byId('txDiagnostics');
    if (viewDiag && diagDetails) {
      viewDiag.disabled = false;
      viewDiag.addEventListener('click', function () {
        diagDetails.open = !diagDetails.open;
        renderRawSourcesBox();
        diagDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    state.favoriteIds = loadFavoriteIds();
    state.showEmptyCategories = loadShowEmptyCategoriesPref();
    state.groupByDate = loadGroupByPref();
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
            refreshDashboardCounts();
          }
          syncFilterPills();
          renderCategoryCards();
          renderOverview();
          renderCategoryHeader();
          renderStats();
          renderDistribution();
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

    syncSortSelectUi();
    var sortSel = byId('txSortSelect');
    if (sortSel) {
      sortSel.addEventListener('change', function () {
        state.sortOrder = sortSel.value === 'oldest' ? 'oldest' : 'recent';
        applyIndexSort();
        renderFeed();
      });
    }

    syncGroupBySelectUi();
    var groupSel = byId('txGroupBySelect');
    if (groupSel) {
      groupSel.addEventListener('change', function () {
        state.groupByDate = groupSel.value === 'source' ? 'source' : 'processed';
        saveGroupByPref(state.groupByDate);
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

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (state.selectMode) exitSelectMode();
        else if (openSheetId) closeTxSheet();
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

    bindTimelineLinks();
  }

  window.initAdminTranscriptionDetail = function () {
    var id = parseTxDetailIdFromPath();
    if (window.__txDashDetailInitId === id) {
      var root = byId('txDetailPageRoot');
      if (root && root.querySelector('.tx-detail-page__hero')) return;
    }
    window.__txDashDetailInitId = id;
    txLog('detail init · rev', window.TX_DASHBOARD_UI_REV, '· id', id);
    bindDetailPageChrome();
    var section = byId('transcriptionsDetailSection');
    if (section) {
      section.classList.add('tx-admin--dashboard');
      section.setAttribute('data-tx-dashboard-rev', String(window.TX_DASHBOARD_UI_REV || 0));
    }
    if (state.items.length) {
      loadAndRenderDetailPage();
      return;
    }
    var load = loadIndex();
    if (load && typeof load.then === 'function') {
      load.then(function () {
        if (isTranscriptionDetailRoute()) loadAndRenderDetailPage();
      });
    } else {
      loadAndRenderDetailPage();
    }
  };

  window.initAdminTranscriptions = function () {
    window.__txDashInitRan = true;
    txLog('init start · rev', window.TX_DASHBOARD_UI_REV, '· route', txShellPath());
    var section = byId('transcriptionsSection');
    if (section) {
      section.classList.add('tx-admin--dashboard');
      section.setAttribute('data-tx-dashboard-rev', String(window.TX_DASHBOARD_UI_REV || 0));
    }
    bindControls();
    renderDashboardBanner();
    renderOverview();
    renderCategoryHeader();
    renderDistribution();
    loadIndex();
  };

  function txShellPath() {
    return String(window.location.pathname || '').replace(/\/+$/, '') || '/';
  }

  function isTranscriptionsAdminRoute() {
    return isTranscriptionsListRoute();
  }

  function txWorkspaceVisible() {
    var w = byId('adminWorkspace');
    return w && !w.classList.contains('is-hidden');
  }

  function scheduleTxDashboardSelfInit() {
    function trySelfInit() {
      if (!txWorkspaceVisible()) return;
      if (isTranscriptionDetailRoute()) {
        if (typeof window.initAdminTranscriptionDetail === 'function') {
          window.initAdminTranscriptionDetail();
        }
        return;
      }
      if (window.__txDashInitRan) return;
      if (!isTranscriptionsListRoute()) return;
      if (typeof window.initAdminTranscriptions !== 'function') return;
      window.initAdminTranscriptions();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', trySelfInit);
    } else {
      trySelfInit();
    }

    var workspace = byId('adminWorkspace');
    if (workspace && typeof MutationObserver === 'function') {
      var obs = new MutationObserver(function () {
        trySelfInit();
      });
      obs.observe(workspace, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('popstate', function () {
      window.__txDashDetailInitId = null;
      window.__txDashInitRan = false;
      trySelfInit();
    });

    setTimeout(function () {
      if (!isTranscriptionsListRoute()) return;
      var cards = document.querySelectorAll('#txOverview .tx-overview-card').length;
      if (cards > 0) return;
      txLog('safety self-init after 2s');
      trySelfInit();
    }, 2000);
  }

  scheduleTxDashboardSelfInit();
})();
