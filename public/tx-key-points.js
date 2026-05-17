/**
 * Key point validation and labels for /admin/transcriptions.
 */
(function () {
  'use strict';

  var INVALID_EXACT = {
    '': true,
    '-': true,
    '—': true,
    '–': true,
    none: true,
    '(none)': true,
    null: true,
    undefined: true,
    'n/a': true,
    na: true,
    'no clear task detected': true,
    'no clear decision detected': true,
  };

  var INVALID_SUBSTRINGS = ['no clear task detected', 'no clear decision detected', 'none extracted'];

  var EMPTY_FALLBACK = 'No strong key points detected. Review the summary below.';

  function normalizeKeyPointText(text) {
    return String(text || '')
      .replace(/\s*<!--[^>]+-->\s*/g, '')
      .trim()
      .replace(/^[-*•\[\]\s]+/, '')
      .replace(/^\[\s*[xX ]?\s*\]\s*/, '')
      .trim();
  }

  function isValidKeyPoint(text) {
    var t = normalizeKeyPointText(text);
    if (!t) return false;
    var low = t.toLowerCase();
    if (INVALID_EXACT[low]) return false;
    if (low.indexOf('- (none)') === 0 || low === '- none') return false;
    var i;
    for (i = 0; i < INVALID_SUBSTRINGS.length; i++) {
      if (low.indexOf(INVALID_SUBSTRINGS[i]) !== -1) return false;
    }
    if (/^[\W\d_]+$/.test(t)) return false;
    return true;
  }

  function filterValidKeyPoints(list, maxItems) {
    var cap = maxItems == null ? 3 : maxItems;
    var seen = {};
    var out = [];
    (list || []).forEach(function (p) {
      var t = normalizeKeyPointText(p);
      if (!isValidKeyPoint(t)) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
      if (out.length >= cap) return;
    });
    return out;
  }

  function keyPointsHeading(count) {
    return count === 3 ? 'Top 3 key points' : 'Top key points';
  }

  window.TxKeyPoints = {
    EMPTY_FALLBACK: EMPTY_FALLBACK,
    normalizeKeyPointText: normalizeKeyPointText,
    isValidKeyPoint: isValidKeyPoint,
    filterValidKeyPoints: filterValidKeyPoints,
    keyPointsHeading: keyPointsHeading,
  };
})();
