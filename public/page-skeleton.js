(function () {
  'use strict';

  var root = document.documentElement;

  function usesNativeSkeleton() {
    return document.body && document.body.getAttribute('data-page-skeleton') === 'native';
  }

  function mount() {
    if (usesNativeSkeleton() || document.getElementById('soPageSkeleton')) return;
    var shell = document.createElement('div');
    shell.id = 'soPageSkeleton';
    shell.className = 'so-page-skeleton';
    shell.setAttribute('role', 'status');
    shell.setAttribute('aria-live', 'polite');
    shell.setAttribute('aria-label', 'Loading page');
    shell.innerHTML =
      '<div class="so-page-skeleton__block so-page-skeleton__block--hero"></div>' +
      '<div class="so-page-skeleton__block"></div>' +
      '<div class="so-page-skeleton__block so-page-skeleton__block--short"></div>';
    document.body.insertBefore(shell, document.body.firstChild);
    root.classList.add('so-page-loading');
  }

  function hide() {
    root.classList.remove('so-page-loading');
    var shell = document.getElementById('soPageSkeleton');
    if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
  }

  function finish() {
    var run = function () {
      var ready = window.soPageReady;
      if (ready && typeof ready.then === 'function') {
        ready.then(hide).catch(hide);
        return;
      }
      hide();
    };
    requestAnimationFrame(run);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', finish);
  } else {
    finish();
  }
})();
