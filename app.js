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
