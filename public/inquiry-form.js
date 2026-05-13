(function () {
  'use strict';

  var SECTOR_VALUES = ['hotels', 'clinics', 'properties', 'other'];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** @param {string} sectorDefault */
  function inferSectorSlug(sectorDefault) {
    var s = (sectorDefault || '').toLowerCase();
    if (!s) return null;
    if (s.indexOf('cross-vertical') !== -1 || s.indexOf('cross vertical') !== -1) return null;
    if (s.indexOf('property') !== -1 || s.indexOf('rental') !== -1) return 'properties';
    if (s.indexOf('hotel') !== -1) return 'hotels';
    if (s.indexOf('clinic') !== -1 || s.indexOf('dental') !== -1) return 'clinics';
    return null;
  }

  function mount(root) {
    if (!root || root.getAttribute('data-inquiry-mounted') === '1') return;
    root.setAttribute('data-inquiry-mounted', '1');

    var topic = (root.getAttribute('data-inquiry-topic') || '').trim();
    var sectorDefault = (root.getAttribute('data-inquiry-sector') || '').trim();
    var source = (root.getAttribute('data-inquiry-source') || '').trim() || window.location.pathname || '/';
    var submitLabel = (root.getAttribute('data-inquiry-submit') || '').trim() || 'Send inquiry';

    var form = el('form', 'inquiry-form');
    form.setAttribute('novalidate', 'novalidate');

    var status = el('p', 'inquiry-form__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;

    function field(id, labelText, options) {
      options = options || {};
      var wrap = el('label', 'inquiry-form__field');
      wrap.setAttribute('for', id);
      wrap.appendChild(el('span', 'inquiry-form__label', labelText));
      var control;
      if (options.multiline) {
        control = document.createElement('textarea');
        control.rows = 4;
      } else {
        control = document.createElement('input');
        control.type = 'text';
      }
      control.id = id;
      control.name = options.name || id;
      control.className = 'inquiry-form__control';
      control.required = true;
      control.autocomplete = options.autocomplete || 'off';
      if (options.placeholder) control.placeholder = options.placeholder;
      if (options.value) control.value = options.value;
      wrap.appendChild(control);
      return { wrap: wrap, control: control };
    }

    var nameField = field('inquiry-name', 'Name', { autocomplete: 'name' });
    var businessField = field('inquiry-business', 'Business', { autocomplete: 'organization' });

    var sectorFieldset = el('fieldset', 'inquiry-form__field so-sector-choice');
    sectorFieldset.appendChild(el('legend', 'inquiry-form__label', 'Sector'));
    var sectorGrid = el('div', 'so-sector-choice__grid');
    sectorGrid.setAttribute('role', 'presentation');
    var sectorInputs = [];
    var initialSlug = inferSectorSlug(sectorDefault);
    for (var si = 0; si < SECTOR_VALUES.length; si++) {
      var val = SECTOR_VALUES[si];
      var lab = el('label', 'so-sector-choice__opt');
      var inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'sector';
      inp.value = val;
      inp.className = 'so-sector-choice__input';
      if (si === 0) inp.required = true;
      if (initialSlug && val === initialSlug) inp.checked = true;
      sectorInputs.push(inp);
      var labelText = val === 'properties' ? 'Property' : val === 'other' ? 'Other' : val.charAt(0).toUpperCase() + val.slice(1);
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(labelText));
      sectorGrid.appendChild(lab);
    }
    sectorFieldset.appendChild(sectorGrid);

    var improvementField = field('inquiry-improvement', 'What do you want to improve?', {
      name: 'improvement',
      multiline: true,
      placeholder: 'One urgent operational pain, bottleneck, or goal.',
    });

    form.appendChild(nameField.wrap);
    form.appendChild(businessField.wrap);
    form.appendChild(sectorFieldset);
    form.appendChild(improvementField.wrap);

    var actions = el('div', 'inquiry-form__actions');
    var submit = el('button', 'btn btn-primary inquiry-form__submit', submitLabel);
    submit.type = 'submit';
    actions.appendChild(submit);
    form.appendChild(actions);
    form.appendChild(status);

    function getSectorValue() {
      for (var i = 0; i < sectorInputs.length; i++) {
        if (sectorInputs[i].checked) return sectorInputs[i].value;
      }
      return '';
    }

    function applySectorDefault() {
      var slug = inferSectorSlug(sectorDefault);
      for (var i = 0; i < sectorInputs.length; i++) {
        sectorInputs[i].checked = Boolean(slug && sectorInputs[i].value === slug);
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      status.hidden = true;
      status.classList.remove('is-error', 'is-success');

      var sector = getSectorValue();
      var payload = {
        name: nameField.control.value.trim(),
        business: businessField.control.value.trim(),
        sector: sector,
        improvement: improvementField.control.value.trim(),
        topic: topic,
        source: source,
      };

      if (!payload.name || !payload.business || !payload.sector || !payload.improvement) {
        status.textContent = 'Please fill in all fields.';
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
          applySectorDefault();
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
