(function () {
  'use strict';

  var SECTOR_OPTS = [
    { value: 'hotels', label: 'Hotels' },
    { value: 'clinics', label: 'Clinics' },
    { value: 'property', label: 'Property' },
    { value: 'other', label: 'Other' },
  ];

  /* Line icons aligned with homepage sector cards (index.html); "other" = 2×2 grid. */
  var SECTOR_ICON_SVG = {
    hotels:
      '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M6 20V10L12 6.5l6 3.5V20"/><path d="M12 6.5V4"/><path d="M8 20v-6h8v6"/><rect x="8.5" y="11" width="2" height="2" rx="0.35"/><rect x="11" y="11" width="2" height="2" rx="0.35"/><rect x="13.5" y="11" width="2" height="2" rx="0.35"/><rect x="8.5" y="14.5" width="2" height="2" rx="0.35"/><rect x="11" y="14.5" width="2" height="2" rx="0.35"/><rect x="13.5" y="14.5" width="2" height="2" rx="0.35"/></svg>',
    clinics:
      '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5c-1.8 2.8-4.5 5-4.5 8.8a4.5 4.5 0 0 0 9 0c0-3.8-2.7-6-4.5-8.8z"/><path d="M8.5 13c1.4 1.1 2.6 1.6 3.5 1.6s2.1-.5 3.5-1.6"/><path d="M7.5 15.5c1.8 1.5 3.2 2 4.5 2s2.7-.5 4.5-2"/><path d="M12 4.5v2"/></svg>',
    property:
      '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11.5z"/><path d="M9 21v-7h6v7"/></svg>',
    other:
      '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  };

  function sectorIconEl(slug) {
    var wrap = document.createElement('span');
    wrap.className = 'so-sector-choice__icon';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = SECTOR_ICON_SVG[slug] || SECTOR_ICON_SVG.other;
    return wrap;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(root) {
    if (!root || root.getAttribute('data-inquiry-mounted') === '1') return;
    root.setAttribute('data-inquiry-mounted', '1');

    var topic = (root.getAttribute('data-inquiry-topic') || '').trim();
    var sectorPreset = (root.getAttribute('data-inquiry-sector-preset') || '').trim().toLowerCase();
    var source = (root.getAttribute('data-inquiry-source') || '').trim() || window.location.pathname || '/';
    var submitLabel = (root.getAttribute('data-inquiry-submit') || '').trim() || 'Send inquiry';

    var form = el('form', 'inquiry-form');
    form.setAttribute('novalidate', 'novalidate');

    var status = el('p', 'inquiry-form__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;

    var emailWrap = el('label', 'inquiry-form__field');
    emailWrap.setAttribute('for', 'inquiry-email');
    emailWrap.appendChild(el('span', 'inquiry-form__label', 'Work email'));
    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'inquiry-email';
    emailInput.name = 'email';
    emailInput.className = 'inquiry-form__control';
    emailInput.required = true;
    emailInput.autocomplete = 'email';
    emailInput.maxLength = 254;
    emailWrap.appendChild(emailInput);

    var sectorFs = el('fieldset', 'inquiry-form__field so-sector-choice');
    sectorFs.appendChild(el('legend', 'inquiry-form__label', 'Sector'));
    var grid = el('div', 'so-sector-choice__grid');
    grid.setAttribute('role', 'presentation');
    var sectorRadios = [];
    for (var si = 0; si < SECTOR_OPTS.length; si++) {
      var opt = SECTOR_OPTS[si];
      var lab = el('label', 'so-sector-choice__opt');
      var rad = document.createElement('input');
      rad.type = 'radio';
      rad.name = 'sector';
      rad.value = opt.value;
      rad.className = 'so-sector-choice__input';
      rad.required = si === 0;
      lab.appendChild(rad);
      lab.appendChild(sectorIconEl(opt.value));
      lab.appendChild(el('span', 'so-sector-choice__label', opt.label));
      grid.appendChild(lab);
      sectorRadios.push(rad);
    }
    sectorFs.appendChild(grid);

    if (sectorPreset === 'hotels' || sectorPreset === 'clinics' || sectorPreset === 'property' || sectorPreset === 'other') {
      for (var j = 0; j < sectorRadios.length; j++) {
        if (sectorRadios[j].value === sectorPreset) {
          sectorRadios[j].checked = true;
          break;
        }
      }
    }

    var improveWrap = el('label', 'inquiry-form__field');
    improveWrap.setAttribute('for', 'inquiry-improve');
    improveWrap.appendChild(el('span', 'inquiry-form__label', 'What should we improve first?'));
    var improveTa = document.createElement('textarea');
    improveTa.id = 'inquiry-improve';
    improveTa.name = 'improveFirst';
    improveTa.className = 'inquiry-form__control';
    improveTa.rows = 4;
    improveTa.required = true;
    improveTa.placeholder = 'One urgent operational pain, bottleneck, or goal.';
    improveWrap.appendChild(improveTa);

    var hpWrap = el('div', 'inquiry-form__hp');
    hpWrap.setAttribute('aria-hidden', 'true');
    var hpLab = el('label', null, 'Company website');
    hpLab.setAttribute('for', 'inquiry-company-url');
    var hpInput = document.createElement('input');
    hpInput.type = 'text';
    hpInput.id = 'inquiry-company-url';
    hpInput.name = 'company_url';
    hpInput.tabIndex = -1;
    hpInput.autocomplete = 'off';
    hpLab.appendChild(hpInput);
    hpWrap.appendChild(hpLab);

    var actions = el('div', 'inquiry-form__actions');
    var submit = el('button', 'btn btn-primary inquiry-form__submit', submitLabel);
    submit.type = 'submit';
    actions.appendChild(submit);

    form.appendChild(emailWrap);
    form.appendChild(sectorFs);
    form.appendChild(improveWrap);
    form.appendChild(hpWrap);
    form.appendChild(actions);
    form.appendChild(status);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      status.hidden = true;
      status.classList.remove('is-error', 'is-success');

      var sectorEl = form.querySelector('input[name="sector"]:checked');
      var sector = sectorEl ? String(sectorEl.value || '').trim() : '';
      var payload = {
        email: emailInput.value.trim(),
        sector: sector,
        improveFirst: improveTa.value.trim(),
        topic: topic,
        source: source,
        company_url: hpInput.value.trim(),
      };

      if (!payload.email || !payload.sector || !payload.improveFirst) {
        status.textContent = 'Please enter your work email, choose a sector, and describe what to improve first.';
        status.classList.add('is-error');
        status.hidden = false;
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Sending…';

      fetch(typeof soApiUrl === 'function' ? soApiUrl('/api/marketing/inquiry') : '/api/marketing/inquiry', {
        method: 'POST',
        credentials: typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (json) {
              return { ok: response.ok, json: json };
            });
        })
        .then(function (result) {
          if (!result.ok) {
            throw new Error(
              (result.json && result.json.error) ||
                'Could not send your inquiry. Try again later or book a call from the site.'
            );
          }
          status.textContent =
            (result.json && result.json.message) || 'Thanks — your inquiry was sent. Jack will follow up shortly.';
          status.classList.add('is-success');
          status.hidden = false;
          form.reset();
          if (sectorPreset === 'hotels' || sectorPreset === 'clinics' || sectorPreset === 'property' || sectorPreset === 'other') {
            for (var k = 0; k < sectorRadios.length; k++) {
              if (sectorRadios[k].value === sectorPreset) {
                sectorRadios[k].checked = true;
                break;
              }
            }
          }
          submit.textContent = 'Sent';
        })
        .catch(function (error) {
          status.textContent = error && error.message ? error.message : 'Could not send your inquiry.';
          status.classList.add('is-error');
          status.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        });
    });

    root.appendChild(form);
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-inquiry-form]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
