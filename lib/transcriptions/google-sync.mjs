/**
 * Google Calendar + Tasks sync (levels 2–3). Level 1 runs from index_transcriptions.py.
 * Returns 501 when OAuth env is not configured.
 */

function oauthConfigured() {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ''
  ).trim();
  const refresh = (
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || ''
  ).trim();
  return Boolean(clientId && clientSecret && refresh);
}

export function googleSyncNotConfiguredResponse() {
  return {
    status: 501,
    body: {
      error:
        'Google integration not configured. Setup OAuth credentials first.',
    },
  };
}

export function assertGoogleSyncReady() {
  if (!oauthConfigured()) {
    return googleSyncNotConfiguredResponse();
  }
  return {
    status: 501,
    body: {
      error:
        'Google OAuth credentials are present but Calendar/Tasks sync is not implemented yet.',
    },
  };
}

/**
 * Level 2 — sync a single extracted item by index.
 */
export async function syncTranscriptionItem(_item, _itemType, _itemIndex, _settings) {
  const blocked = assertGoogleSyncReady();
  if (blocked) return blocked;
  return blocked;
}

/**
 * Level 3 — sync all unsynced extracted items for one index entry.
 */
export async function syncTranscriptionBulk(_item, _settings) {
  const blocked = assertGoogleSyncReady();
  if (blocked) return blocked;
  return blocked;
}
