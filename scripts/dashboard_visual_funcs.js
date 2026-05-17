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
      '<div class="tx-mini-ring tx-ring--compact" aria-hidden="true"><svg viewBox="0 0 48 48">' +
      '<circle cx="24" cy="24" r="18" fill="none" stroke="var(--tx-dash-line,#e2e8f0)" stroke-width="5"/>' +
      segs +
      '<text x="24" y="26" text-anchor="middle" font-size="9" fill="currentColor" font-weight="700">' +
      esc(centerLabel != null ? centerLabel : total) +
      '</text></svg></div>'
    ).replace(/<\/motion>/g, '</div>').replace(/<div/g, '<div');
  }

  function renderLargeCategoryIcon(cat) {
    var theme = catTheme(cat);
    return (
      '<div class="tx-dash-card__icon" style="--tx-cat-accent:' +
      esc(theme.accent) +
      '">' +
      iconSvg(cat).replace('tx-cat-card__icon', '') +
      '</div>'
    );
  }
