const SCREENER_SITE_URL = 'https://screener.zamzam-capital.com/';
const FALLBACK_API_URL = 'https://excell-final-worker.saif-ace.workers.dev/api/rows';
const REFRESH_ALARM = 'zamzam-capital-refresh';

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const candidate = payload.rows || payload.data || payload.results || payload.stocks || payload.items;
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

function findApiUrlsInText(text, baseUrl) {
  const found = new Set();
  if (!text) return [];

  const urlRegex = /https?:\/\/[^\s"'`<>\\]+(?:\/api\/rows|workers\.dev\/[^\s"'`<>\\]*|\.json)/gi;
  for (const match of text.matchAll(urlRegex)) {
    found.add(match[0]);
  }

  const relRegex = /["'`](\/api\/[a-z0-9/_-]+)["'`]/gi;
  for (const match of text.matchAll(relRegex)) {
    try {
      found.add(new URL(match[1], baseUrl).href);
    } catch (_) {}
  }

  return [...found];
}

async function discoverEndpointsFromSite() {
  const endpoints = new Set([
    new URL('/api/rows', SCREENER_SITE_URL).href
  ]);

  try {
    const res = await fetch(SCREENER_SITE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Site returned HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      const directRows = extractRows(json);
      if (directRows && directRows.length) return { directRows, endpoints: [] };
    }

    const html = await res.text();
    for (const url of findApiUrlsInText(html, SCREENER_SITE_URL)) {
      endpoints.add(url);
    }

    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    const scriptUrls = [];
    for (const match of html.matchAll(scriptRegex)) {
      try {
        const scriptUrl = new URL(match[1], SCREENER_SITE_URL).href;
        if (scriptUrl.startsWith(SCREENER_SITE_URL)) {
          scriptUrls.push(scriptUrl);
        }
      } catch (_) {}
    }

    for (const scriptUrl of scriptUrls.slice(0, 5)) {
      try {
        const scriptRes = await fetch(scriptUrl, { cache: 'no-store' });
        if (!scriptRes.ok) continue;
        const jsText = await scriptRes.text();
        for (const url of findApiUrlsInText(jsText, SCREENER_SITE_URL)) {
          endpoints.add(url);
        }
      } catch (_) {}
    }
  } catch (_) {}

  endpoints.add(FALLBACK_API_URL);
  return { directRows: null, endpoints: [...endpoints] };
}

async function refreshData() {
  try {
    const { directRows, endpoints } = await discoverEndpointsFromSite();

    if (directRows && directRows.length) {
      await chrome.storage.local.set({
        zamzamCapitalRows: directRows,
        zamzamCapitalUpdatedAt: Date.now(),
        zamzamCapitalError: ''
      });
      return { ok: true, count: directRows.length, source: SCREENER_SITE_URL };
    }

    let lastError = 'Could not retrieve rows from screener.zamzam-capital.com';
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) {
          lastError = `${endpoint} returned HTTP ${response.status}`;
          continue;
        }
        const payload = await response.json();
        const rows = extractRows(payload);
        if (!Array.isArray(rows) || !rows.length) {
          lastError = `No valid rows found at ${endpoint}`;
          continue;
        }

        await chrome.storage.local.set({
          zamzamCapitalRows: rows,
          zamzamCapitalUpdatedAt: Date.now(),
          zamzamCapitalError: ''
        });
        return { ok: true, count: rows.length, source: endpoint };
      } catch (err) {
        lastError = String(err.message || err);
      }
    }

    throw new Error(lastError);
  } catch (error) {
    const msg = String(error.message || error);
    await chrome.storage.local.set({ zamzamCapitalError: msg });
    return { ok: false, error: msg };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1440 });
  await refreshData();
});

chrome.runtime.onStartup.addListener(() => refreshData());

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === REFRESH_ALARM) refreshData();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'REFRESH_DATA') {
    refreshData().then(sendResponse);
    return true;
  }
  if (message?.type === 'GET_DATA') {
    chrome.storage.local
      .get(['zamzamCapitalRows', 'zamzamCapitalUpdatedAt', 'zamzamCapitalError'])
      .then(sendResponse);
    return true;
  }
  // Relay embedded chart iframe symbol updates to the top-level broker window
  if (message?.type === 'FRAME_SYMBOL_DETECTED' && sender.tab?.id !== undefined) {
    chrome.tabs.sendMessage(
      sender.tab.id,
      { type: 'TOP_RECEIVE_FRAME_SYMBOL', payload: message.payload },
      { frameId: 0 }
    ).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
});