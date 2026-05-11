/* ServiceOpera.to — light / dark theme toggle (sole = passa al chiaro, luna = passa allo scuro) */
(function () {
  var KEY = 'so-theme';
  /* Emoji: massima compatibilità rispetto a SVG via innerHTML */
  var GLYPH_SUN = '\u2600\uFE0F';
  var GLYPH_MOON = '\uD83C\uDF19';

  function current() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    var next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    syncButtons();
  }

  function syncButtons() {
    var dark = current() === 'dark';
    var label = dark ? 'Attiva tema chiaro (sole)' : 'Attiva tema scuro (luna)';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.textContent = dark ? GLYPH_SUN : GLYPH_MOON;
    });
  }

  function toggle() {
    apply(current() === 'dark' ? 'light' : 'dark');
  }

  function initButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggle();
      });
    });
    syncButtons();
  }

  function boot() {
    initButtons();
    window.addEventListener('load', syncButtons);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
