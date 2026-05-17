/**
 * Admin /admin/transcriptions — AI-ready voice outputs browser.
 */
(function () {
  'use strict';

  var state = {
    items: [],
    filtered: [],
    selectedId: null,
    category: 'all',
    sort: 'newest',
    search: '',
  };

  var CATEGORIES = [
    { key: 'meetings', label: 'Meeting Summaries' },
    { key: 'notes', label: 'Personal Notes' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'calendar', label: 'Calendar Events' },
    { key: 'projects', label: 'Project Updates' },
    { key: 'decisions', label: 'Decision Log' },
    { key: 'open-points', label: 'Open Points / Questions' },
  ];

  function api(path) {
    return typeof window.__soApiUrl === 'function' ? window.__soApiUrl(path) : path;
  }

  function apiCred() {
    return typeof window.__soApiCredentials === 'function' ? window.__soApiCredentials() : 'same-origin';
  }

  function adminJwt() {
    return typeof readStoredAdminJwt === 'function' ? readStoredAdminJwt() : '';
  }

  function esc(s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function parseDate(item) {
    var d = item.processedDate || item.eventDate || item.title || '';
    var t = Date.parse(d);
    return Number.isNaN(t) ? 0 : t;
  }

  function applyFilters() {
    var q = state.search.trim().toLowerCase();
    var list = state.items.slice();
    if (state.category !== 'all') {
      list = list.filter(function (it) {
        return it.category === state.category;
      });
    }
    if (q) {
      list = list.filter(function (it) {
        var blob = [
          it.title,
          it.preview,
          it.summary,
          it.path,
          it.sourceAudio,
          it.sourceTranscription,
          it.project,
          it.taskText,
          it.decisionText,
          it.issue,
          it.body,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.indexOf(q) !== -1;
      });
    }
    list.sort(function (a, b) {
      if (state.sort === 'oldest') return parseDate(a) - parseDate(b);
      if (state.sort === 'category') return (a.category || '').localeCompare(b.category || '');
      if (state.sort === 'project') return (a.project || '').localeCompare(b.project || '');
      if (state.sort === 'filename') return (a.path || '').localeCompare(b.path || '');
      return parseDate(b) - parseDate(a);
    });
    state.filtered = list;
  }

  function renderCounters(counts) {
    var el = byId('txCounts');
    if (!el || !counts) return;
    el.innerHTML = CATEGORIES.map(function (c) {
      return (
        '<div class="tx-count-card"><span class="tx-count-card__n">' +
        esc(counts[c.key] != null ? counts[c.key] : 0) +
        '</span><span class="tx-count-card__l">' +
        esc(c.label) +
        '</span></div>'
      );
    }).join('');
  }

  function renderList() {
    var listEl = byId('txList');
    var hint = byId('txListHint');
    if (!listEl) return;
    applyFilters();
    if (!state.items.length) {
      listEl.innerHTML = '';
      if (hint) hint.textContent = '';
      return;
    }
    if (!state.filtered.length) {
      listEl.innerHTML = '';
      if (hint) hint.textContent = 'No items match your filters.';
      return;
    }
    if (hint) hint.textContent = state.filtered.length + ' item(s)';
    listEl.innerHTML = state.filtered
      .map(function (it) {
        var active = it.id === state.selectedId ? ' is-active' : '';
        return (
          '<button type="button" class="tx-list-item' +
          active +
          '" data-tx-id="' +
          esc(it.id) +
          '">' +
          '<span class="tx-list-item__cat mono">' +
          esc(it.categoryLabel || it.category) +
          '</span>' +
          '<strong class="tx-list-item__title">' +
          esc(it.title || it.path) +
          '</strong>' +
          '<span class="tx-list-item__meta mono">' +
          esc(it.sourceAudio || '—') +
          (it.processedDate ? ' · ' + esc(it.processedDate) : '') +
          '</span>' +
          '<span class="tx-list-item__preview">' +
          esc(it.preview || '') +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    listEl.querySelectorAll('[data-tx-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedId = btn.getAttribute('data-tx-id');
        renderList();
        renderDetail();
      });
    });
  }

  function relatedItems(item, cat) {
    if (!item) return [];
    var audio = item.sourceAudio || '';
    var trans = item.sourceTranscription || '';
    return state.items.filter(function (it) {
      if (it.category !== cat) return false;
      if (it.id === item.id) return false;
      if (audio && it.sourceAudio === audio) return true;
      if (trans && it.sourceTranscription === trans) return true;
      return false;
    });
  }

  function renderDetail() {
    var el = byId('txDetail');
    if (!el) return;
    var item = state.items.find(function (it) {
      return it.id === state.selectedId;
    });
    if (!item) {
      el.innerHTML = '<p class="tf-admin-muted">Select an item to view details.</p>';
      return;
    }
    var bullets = function (label, arr) {
      if (!arr || !arr.length) return '';
      return (
        '<p><strong>' +
        esc(label) +
        '</strong></p><ul>' +
        arr.map(function (x) {
          return '<li>' + esc(x) + '</li>';
        }).join('') +
        '</ul>'
      );
    };
    el.innerHTML =
      '<div class="tx-detail">' +
      '<p class="mono" style="margin:0 0 0.5rem">' +
      esc(item.categoryLabel) +
      '</p>' +
      '<h3 style="margin:0 0 0.75rem">' +
      esc(item.title) +
      '</h3>' +
      '<ul class="tx-detail__meta">' +
      '<li><strong>Source audio:</strong> ' +
      esc(item.sourceAudio || '—') +
      '</li>' +
      '<li><strong>Source transcription:</strong> <code>' +
      esc(item.sourceTranscription || '—') +
      '</code></li>' +
      '<li><strong>File:</strong> <code>' +
      esc(item.path) +
      '</code></li>' +
      '<li><strong>Processed:</strong> ' +
      esc(item.processedDate || '—') +
      '</li>' +
      (item.project ? '<li><strong>Project:</strong> ' + esc(item.project) + '</li>' : '') +
      '</ul>' +
      (item.summary ? '<p><strong>Summary</strong></p><p>' + esc(item.summary) + '</p>' : '') +
      bullets('Decisions', item.decisions) +
      bullets('Tasks', item.tasks) +
      bullets('Open points', item.openPoints) +
      bullets('Next steps', item.nextSteps) +
      bullets('Important points', item.importantPoints) +
      bullets('Possible actions', item.possibleActions) +
      '<pre class="mono tx-detail__body">' +
      esc(item.body || '') +
      '</pre>' +
      '<div class="tx-actions">' +
      '<button type="button" class="tf-admin-toolbar__btn" id="txCopyBtn">Copy content</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" disabled title="Coming soon">Mark reviewed</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" disabled title="Coming soon">Reprocess</button>' +
      '</div>' +
      '</div>';
    var copyBtn = byId('txCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = item.body || item.preview || '';
        navigator.clipboard.writeText(text).catch(function () {});
      });
    }
  }

  function renderEmpty(index) {
    var el = byId('txEmpty');
    if (!el) return;
    if (index.counts && index.counts.total > 0) {
      el.classList.add('is-hidden');
      return;
    }
    el.classList.remove('is-hidden');
    if (index.rawTranscriptionCount > 0) {
      el.textContent =
        'Raw transcriptions exist, but no processed AI-ready outputs have been generated yet. Run the processing pipeline to create meetings, notes, tasks, calendar events, project updates, decisions, and open points.';
    } else {
      el.textContent =
        'No processed transcription outputs found yet. Run the Voice Recorder pipeline first.';
    }
  }

  function loadIndex() {
    var hint = byId('txLoadHint');
    if (hint) hint.textContent = 'Loading…';
    return fetch(api('/api/admin/transcriptions-index'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + adminJwt() },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (pack) {
        if (!pack.ok) {
          if (hint) hint.textContent = (pack.j && pack.j.error) || 'Could not load index.';
          return;
        }
        state.items = pack.j.items || [];
        renderCounters(pack.j.counts);
        renderEmpty(pack.j);
        if (hint) {
          hint.textContent =
            'Updated ' +
            (pack.j.generatedAt ? new Date(pack.j.generatedAt).toLocaleString() : 'now') +
            ' · ' +
            (pack.j.rawTranscriptionCount || 0) +
            ' raw transcription(s) on disk';
        }
        if (state.items.length && !state.selectedId) state.selectedId = state.items[0].id;
        renderList();
        renderDetail();
      })
      .catch(function () {
        if (hint) hint.textContent = 'Network error loading transcriptions index.';
      });
  }

  function bindControls() {
    var search = byId('txSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.search = search.value;
        renderList();
      });
    }
    var sort = byId('txSort');
    if (sort) {
      sort.addEventListener('change', function () {
        state.sort = sort.value;
        renderList();
      });
    }
    var tabs = byId('txTabs');
    if (tabs) {
      tabs.querySelectorAll('[data-tx-cat]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.category = btn.getAttribute('data-tx-cat') || 'all';
          tabs.querySelectorAll('[data-tx-cat]').forEach(function (b) {
            b.classList.toggle('is-active', b === btn);
          });
          renderList();
        });
      });
    }
    var refresh = byId('txRefreshBtn');
    if (refresh) refresh.addEventListener('click', loadIndex);
  }

  var bound = false;

  window.initAdminTranscriptions = function () {
    bindControls();
    if (!bound) {
      bound = true;
    }
    loadIndex();
  };
})();
