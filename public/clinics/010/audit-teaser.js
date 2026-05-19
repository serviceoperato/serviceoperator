(function () {
  'use strict';

  var DONUT_DATA = [
    { label: 'Booking Friction', value: 28, color: '#4f46e5' },
    { label: 'No Follow-Up', value: 22, color: '#f59e0b' },
    { label: 'Review Gap', value: 18, color: '#2563eb' },
    { label: 'Multilingual Miss', value: 15, color: '#7c3aed' },
    { label: 'Slow Response', value: 12, color: '#0891b2' },
    { label: 'Trust Signals', value: 5, color: '#16a34a' }
  ];

  function buildDonutSlices() {
    var cx = 100;
    var cy = 100;
    var r = 72;
    var inner = 44;
    var total = DONUT_DATA.reduce(function (s, d) { return s + d.value; }, 0);
    var cursor = -90;
    return DONUT_DATA.map(function (d) {
      var deg = (d.value / total) * 360;
      var start = cursor;
      var end = cursor + deg - 1.5;
      cursor += deg;
      var toRad = function (a) { return (a * Math.PI) / 180; };
      var x1 = cx + r * Math.cos(toRad(start));
      var y1 = cy + r * Math.sin(toRad(start));
      var x2 = cx + r * Math.cos(toRad(end));
      var y2 = cy + r * Math.sin(toRad(end));
      var xi1 = cx + inner * Math.cos(toRad(start));
      var yi1 = cy + inner * Math.sin(toRad(start));
      var xi2 = cx + inner * Math.cos(toRad(end));
      var yi2 = cy + inner * Math.sin(toRad(end));
      var large = deg > 180 ? 1 : 0;
      return {
        label: d.label,
        value: d.value,
        color: d.color,
        path: [
          'M ' + x1 + ' ' + y1,
          'A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2,
          'L ' + xi2 + ' ' + yi2,
          'A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + xi1 + ' ' + yi1,
          'Z'
        ].join(' ')
      };
    });
  }

  function observeAnimate(el, onVisible) {
    if (!el || typeof IntersectionObserver === 'undefined') {
      onVisible();
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          onVisible();
          obs.disconnect();
        }
      });
    }, { threshold: 0.3 });
    obs.observe(el);
  }

  function animateReviewBars(root) {
    root.querySelectorAll('.so-review-bar-fill').forEach(function (el) {
      var h = el.getAttribute('data-height');
      if (h) el.style.height = h;
    });
  }

  function initReviewBars(root) {
    if (!root) return;
    var inGate = root.closest && root.closest('#soGateHidden');
    if (inGate) {
      setTimeout(function () {
        animateReviewBars(root);
      }, 500);
      return;
    }
    observeAnimate(root, function () {
      animateReviewBars(root);
    });
  }

  function initDonutSection(root) {
    var svg = root.querySelector('.so-donut-svg');
    var legend = root.querySelector('.so-donut-legend');
    if (!svg || !legend) return;

    var slices = buildDonutSlices();
    var total = DONUT_DATA.reduce(function (s, d) { return s + d.value; }, 0);
    var hovered = null;
    var pathEls = [];
    var centerMain = root.querySelector('[data-donut-center-main]');
    var centerSub = root.querySelector('[data-donut-center-sub]');
    var anchor = svg.querySelector('text');

    function updateDonut() {
      pathEls.forEach(function (p, i) {
        p.style.opacity = hovered === null ? '1' : hovered === i ? '1' : '0.35';
      });
      legend.querySelectorAll('.so-donut-legend-item').forEach(function (el, i) {
        el.classList.toggle('is-dim', hovered !== null && hovered !== i);
      });
      if (!centerMain || !centerSub) return;
      if (hovered !== null) {
        var h = DONUT_DATA[hovered];
        centerMain.textContent = h.value + '%';
        centerMain.setAttribute('fill', h.color);
        centerSub.textContent = h.label.split(' ')[0];
      } else {
        centerMain.textContent = total + '%';
        centerMain.setAttribute('fill', '#0f0f0f');
        centerSub.textContent = 'GAPS';
      }
    }

    slices.forEach(function (s, i) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', s.path);
      path.setAttribute('fill', s.color);
      path.style.cursor = 'pointer';
      path.style.transition = 'opacity .2s';
      path.addEventListener('mouseenter', function () { hovered = i; updateDonut(); });
      path.addEventListener('mouseleave', function () { hovered = null; updateDonut(); });
      svg.insertBefore(path, anchor);
      pathEls.push(path);
    });

    DONUT_DATA.forEach(function (d, i) {
      var item = document.createElement('div');
      item.className = 'so-donut-legend-item';
      item.innerHTML =
        '<span class="so-donut-swatch" style="background:' + d.color + '"></span>' +
        '<span class="so-donut-legend-label">' + d.label + '</span>' +
        '<span class="so-donut-legend-pct" style="color:' + d.color + '">' + d.value + '%</span>' +
        '<span class="so-donut-bar-track"><span class="so-donut-bar-fill" style="background:' + d.color + '" data-width="' + d.value + '"></span></span>';
      item.addEventListener('mouseenter', function () { hovered = i; updateDonut(); });
      item.addEventListener('mouseleave', function () { hovered = null; updateDonut(); });
      legend.appendChild(item);
    });

    var note = document.createElement('p');
    note.className = 'so-donut-note';
    note.textContent = 'Hover a segment to inspect. Distribution from public signal analysis.';
    legend.appendChild(note);

    observeAnimate(root, function () {
      svg.classList.add('is-animated');
      legend.querySelectorAll('.so-donut-bar-fill').forEach(function (bar, idx) {
        setTimeout(function () {
          bar.style.width = bar.getAttribute('data-width') + '%';
        }, 80 + idx * 80);
      });
    });
  }

  function boot() {
    var donutRoot = document.getElementById('soDonutChart');
    if (donutRoot) initDonutSection(donutRoot);
    var reviewRoot = document.getElementById('soReviewGap');
    if (reviewRoot) initReviewBars(reviewRoot);
    var foot = document.getElementById('soFootnoteDate');
    if (foot) {
      foot.textContent = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
