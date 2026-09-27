/**
 * RoSuite Background Service Worker
 * Handles message passing, API request coordination, and stats tracking
 */

importScripts('utils/playtime.js');

// Settings read here with their defaults: the two that contact an outside
// site are off until switched on; playtime (Roblox only, kept locally) is on.
function withDefaults(s) {
  return { serverRegions: false, rolimonsValues: false, playtimeTracking: true, ...(s || {}) };
}
function getSettings() {
  return new Promise(r => chrome.storage.local.get('rs_settings', x => r(withDefaults(x.rs_settings))));
}
const DAY = 86400000;
let settingsWrite = Promise.resolve();

// Initialize daily stats
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('rs_stats', (result) => {
    if (!result.rs_stats) {
      chrome.storage.local.set({
        rs_stats: {
          totalCalls: 0,
          totalCacheHits: 0,
          serversScanned: 0,
          date: new Date().toDateString(),
        },
      });
    }
  });

  chrome.storage.local.get('rs_settings', (result) => {
    if (!result.rs_settings) {
      chrome.storage.local.set({
        rs_settings: {
          serverBrowser: true,
          playerInfo: true,
          profileEnhance: true,
          tradeCalc: true,
          gameStats: true,
          cacheDuration: 30,
          serverBrowserSort: 'players-high',
          serverBrowserAutoRefresh: 30,
          serverBrowserShowPlayers: false,
          serverBrowserHideFull: false,
          serverBrowserHideEmpty: false,
          profileShowRAP: true,
          profileShowAge: true,
          profileShowActivity: true,
          theme: 'auto',
          serverRegions: false,
          rolimonsValues: false,
          playtimeTracking: true,
        },
      });
    }
  });
  schedulePlaytime();
});
chrome.runtime.onStartup.addListener(() => schedulePlaytime());

// ---- Server regions: where an address is (ipwho.is), cached a week ---------
async function locateIp(ip) {
  const settings = await getSettings();
  if (!settings.serverRegions) return { ok: false, error: 'Server regions are off (RoSuite options)' };
  if (ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'Not an address' };
  const key = 'rs_geo_' + (ip || 'me');
  const saved = await new Promise(r => chrome.storage.local.get(key, x => r(x[key])));
  if (saved && Date.now() - saved.at < (ip ? 7 * DAY : DAY)) return { ok: true, location: saved.location };
  try {
    const res = await fetch('https://ipwho.is/' + (ip || '') + '?fields=success,city,region,country,country_code,latitude,longitude');
    const data = await res.json();
    if (!data || data.success === false) return { ok: false, error: 'Location unknown' };
    const location = { city: data.city || '', region: data.region || '', country: data.country || '', country_code: data.country_code || '', latitude: data.latitude, longitude: data.longitude };
    chrome.storage.local.set({ [key]: { at: Date.now(), location } });
    return { ok: true, location };
  } catch (e) {
    return { ok: false, error: 'Location lookup failed' };
  }
}

// ---- Rolimons item values, cached an hour ---------------------------------
let valuesMemo = null;
async function itemValues() {
  const settings = await getSettings();
  if (!settings.rolimonsValues) return { ok: false, error: 'Rolimons values are off (RoSuite options)' };
  if (valuesMemo && Date.now() - valuesMemo.at < 3600000) return { ok: true, items: valuesMemo.items, at: valuesMemo.at };
  try {
    const res = await fetch('https://api.rolimons.com/items/v2/itemdetails');
    const data = await res.json();
    if (!data || !data.success || !data.items) return { ok: false, error: 'Rolimons did not answer' };
    valuesMemo = { at: Date.now(), items: data.items };
    return { ok: true, items: data.items, at: valuesMemo.at };
  } catch (e) {
    return { ok: false, error: 'Rolimons did not answer' };
  }
}

