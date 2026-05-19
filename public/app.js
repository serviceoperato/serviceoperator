// =============================================
// www.serviceopera.to — landing page interactions
// =============================================

(function () {
  const modal = document.getElementById('portalModal');
  if (!modal) return;

  const openers = [
    document.getElementById('clientPortalBtn'),
    document.getElementById('footerPortal'),
  ].filter(Boolean);

  const closers = modal.querySelectorAll('[data-close]');
  const form = document.getElementById('portalForm');
  const hint = document.getElementById('portalHint');

  function open(e) {
    if (e) e.preventDefault();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const first = modal.querySelector('input');
      if (first) first.focus();
    }, 100);
  }
  function close() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (hint) { hint.textContent = ''; hint.className = 'portal-form__hint mono'; }
    if (form) form.reset();
  }

  openers.forEach((el) => el.addEventListener('click', open));
  closers.forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const u = (fd.get('username') || '').toString().trim().toLowerCase();
      const p = (fd.get('password') || '').toString();
      if (typeof window.soDemoPortalLogin !== 'function') {
        if (hint) {
          hint.textContent = 'Demo sign-in requires the Node server (credentials are not stored in the browser).';
          hint.className = 'portal-form__hint mono is-error';
        }
        return;
      }
      if (hint) {
        hint.textContent = 'Checking credentials…';
        hint.className = 'portal-form__hint mono';
      }
      window
        .soDemoPortalLogin(u, p)
        .then((rec) => {
          if (hint) {
            hint.textContent = 'Access granted. Opening workspace…';
            hint.className = 'portal-form__hint mono is-ok';
          }
          setTimeout(() => {
            const dest = 'client.html';
            window.location.href = rec.slug ? dest + '#' + encodeURIComponent(rec.slug) : dest;
          }, 500);
        })
        .catch((err) => {
          if (hint) {
            hint.textContent =
              (err && err.message) || 'Invalid credentials. Check the access details you received.';
            hint.className = 'portal-form__hint mono is-error';
          }
          const pw = form.querySelector('input[type="password"]');
          if (pw) pw.value = '';
        });
    });
  }
})();

// =============================================
// Landing: vertical hero (clinics / hotels / real estate — key still `properties`)
// =============================================
(function verticalHero() {
  var pills = document.querySelectorAll('.vertical-pill[data-vertical]');
  var heroCopy = document.getElementById('heroCopy');
  var titleEl = document.getElementById('heroTitleEl');
  var ledeEl = document.getElementById('heroLedeEl');
  var primaryCta = document.getElementById('heroPrimaryCta');
  var secondaryCta = document.getElementById('heroSecondaryCta');
  if (!pills.length || !heroCopy || !titleEl || !ledeEl || !primaryCta || !secondaryCta) return;

  function contactFormUrl() {
    if (window.SoSiteContact && typeof window.SoSiteContact.contactFormUrl === 'function') {
      return window.SoSiteContact.contactFormUrl();
    }
    return '/free-audit.html';
  }
  var CONTACT_FORM = contactFormUrl();

  var TITLE_HTML =
    '<span class="line">AI Operations for Service Businesses</span>' +
    '<span class="line line--soft">Hotels, Clinics &amp; Property · Worldwide</span>';
  var LEDE =
    'Public footprint, reviews, competitors, and lead flows are reviewed; the output is practical automation scoped to international-facing operators — faster replies, structured follow-up, and less manual repetition.';

  var COPY = {
    clinics: { lede: LEDE },
    hotels: { lede: LEDE },
    properties: { lede: LEDE },
  };

  function applyCopy(key) {
    var c = COPY[key];
    if (!c) return;
    titleEl.className = 'hero__title hero__title--lead';
    titleEl.innerHTML = TITLE_HTML;
    ledeEl.textContent = c.lede;
    primaryCta.setAttribute('href', CONTACT_FORM);
    primaryCta.innerHTML = 'View your private AI Operations Report<span class="ico-arrow-r" aria-hidden="true"></span>';
    secondaryCta.setAttribute('href', CONTACT_FORM);
    secondaryCta.textContent = 'Request an Automation Audit';
    heroCopy.classList.add('has-hero-sample');
  }

  function setActive(key) {
    pills.forEach(function (btn) {
      var v = btn.getAttribute('data-vertical');
      var on = v === key;
      btn.classList.toggle('vertical-pill--active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function switchVertical(key) {
    if (!COPY[key]) return;
    heroCopy.style.opacity = '0';
    window.setTimeout(function () {
      applyCopy(key);
      setActive(key);
      void heroCopy.offsetWidth;
      heroCopy.style.opacity = '1';
    }, 200);
  }

  pills.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-vertical');
      if (!key || btn.classList.contains('vertical-pill--active')) return;
      switchVertical(key);
    });
  });
})();
