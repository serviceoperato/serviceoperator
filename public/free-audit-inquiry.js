(function () {
  'use strict';

  function api(path) {
    return typeof soApiUrl === 'function' ? soApiUrl(path) : path;
  }

  function cred() {
    return typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
  }

  function parseLeadAttribution() {
    var leadSource = '';
    try {
      var params = new URLSearchParams(window.location.search);
      leadSource = (params.get('leadSource') || '').trim();
      var from = (params.get('from') || '').trim();
      var utm = (params.get('utm_source') || '').trim();
      if (!leadSource && from === 'sample') leadSource = 'sample';
      if (!leadSource && utm) leadSource = utm;
    } catch (e) {
      leadSource = '';
    }
    return leadSource;
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = 'inquiry-form__status' + (kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-success' : '');
  }

  function boot() {
    var form = document.getElementById('free-audit-form');
    if (!form) return;

    var status = document.getElementById('free-audit-status');
    var submitBtn = document.getElementById('free-audit-submit');
    var leadInput = document.getElementById('free-audit-lead-source');
    var planInput = document.getElementById('free-audit-plan');
    var leadSource = parseLeadAttribution();

    if (leadInput) leadInput.value = leadSource;
    if (planInput && !planInput.value) planInput.value = 'free';
    if (leadSource === 'sample') {
      var clinicsRad = form.querySelector('input[name="sector"][value="clinics"]');
      if (clinicsRad) clinicsRad.checked = true;
    }

    fetch(api('/api/marketing/lead-event'), {
      method: 'POST',
      credentials: cred(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'pricing_form_view',
        tier: 'free',
        path: window.location.pathname + window.location.search,
        referrer: document.referrer || '',
        detail: leadSource ? { leadSource: leadSource } : undefined,
      }),
    }).catch(function () {});

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      setStatus(status, '', '');

      var email = (document.getElementById('free-audit-email').value || '').trim();
      var sectorInput = form.querySelector('input[name="sector"]:checked');
      var sector = sectorInput ? String(sectorInput.value || '').trim() : '';
      var improveFirst = (document.getElementById('free-audit-improve').value || '').trim();
      var companyUrl =
        (document.getElementById('free-audit-company-url') &&
          document.getElementById('free-audit-company-url').value) ||
        '';
      var plan = (planInput && planInput.value) || 'free';
      var lead = (leadInput && leadInput.value) || leadSource;

      if (!email || !sector || !improveFirst) {
        setStatus(
          status,
          'Please enter your work email, choose a sector, and describe what to improve first.',
          'error'
        );
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      fetch(api('/api/marketing/pricing-inquiry'), {
        method: 'POST',
        credentials: cred(),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: plan,
          email: email,
          sector: sector,
          improveFirst: improveFirst,
          source: window.location.pathname + window.location.search,
          leadSource: lead || undefined,
          company_url: String(companyUrl).trim(),
        }),
      })
        .then(function (r) {
          return r
            .json()
            .catch(function () {
              return {};
            })
            .then(function (j) {
              return { ok: r.ok, json: j };
            });
        })
        .then(function (x) {
          if (!x.ok || !x.json || !x.json.ok) {
            throw new Error((x.json && x.json.error) || 'Request failed.');
          }
          setStatus(status, x.json.message || 'Thanks — your request was sent.', 'ok');
          form.reset();
          if (planInput) planInput.value = plan;
          if (leadInput) leadInput.value = lead;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Get your free 48-hour ROI audit';
        })
        .catch(function (err) {
          setStatus(status, err.message || 'Something went wrong.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Get your free 48-hour ROI audit';
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