// ---- Playtime: your own presence every two minutes -------------------------
function schedulePlaytime() {
  try { chrome.alarms.create('rs-playtime', { periodInMinutes: self.RoSuite.Playtime.STEP_MIN }); }
  catch (e) { console.debug('[RoSuite] alarms unavailable:', e && e.message); }
}
let me = null, csrf = null;
async function robloxJson(url, init) {
  const opts = { credentials: 'include', ...(init || {}), headers: { 'Content-Type': 'application/json', ...((init && init.headers) || {}) } };
  if (csrf && opts.method === 'POST') opts.headers['X-CSRF-TOKEN'] = csrf;
  let res = await fetch(url, opts);
  const token = res.headers.get('x-csrf-token');
  if (res.status === 403 && token) { csrf = token; opts.headers['X-CSRF-TOKEN'] = token; res = await fetch(url, opts); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function tickPlaytime() {
  const settings = await getSettings();
  if (settings.playtimeTracking === false) return;
  try {
    if (!me) me = (await robloxJson('https://users.roblox.com/v1/users/authenticated')).id;
    if (!me) return;
    const p = await robloxJson('https://presence.roblox.com/v1/presence/users', { method: 'POST', body: JSON.stringify({ userIds: [me] }) });
    const presence = p && p.userPresences && p.userPresences[0];
    const state = await new Promise(r => chrome.storage.local.get('rs_playtime', x => r(x.rs_playtime)));
    chrome.storage.local.set({ rs_playtime: self.RoSuite.Playtime.record(state, presence, Date.now()) });
  } catch (e) {
    me = null;                  // signed out, or another account: ask again next time
  }
}
if (chrome.alarms && chrome.alarms.onAlarm) chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'rs-playtime') tickPlaytime(); });
schedulePlaytime();

// Message handler for communication between content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get('rs_settings', (result) => {
        sendResponse(withDefaults(result.rs_settings));
      });
      return true;

    case 'SET_SETTINGS':
      // One save at a time. Each is read-change-write, so two toggles in
      // quick succession used to read the same old settings and the second
      // write threw the first change away.
      settingsWrite = settingsWrite.then(() => new Promise((done) => {
        chrome.storage.local.get('rs_settings', (result) => {
          const settings = { ...result.rs_settings, ...message.settings };
          chrome.storage.local.set({ rs_settings: settings }, () => {
            sendResponse({ success: true });
            done();
          });
        });
      }));
      return true;

    case 'GET_STATS':
      chrome.storage.local.get('rs_stats', (result) => {
        const stats = result.rs_stats || {};
        // Reset if new day
        if (stats.date !== new Date().toDateString()) {
          stats.totalCalls = 0;
          stats.totalCacheHits = 0;
          stats.serversScanned = 0;
          stats.date = new Date().toDateString();
          chrome.storage.local.set({ rs_stats: stats });
        }
        sendResponse(stats);
      });
      return true;

    case 'UPDATE_STAT':
      chrome.storage.local.get('rs_stats', (result) => {
        const stats = result.rs_stats || {
          totalCalls: 0,
          totalCacheHits: 0,
          serversScanned: 0,
          date: new Date().toDateString(),
        };
        if (stats.date !== new Date().toDateString()) {
          stats.totalCalls = 0;
          stats.totalCacheHits = 0;
          stats.serversScanned = 0;
          stats.date = new Date().toDateString();
        }
        if (message.stat && stats[message.stat] !== undefined) {
          stats[message.stat] += message.value || 1;
        }
        chrome.storage.local.set({ rs_stats: stats }, () => {
          sendResponse({ success: true });
        });
      });
      return true;

    case 'CLEAR_CACHE':
      chrome.storage.local.get(null, (all) => {
        const keys = Object.keys(all).filter(k => k.startsWith('rs_cache_'));
        if (keys.length > 0) {
          chrome.storage.local.remove(keys, () => {
            sendResponse({ cleared: keys.length });
          });
        } else {
          sendResponse({ cleared: 0 });
        }
      });
      return true;

    case 'LOCATE_IP':
      locateIp(String(message.ip || '')).then(sendResponse);
      return true;

    case 'GET_ITEM_VALUES':
      itemValues().then(sendResponse);
      return true;

    case 'GET_PLAYTIME':
      chrome.storage.local.get('rs_playtime', (x) => sendResponse(x.rs_playtime || self.RoSuite.Playtime.empty()));
      return true;

    case 'GET_CACHE_STATS':
      chrome.storage.local.get(null, (all) => {
        let count = 0;
        let size = 0;
        for (const [key, val] of Object.entries(all)) {
          if (key.startsWith('rs_cache_')) {
            count++;
            size += JSON.stringify(val).length;
          }
        }
        sendResponse({ entries: count, sizeKB: (size / 1024).toFixed(1) });
      });
      return true;
  }
});

// Detect Roblox SPA navigation and re-inject if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url && (tab.url.includes('roblox.com'))) {
    chrome.tabs.sendMessage(tabId, { type: 'URL_CHANGED', url: changeInfo.url }).catch(() => {
      // Content script not ready yet, that's fine
    });
  }
});
