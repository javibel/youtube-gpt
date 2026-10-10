'use strict';
// Synthetic scoped HTTP acknowledgement used by unrelated competitor UI tests.
function emptyIntel(request) {
  const url = new URL(request.url, 'https://fixture.invalid');
  const channelIds = (url.searchParams.get('channelIds') || '').split(',').filter(Boolean).sort();
  return { userId: request.owner, language: url.searchParams.get('lang'), channelIds, analyzedChannelIds: channelIds.slice(0, 10),
    unavailableChannelIds: [], collectionStatus: 'complete', opportunitiesStatus: 'not_applicable', trending: [], newUploads: [], opportunities: [] };
}
module.exports = { emptyIntel };
