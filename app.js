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
  // Per ogni prospect Jack genera una entry qui (o serve da backend).
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
// Landing: vertical hero (clinics / hotels / properties)
// =============================================
(function verticalHero() {
  var pills = document.querySelectorAll('.vertical-pill[data-vertical]');
  var heroCopy = document.getElementById('heroCopy');
  var titleEl = document.getElementById('heroTitleEl');
  var ledeEl = document.getElementById('heroLedeEl');
  var mailBtn = document.getElementById('heroVerticalMail');
  if (!pills.length || !heroCopy || !titleEl || !ledeEl || !mailBtn) return;

  var COPY = {
    clinics: {
      title: "I know which patients you're losing — and why.",
      lede:
        "Every clinic in Pattaya leaks revenue in the same three places. I find yours, fix them quietly, and show you the money you didn't know was walking out the door.",
      cta: 'Show me the leak →',
      subject: 'Clinics — show me the leak',
    },
    hotels: {
      title: "Your competitors are charging more. You don't know it yet.",
      lede:
        'I watch every rate, every review, every booking signal in Pattaya — and turn it into one number that tells you exactly when to move. While your team sleeps.',
      cta: "Show me tonight's number →",
      subject: "Hotels — tonight's number",
    },
    properties: {
      title: "Every lead you didn't call back is still out there.",
      lede:
        'Most Pattaya property leads die in an inbox within 48 hours. I bring them back, score them, and book the viewing — before your competitor does.',
      cta: 'Show me the lost leads →',
      subject: 'Properties — lost leads',
    },
  };

  function applyCopy(key) {
    var c = COPY[key];
    if (!c) return;
    titleEl.innerHTML = '<span class="line line--italic"></span>';
    titleEl.querySelector('.line').textContent = c.title;
    ledeEl.textContent = c.lede;
    mailBtn.textContent = c.cta;
    if (key === 'clinics') {
      mailBtn.setAttribute('href', 'clinics/demo.html');
      heroCopy.classList.add('has-clinic-pitch');
    } else {
      mailBtn.setAttribute('href', 'mailto:jack@serviceopera.to?subject=' + encodeURIComponent(c.subject));
      heroCopy.classList.remove('has-clinic-pitch');
    }
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
