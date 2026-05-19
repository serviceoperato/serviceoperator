(function () {
  'use strict';

  var EXIT_KEY = 'so_audit_010_exit_intent';
  var SCROLL_SHOW = 120;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isDesktopPointer() {
    return window.matchMedia && window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  }

  function getFocusables(container) {
    var sel =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(container.querySelectorAll(sel)).filter(function (el) {
      return !el.hidden && el.getAttribute('aria-hidden') !== 'true';
    });
  }

  function init() {
    var modal = document.getElementById('soAuditModal');
    var sticky = document.getElementById('soStickyCta');
    var openers = document.querySelectorAll('[data-so-audit-modal-open]');
    if (!modal || !sticky || !openers.length) return;

    var panel = modal.querySelector('.so-modal__panel');
    var closers = modal.querySelectorAll('[data-so-modal-close]');
    var lastFocus = null;
    var untrapFocus = null;
    var exitBound = false;
    var openedOnce = false;

    function setStickyVisible(show) {
      if (show) {
        sticky.removeAttribute('hidden');
        sticky.classList.add('is-visible');
        document.body.classList.add('has-so-sticky-cta');
      } else {
        sticky.setAttribute('hidden', '');
        sticky.classList.remove('is-visible');
        document.body.classList.remove('has-so-sticky-cta');
      }
    }

    function trapFocus() {
      function onKeyDown(e) {
        if (e.key !== 'Tab' || !panel) return;
        var focusables = getFocusables(panel);
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      modal.addEventListener('keydown', onKeyDown);
      return function () {
        modal.removeEventListener('keydown', onKeyDown);
      };
    }

    function openModal(trigger) {
      if (modal.classList.contains('is-open')) return;
      openedOnce = true;
      lastFocus = trigger && trigger.focus ? trigger : document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('so-modal-open');
      setStickyVisible(false);
      untrapFocus = trapFocus();
      window.setTimeout(function () {
        var inquiry = document.getElementById('soModalInquiry');
        var email = inquiry && inquiry.querySelector('input[type="email"]');
        if (email) email.focus();
        else {
          var focusables = panel ? getFocusables(panel) : [];
          if (focusables[0]) focusables[0].focus();
        }
      }, prefersReducedMotion() ? 0 : 80);
    }

    function closeModal() {
      if (!modal.classList.contains('is-open')) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('so-modal-open');
      if (untrapFocus) {
        untrapFocus();
        untrapFocus = null;
      }
      updateStickyFromScroll();
      if (lastFocus && lastFocus.focus) {
        try {
          lastFocus.focus();
        } catch (err) {
          /* ignore */
        }
      }
    }

    function updateStickyFromScroll() {
      if (modal.classList.contains('is-open')) return;
      var show = window.scrollY >= SCROLL_SHOW;
      var gate = document.getElementById('soGateInquiry');
      if (gate && typeof IntersectionObserver !== 'undefined') {
        /* gate observer handles overlap; scroll threshold still applies */
      }
      if (!show) {
        setStickyVisible(false);
        return;
      }
      if (sticky.classList.contains('is-near-gate')) {
        setStickyVisible(false);
        return;
      }
      setStickyVisible(true);
    }

    openers.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(btn);
      });
    });

    closers.forEach(function (el) {
      el.addEventListener('click', function () {
        closeModal();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        e.preventDefault();
        closeModal();
      }
    });

    window.addEventListener('scroll', updateStickyFromScroll, { passive: true });
    updateStickyFromScroll();

    var gate = document.getElementById('soGateInquiry');
    if (gate && typeof IntersectionObserver !== 'undefined') {
      var gateObs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            sticky.classList.toggle('is-near-gate', entry.isIntersecting && entry.intersectionRatio > 0.2);
          });
          updateStickyFromScroll();
        },
        { root: null, threshold: [0, 0.2, 0.5] }
      );
      gateObs.observe(gate);
    }

    function bindExitIntent() {
      if (exitBound || !isDesktopPointer()) return;
      exitBound = true;
      try {
        if (sessionStorage.getItem(EXIT_KEY) === '1') return;
      } catch (err) {
        /* ignore */
      }

      document.documentElement.addEventListener(
        'mouseout',
        function (e) {
          if (openedOnce || modal.classList.contains('is-open')) return;
          if (e.relatedTarget != null || e.clientY > 8) return;
          try {
            sessionStorage.setItem(EXIT_KEY, '1');
          } catch (err2) {
            /* ignore */
          }
          openModal(null);
        },
        { passive: true }
      );
    }

    bindExitIntent();
    window.matchMedia('(min-width: 768px)').addEventListener('change', bindExitIntent);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
