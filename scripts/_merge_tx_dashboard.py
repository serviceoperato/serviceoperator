# -*- coding: utf-8 -*-
"""Merge visual dashboard helpers into public/admin-transcriptions.js"""
from pathlib import Path
import re

ROOT = Path(r"c:\Users\NITRO\Documents\serviceopera.to")
JS = ROOT / "public" / "admin-transcriptions.js"

DASH_BLOCK = r'''
  var CATEGORY_THEME = {
    meetings: { accent: '#4f46e5', subtitle: 'Discussions, decisions, and follow-ups' },
    notes: { accent: '#0ea5e9', subtitle: 'Ideas, reminders, and personal takeaways' },
    tasks: { accent: '#10b981', subtitle: 'Action items and checklists' },
    calendar: { accent: '#f59e0b', subtitle: 'Dates, events, and scheduling' },
    projects: { accent: '#8b5cf6', subtitle: 'Project updates and blockers' },
    decisions: { accent: '#ec4899', subtitle: 'Confirmed choices and commitments' },
    'open-points': { accent: '#64748b', subtitle: 'Unresolved questions and owners' },
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
      var t = truncatePoint(p, 160);
      if (!t) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
    });
    return out;
  }

  function itemKeyPoints(item) {
    var pool = []
      .concat(item.decisions || [])
      .concat(item.tasks || [])
      .concat(item.openPoints || [])
      .concat(item.nextSteps || [])
      .concat(item.importantPoints || [])
      .concat(item.bullets || []);
    if (!pool.length && item.taskText) pool.push(item.taskText);
    if (!pool.length && item.decisionText) pool.push(item.decisionText);
    if (!pool.length && item.issue) pool.push(item.issue);
    if (!pool.length && item.summary) pool.push(item.summary);
    if (!pool.length && item.preview) pool.push(item.preview);
    return uniquePoints(pool).slice(0, 3);
  }

  function renderCompactRing(segments, centerLabel) {
    var chart = segments.filter(function (s) {
      return s.value > 0;
    });
    if (chart.length < 2) return '';
    var total = chart.reduce(function (s, c) {
      return s + c.value;
    }, 0);
    if (!total) return '';
    var r = 18;
    var cx = 24;
    var cy = 24;
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
    return (
      '<motion class="tx-mini-ring tx-ring--compact" aria-hidden="true"><svg viewBox="0 0 48 48">' +
      '<circle cx="24" cy="24" r="18" fill="none" stroke="var(--tx-dash-line,#e2e8f0)" stroke-width="5"/>' +
      segs +
      '<text x="24" y="26" text-anchor="middle" font-size="9" fill="currentColor" font-weight="700">' +
      esc(centerLabel != null ? centerLabel : total) +
      '</text></svg></motion>'
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
        : '<div class="tx-overview-card__visual">' + renderLargeCategoryIcon(c.key, 'tx-overview-card__icon') + '</motion>';
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
        '<p class="tx-overview-card__sub">' +
        esc(theme.subtitle) +
        '</p>' +
        (stats ? '<motion class="tx-overview-card__stats">' + stats + '</motion>' : '') +
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
      '</h2>' +
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
    var cat = item.category;
    var st = item.stats || {};
    var segs = [];
    if (cat === 'meetings' || cat === 'notes') {
      var d = st.decisions_count || (item.decisions || []).length;
      var t = st.tasks_count || (item.tasks || []).length;
      var o = st.open_points_count || (item.openPoints || []).length;
      if (d) segs.push({ value: d, color: '#ec4899' });
      if (t) segs.push({ value: t, color: '#10b981' });
      if (o) segs.push({ value: o, color: '#64748b' });
    } else if (cat === 'tasks') {
      var bucket = taskStatusBucket(item);
      if (bucket === 'open') segs.push({ value: 1, color: '#f59e0b' });
      else if (bucket === 'done') segs.push({ value: 1, color: '#10b981' });
      else segs.push({ value: 1, color: '#94a3b8' });
    }
    var ring = segs.length >= 2 ? renderCompactRing(segs) : '';
    if (ring) return '<div class="tx-dash-card__visual">' + ring + '</div>';
    return '<div class="tx-dash-card__visual">' + renderLargeCategoryIcon(cat) + '</div>';
  }

  function renderDashChip(c) {
    var cls = 'tx-dash-card__chip';
    if (c.ok) cls += ' tx-dash-card__chip--ok';
    if (c.warn) cls += ' tx-dash-card__chip--warn';
    if (c.accent) cls += ' tx-dash-card__chip--accent';
    return '<span class="' + cls + '">' + esc(c.t) + '</span>';
  }

'''.replace('<motion', '<motion').replace('</motion>', '</motion>')

# Fix motion typos in template - use div
DASH_BLOCK = DASH_BLOCK.replace('<motion', '<div').replace('</motion>', '</div>')

