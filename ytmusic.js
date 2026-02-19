// ============================================
// YouTube Music Internal API Client
// ============================================
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

const YT_MUSIC_ORIGIN = 'https://music.youtube.com';
const BROWSE_URL = 'https://music.youtube.com/youtubei/v1/browse';
const SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search';
const NEXT_URL = 'https://music.youtube.com/youtubei/v1/next';

const CLIENT_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241023.01.00',
    hl: 'tr',
    gl: 'TR',
  },
};

function computeSapiSidHash(sapiSid) {
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapiSid} ${YT_MUSIC_ORIGIN}`;
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

function makeRequest(url, body, cookieStr, sapiSid) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(body);

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'X-Origin': YT_MUSIC_ORIGIN,
      'Origin': YT_MUSIC_ORIGIN,
      'Referer': YT_MUSIC_ORIGIN + '/',
      'Cookie': cookieStr,
      'X-Goog-AuthUser': '0',
    };

    if (sapiSid) {
      headers['Authorization'] = computeSapiSidHash(sapiSid);
    }

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(postData);
    req.end();
  });
}

// --- Public API ---

async function getHome(cookieStr, sapiSid) {
  const body = { context: CLIENT_CONTEXT, browseId: 'FEmusic_home' };
  const response = await makeRequest(BROWSE_URL, body, cookieStr, sapiSid);
  return parseHomeResponse(response);
}

async function search(query, cookieStr, sapiSid) {
  const body = {
    context: CLIENT_CONTEXT,
    query,
    params: 'EgWKAQIIAWoMEAMQBBAJEA4QChAF', // Songs filter
  };
  const response = await makeRequest(SEARCH_URL, body, cookieStr, sapiSid);
  return parseSearchResponse(response);
}

async function getPlaylist(browseId, cookieStr, sapiSid) {
  const body = { context: CLIENT_CONTEXT, browseId };
  const response = await makeRequest(BROWSE_URL, body, cookieStr, sapiSid);
  return parsePlaylistResponse(response);
}

// --- Response Parsers ---

function parseHomeResponse(data) {
  const shelves = [];
  try {
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
    if (!tabs) return shelves;

    const sections =
      tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    for (const section of sections) {
      const shelf = section.musicCarouselShelfRenderer;
      if (!shelf) continue;

      const title =
        shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]
          ?.text || 'Öneriler';
      const items = [];

      for (const item of shelf.contents || []) {
        const parsed = parseMusicItem(item);
        if (parsed) items.push(parsed);
      }

      if (items.length > 0) {
        shelves.push({ title, items });
      }
    }
  } catch (e) {
    console.error('Parse home error:', e.message);
  }
  return shelves;
}

function parseSearchResponse(data) {
  const results = [];
  try {
    const contents =
      data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const shelf = section.musicShelfRenderer;
      if (!shelf) continue;

      for (const item of shelf.contents || []) {
        const parsed = parseListItem(item.musicResponsiveListItemRenderer);
        if (parsed) results.push(parsed);
      }
    }
  } catch (e) {
    console.error('Parse search error:', e.message);
  }
  return results;
}

function parseMusicItem(item) {
  // musicTwoRowItemRenderer (albums, playlists, mixes)
  const twoRow = item.musicTwoRowItemRenderer;
  if (twoRow) {
    const title = twoRow.title?.runs?.[0]?.text || '';
    const subtitle = (twoRow.subtitle?.runs || []).map((r) => r.text).join('');
    const thumbnails =
      twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const thumbnail = getBestThumbnail(thumbnails);

    let videoId = null;
    let playlistId = null;
    let browseId = null;
    const nav = twoRow.navigationEndpoint;
    if (nav?.watchEndpoint) {
      videoId = nav.watchEndpoint.videoId;
      playlistId = nav.watchEndpoint.playlistId;
    }
    if (nav?.watchPlaylistEndpoint) {
      playlistId = playlistId || nav.watchPlaylistEndpoint.playlistId;
    }
    if (nav?.browseEndpoint) {
      browseId = nav.browseEndpoint.browseId;
    }
    // Also check menu items for browse/playlist endpoints
    const menuItems = twoRow.menu?.menuRenderer?.items || [];
    for (const mi of menuItems) {
      const ep = mi.menuNavigationItemRenderer?.navigationEndpoint;
      if (!browseId && ep?.browseEndpoint?.browseId) {
        browseId = ep.browseEndpoint.browseId;
      }
    }

    let type = 'song';
    const subLower = subtitle.toLowerCase();
    if (browseId && (browseId.startsWith('MPREb_') || browseId.startsWith('OLAK')))
      type = 'album';
    else if (subLower.includes('albüm') || subLower.includes('album') || subLower.includes('single') || subLower.includes('ep'))
      type = 'album';
    else if (subLower.includes('çalma listesi') || subLower.includes('playlist') || subLower.includes('mix'))
      type = 'playlist';
    else if (playlistId && !videoId) type = 'playlist';
    else if (browseId) type = 'playlist';
    // If it has both videoId and playlistId, it's a playlist that auto-plays
    else if (playlistId && videoId) type = 'playlist';

    return { title, subtitle, thumbnail, videoId, playlistId, browseId, type };
  }

  // musicResponsiveListItemRenderer (songs in lists)
  const listItem = item.musicResponsiveListItemRenderer;
  if (listItem) {
    return parseListItem(listItem);
  }

  return null;
}

function parseListItem(listItem) {
  if (!listItem) return null;

  const columns = listItem.flexColumns || [];
  const title =
    columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
  const subtitleRuns =
    columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const subtitle = subtitleRuns.map((r) => r.text).join('');
  const thumbnails =
    listItem.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = getBestThumbnail(thumbnails);

  let videoId = null;
  const overlay =
    listItem.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer;
  if (overlay?.playNavigationEndpoint?.watchEndpoint) {
    videoId = overlay.playNavigationEndpoint.watchEndpoint.videoId;
  }
  if (!videoId && listItem.playlistItemData?.videoId) {
    videoId = listItem.playlistItemData.videoId;
  }

  if (!title) return null;

  return { title, subtitle, thumbnail, videoId, playlistId: null, browseId: null, type: 'song' };
}

function parsePlaylistResponse(data) {
  const result = { title: '', subtitle: '', thumbnail: '', tracks: [] };
  try {
    // Header - try multiple structures
    const header =
      data?.header?.musicImmersiveHeaderRenderer ||
      data?.header?.musicDetailHeaderRenderer ||
      data?.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicDetailHeaderRenderer ||
      data?.header?.musicVisualHeaderRenderer ||
      data?.header?.musicResponsiveHeaderRenderer;

    if (header) {
      result.title = header.title?.runs?.[0]?.text || '';
      result.subtitle = (header.subtitle?.runs || header.straplineTextOne?.runs || []).map((r) => r.text).join('');
      const thumbs = header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
        header.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
        header.thumbnail?.thumbnails || [];
      result.thumbnail = getBestThumbnail(thumbs);
    }

    // Tracks - try multiple response structures
    const sections =
      data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents ||
      data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents
        ?.sectionListRenderer?.contents ||
      data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents || [];

    for (const section of sections) {
      const shelf = section.musicShelfRenderer || section.musicPlaylistShelfRenderer;
      if (!shelf) continue;
      for (const item of shelf.contents || []) {
        const parsed = parseListItem(item.musicResponsiveListItemRenderer);
        if (parsed) result.tracks.push(parsed);
      }
    }
  } catch (e) {
    console.error('Parse playlist error:', e.message);
  }
  return result;
}

function getBestThumbnail(thumbnails) {
  if (!thumbnails || thumbnails.length === 0) return '';
  // Prefer ~226px or larger
  const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
  const medium = sorted.find((t) => (t.width || 0) >= 200 && (t.width || 0) <= 400);
  return (medium || sorted[0])?.url || '';
}

module.exports = { getHome, search, getPlaylist };
