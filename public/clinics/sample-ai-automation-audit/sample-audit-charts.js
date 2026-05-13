/**
 * Chart.js init for the public sample audit page only (static fictional data).
 * Theme follows documentElement data-theme (light default).
 */
(function () {
  var chartInstance = null;

  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function chartPalette() {
    if (isLightTheme()) {
      return {
        grid: 'rgba(30, 27, 75, 0.08)',
        tick: '#475569',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e2e8f0',
        titleColor: '#0f172a',
        bodyColor: '#475569',
      };
    }
    return {
      grid: 'rgba(255,255,255,0.06)',
      tick: '#94a3b8',
      tooltipBg: '#1e293b',
      tooltipBorder: '#334155',
      titleColor: '#f8fafc',
      bodyColor: '#cbd5e1',
    };
  }

  function applyChartTheme(chart) {
    if (!chart || !chart.options) return;
    var p = chartPalette();
    chart.options.plugins = chart.options.plugins || {};
    chart.options.plugins.tooltip = chart.options.plugins.tooltip || {};
    chart.options.plugins.tooltip.backgroundColor = p.tooltipBg;
    chart.options.plugins.tooltip.borderColor = p.tooltipBorder;
    chart.options.plugins.tooltip.titleColor = p.titleColor;
    chart.options.plugins.tooltip.bodyColor = p.bodyColor;
    if (chart.options.scales) {
      ['x', 'y', 'y1'].forEach(function (key) {
        var sc = chart.options.scales[key];
        if (!sc) return;
        if (sc.grid) sc.grid.color = p.grid;
        if (sc.ticks) sc.ticks.color = p.tick;
        if (sc.title) sc.title.color = p.tick;
      });
    }
    chart.update('none');
  }

  function initTrendChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initTrendChart, 200);
      return;
    }
    var el = document.getElementById('soSampleTrendChart');
    if (!el) return;
    if (chartInstance) {
      applyChartTheme(chartInstance);
      return;
    }
    var ctx = el.getContext('2d');
    var labels = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];
    var rating = [72, 74, 73, 75, 76, 77, 76, 78, 79, 78, 80, 79];
    var volume = [3, 4, 3, 5, 4, 3, 4, 5, 4, 3, 4, 3];
    var responseRate = [18, 15, 20, 12, 16, 14, 17, 19, 16, 15, 18, 14];
    var sentiment = [58, 60, 59, 61, 63, 62, 64, 63, 65, 64, 66, 65];
    var p = chartPalette();

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Composite score (×10)',
            data: rating,
            borderColor: '#312e81',
            backgroundColor: 'rgba(49, 46, 129, 0.12)',
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
          },
          {
            label: 'Illustrative review cadence',
            data: volume,
            borderColor: '#0f766e',
            backgroundColor: 'rgba(15, 118, 110, 0.1)',
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            yAxisID: 'y1',
          },
          {
            label: 'Modeled reply coverage %',
            data: responseRate,
            borderColor: '#b45309',
            backgroundColor: 'rgba(180, 83, 9, 0.08)',
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderDash: [4, 3],
          },
          {
            label: 'Synthetic sentiment index',
            data: sentiment,
            borderColor: '#0369a1',
            backgroundColor: 'rgba(3, 105, 161, 0.08)',
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: p.tooltipBg,
            borderColor: p.tooltipBorder,
            borderWidth: 1,
            titleColor: p.titleColor,
            bodyColor: p.bodyColor,
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { color: p.grid, drawBorder: false },
            ticks: { color: p.tick, font: { size: 11 } },
          },
          y: {
            position: 'left',
            grid: { color: p.grid, drawBorder: false },
            ticks: { color: p.tick, font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 100,
            title: { display: true, text: 'Index / %', color: p.tick, font: { size: 10 } },
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: { color: p.tick, font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 10,
            title: { display: true, text: 'units / mo', color: p.tick, font: { size: 10 } },
          },
        },
      },
    });

    try {
      var obs = new MutationObserver(function () {
        applyChartTheme(chartInstance);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {
      /* ignore */
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTrendChart);
  else initTrendChart();
})();
