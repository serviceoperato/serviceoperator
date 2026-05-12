// =============================================
// ServiceOpera.to — landing page interactions
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

  // Demo credentials map.
  // For each prospect Jack adds an entry here (or serves it from the backend).
  // username -> { password, slug, business }
  const CREDENTIALS = {
    'amari-resort':   { password: 'demo2026', slug: 'amari-resort',   business: 'Amari Resort · Thailand' },
    'serenity-dental':{ password: 'demo2026', slug: 'serenity-dental',business: 'Serenity Dental Clinic' },
    'jomtien-living': { password: 'demo2026', slug: 'jomtien-living', business: 'Coastal Living Properties' },
    'demo':           { password: 'demo',     slug: 'demo',           business: 'Demo Property · Thailand' },
  };

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const u = (fd.get('username') || '').toString().trim().toLowerCase();
      const p = (fd.get('password') || '').toString().trim();
      const rec = CREDENTIALS[u];

      if (!rec || rec.password !== p) {
        hint.textContent = 'Invalid credentials. Check the access details Jack sent you.';
        hint.className = 'portal-form__hint mono is-error';
        form.querySelector('input[type="password"]').value = '';
        return;
      }

      hint.textContent = 'Access granted. Opening workspace…';
      hint.className = 'portal-form__hint mono is-ok';
      // Pass the slug to client.html via hash so it can be themed.
      // (Hash isn't sent to a server — fine for a static demo.)
      sessionStorage.setItem('so_client', rec.slug);
      sessionStorage.setItem('so_business', rec.business);
      setTimeout(() => {
        window.location.href = 'client.html#' + encodeURIComponent(rec.slug);
      }, 500);
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

  var MAIL_REPORT =
    'mailto:jack@serviceopera.to?subject=' +
    encodeURIComponent('Request: Private AI Operations Report') +
    '&body=' +
    encodeURIComponent(
      'Hi Jack,\n\nBusiness name:\nCity / area in Thailand:\nWebsite:\nWhat I want the report to focus on:\n\nThanks.'
    );
  var MAIL_AUDIT =
    'mailto:jack@serviceopera.to?subject=' +
    encodeURIComponent('Request: Automation Audit') +
    '&body=' +
    encodeURIComponent(
      'Hi Jack,\n\nBusiness name:\nSector (hotel / clinic / property):\nWhat feels broken in operations today:\n\nThanks.'
    );

  var TITLE_HTML =
    '<span class="line">AI Operations for Thailand</span>' +
    '<span class="line line--soft">Hotels, Clinics &amp; Property Businesses</span>';
  var LEDE =
    'I analyze public business data, reviews, competitors and lead flows, then build practical AI systems that help Thailand service businesses capture more inquiries, reply faster and automate repetitive work.';

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
    primaryCta.setAttribute('href', MAIL_REPORT);
    primaryCta.innerHTML = 'View your private AI Operations Report<span class="ico-arrow-r" aria-hidden="true"></span>';
    secondaryCta.setAttribute('href', MAIL_AUDIT);
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
