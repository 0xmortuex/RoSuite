/**
 * RoSuite Background Service Worker
 * Handles message passing, API request coordination, and stats tracking
 */

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
        },
      });
    }
  });
});

// Message handler for communication between content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get('rs_settings', (result) => {
        sendResponse(result.rs_settings || {});
      });
      return true;

    case 'SET_SETTINGS':
      chrome.storage.local.get('rs_settings', (result) => {
        const settings = { ...result.rs_settings, ...message.settings };
        chrome.storage.local.set({ rs_settings: settings }, () => {
          sendResponse({ success: true });
        });
      });
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
