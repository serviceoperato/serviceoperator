/**
 * Google Places API (New) — Text Search helper.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */

export const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

/** Field mask as required by the product owner (Places API New). */
export const PLACES_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.location,places.businessStatus,places.types';

const MAX_PAGES = 3; // API allows up to ~60 results total (20 × 3)

/** Pattaya center — biases/restricts relevance for local lead gen (optional). */
export const PATTAYA_CENTER = { latitude: 12.923556, longitude: 100.882455 };

function displayNameText(place) {
  const d = place?.displayName;
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (typeof d.text === 'string') return d.text;
  return '';
}

function placeResourceId(place) {
  if (typeof place?.id === 'string' && place.id.length) return place.id;
  if (typeof place?.name === 'string') return place.name.replace(/^places\//, '');
  return '';
}

/**
 * One CSV-ready row. Does not persist raw Google payloads.
 * @param {object} place — single Place object from searchText `places[]`
 * @param {{ category: string, query: string, collectedAt: string }} ctx
 */
export function normalizePlaceRow(place, ctx) {
  const loc = place?.location || {};
  const lat = typeof loc.latitude === 'number' ? loc.latitude : '';
  const lng = typeof loc.longitude === 'number' ? loc.longitude : '';
  const types = Array.isArray(place?.types) ? place.types.join('|') : '';

  return {
    category: ctx.category,
    query: ctx.query,
    place_id: placeResourceId(place),
    name: displayNameText(place),
    address: typeof place?.formattedAddress === 'string' ? place.formattedAddress : '',
    phone: typeof place?.nationalPhoneNumber === 'string' ? place.nationalPhoneNumber : '',
    website: typeof place?.websiteUri === 'string' ? place.websiteUri : '',
    google_maps_url: typeof place?.googleMapsUri === 'string' ? place.googleMapsUri : '',
    rating: typeof place?.rating === 'number' ? place.rating : '',
    review_count: typeof place?.userRatingCount === 'number' ? place.userRatingCount : '',
    latitude: lat,
    longitude: lng,
    business_status: typeof place?.businessStatus === 'string' ? place.businessStatus : '',
    types,
    collected_at: ctx.collectedAt,
  };
}

/**
 * @param {string} apiKey
 * @param {object} body — POST JSON for searchText (must include textQuery)
 */
async function searchTextOnce(apiKey, body) {
  const r = await fetch(PLACES_SEARCH_TEXT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!r.ok) {
    const msg =
      (json && json.error && json.error.message) ||
      (json && json.message) ||
      text.slice(0, 500) ||
      'Places API error';
    const err = new Error(msg);
    err.status = typeof r.status === 'number' && r.status >= 400 ? r.status : 502;
    err.details = json && json.error ? json.error : undefined;
    throw err;
  }

  return json || {};
}

/**
 * Paginates searchText until no nextPageToken or MAX_PAGES.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.textQuery
 * @param {(meta: { pageIndex: number }) => Promise<void>} [opts.onBeforeRequest] — rate-limit hook
 */
export async function searchTextAllPages({ apiKey, textQuery, category, onBeforeRequest }) {
  const collectedAt = new Date().toISOString();
  const rows = [];
  let nextPageToken = undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (typeof onBeforeRequest === 'function') {
      await onBeforeRequest({ pageIndex: page });
    }

    const payload = {
      textQuery,
      languageCode: 'en',
      regionCode: 'TH',
      pageSize: 20,
      locationBias: {
        circle: {
          center: PATTAYA_CENTER,
          radius: 28000,
        },
      },
    };

    if (nextPageToken) {
      payload.pageToken = nextPageToken;
    }

    const data = await searchTextOnce(apiKey, payload);
    const places = Array.isArray(data.places) ? data.places : [];

    for (const place of places) {
      rows.push(
        normalizePlaceRow(place, {
          category: category || '',
          query: textQuery,
          collectedAt,
        })
      );
    }

    nextPageToken = typeof data.nextPageToken === 'string' && data.nextPageToken.length ? data.nextPageToken : null;
    if (!nextPageToken) break;
  }

  return { rows, collectedAt };
}