EMPTY_STATE = r'''  function emptyState(kind) {
    var map = {
      none: {
        title: 'No AI-ready outputs yet',
        body: 'Run the Voice Recorder pipeline to create meetings, notes, tasks, and more.',
      },
      raw: {
        title: 'Raw sources only',
        body: 'Sources exist but are not yet converted into structured outputs.',
      },
      filter: { title: 'No matches in this category', body: 'Try another category or clear filters.' },
      search: { title: 'No search results', body: 'Try different keywords or clear search.' },
    };
    var e = map[kind] || map.filter;
    var cat = state.category || 'notes';
    var theme = catTheme(cat);
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
  }'''

FEED_CARD = r'''  function renderFeedCard(item) {
    var points = itemKeyPoints(item);
    var chips = dashStatChips(item);
    var unread = !item.reviewed ? ' is-unread' : '';
    var junk = isJunkCard(item);
    var title = item.title || item.path || '';
    var catKey = String(item.category || 'notes').toLowerCase();
    var theme = catTheme(catKey);
    var outFile = outputBasename(item);
    var ts = relativeDate(item);
    var srcAudio = item.sourceAudio || '—';
    var syncSt = state.itemSyncState[item.id] || '';
    var syncCls = syncSt ? ' tx-card--sync-' + syncSt : '';
    var isSelected = !!state.selectedIds[item.id];
    var roleAttrs = state.selectMode
      ? ' role="checkbox" aria-checked="' + (isSelected ? 'true' : 'false') + '"'
      : '';
    var pointsHtml = points.length
      ? '<ul class="tx-dash-card__points">' +
        points
          .map(function (p) {
            return '<li>' + esc(p) + '</li>';
          })
          .join('') +
        '</ul>'
      : '';
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
      esc(categoryShortLabel(item.category)) +
      (item.project ? ' · ' + esc(item.project) : '') +
      ' · ' +
      esc(ts) +
      (outFile ? ' · ' + esc(outFile) : '') +
      '<br><span class="mono">Audio: ' +
      esc(srcAudio) +
      '</span></p>' +
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
      '">Mark reviewed</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" data-tx-action="sync" data-tx-id="' +
      esc(item.id) +
      '">Sync Google</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" disabled title="Coming soon">Copy</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" disabled title="Coming soon">Reprocess</button>' +
      '</div></div></article>'
    );
  }'''

DETAIL = r'''  function renderDetailContent(item) {
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

    var points = itemKeyPoints(item);
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

    el.innerHTML = el.innerHTML.replace('</motion>', '</div>').replace('<motion', '<div');

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
  }'''

DETAIL = DETAIL.replace('<motion', '<motion').replace('</motion>', '</motion>')
DETAIL = DETAIL.replace('<motion', '<motion')
# clean detail
DETAIL = re.sub(r'</motion>', '</div>', DETAIL)
DETAIL = DETAIL.replace('<motion', '<div')
DETAIL = DETAIL.replace("el.innerHTML = el.innerHTML.replace('</motion>', '</div>').replace('<motion', '<div');\n\n    ", "")

def main():
    text = JS.read_text(encoding='utf-8')

    if 'function renderOverview()' in text:
        print('Dashboard already merged')
        return

    marker = '  function parseItemDate(item) {'
    if marker not in text:
        raise SystemExit('parseItemDate marker not found')

    text = text.replace(marker, DASH_BLOCK + '\n' + marker, 1)

    text = re.sub(
        r'  function emptyState\(kind\) \{[\s\S]*?  \}\n\n  function outputBasename',
        EMPTY_STATE + '\n\n  function outputBasename',
        text,
        count=1,
    )

    text = re.sub(
        r'  function renderFeedCard\(item\) \{[\s\S]*?  \}\n\n  function bindFeedActions',
        FEED_CARD + '\n\n  function bindFeedActions',
        text,
        count=1,
    )

    text = re.sub(
        r'  function renderDetailContent\(item\) \{[\s\S]*?  \}\n\n  function openOverlay',
        DETAIL + '\n\n  function openOverlay',
        text,
        count=1,
    )

    text = text.replace(
        "    root.querySelectorAll('.tx-card').forEach(function (card) {",
        "    root.querySelectorAll('.tx-dash-card, .tx-card').forEach(function (card) {",
        1,
    )

    text = text.replace(
        '    renderDigest();\n\n    var list;',
        '    renderDigest();\n    renderOverview();\n    renderCategoryHeader();\n\n    var list;',
        1,
    )

    text = text.replace(
        '    renderCategoryCards();\n    renderProjectSelect();',
        '    renderCategoryCards();\n    renderOverview();\n    renderCategoryHeader();\n    renderProjectSelect();',
        1,
    )

    JS.write_text(text, encoding='utf-8')
    print('Merged dashboard into', JS)

if __name__ == '__main__':
    main()
