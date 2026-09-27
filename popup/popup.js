/**
 * RoSuite Popup Script
 */
document.addEventListener('DOMContentLoaded', () => {
  // Load current settings and apply toggle states
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
    if (!settings) return;

    document.querySelectorAll('[data-setting]').forEach(toggle => {
      const key = toggle.getAttribute('data-setting');
      if (settings[key] !== undefined) {
        toggle.checked = settings[key];
      }
    });
  });

  // The version comes from the manifest, so it can never say the wrong one.
  document.getElementById('rs-version').textContent = 'v' + chrome.runtime.getManifest().version;

  // Recently played, with how long (utils/playtime.js, counted by the
  // background worker). Game names come from Roblox's presence and are text.
  chrome.runtime.sendMessage({ type: 'GET_PLAYTIME' }, (state) => {
    const games = window.RoSuite && RoSuite.Playtime ? RoSuite.Playtime.list(state).slice(0, 8) : [];
    if (!games.length) return;
    const list = document.getElementById('rs-played-list');
    for (const g of games) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.textContent = g.name || ('Game ' + g.universeId);
      if (g.placeId) { a.href = 'https://www.roblox.com/games/' + g.placeId; a.target = '_blank'; a.rel = 'noopener'; }
      const time = document.createElement('span');
      time.textContent = RoSuite.Playtime.format(g.minutes);
      li.append(a, time);
      list.appendChild(li);
    }
    document.getElementById('rs-played').hidden = false;
  });

  // Load stats
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
    if (!stats) return;
    document.getElementById('rs-cache-hits').textContent = stats.totalCacheHits || 0;
    document.getElementById('rs-servers-scanned').textContent = stats.serversScanned || 0;
  });

  // Toggle change handlers
  document.querySelectorAll('[data-setting]').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const key = toggle.getAttribute('data-setting');
      chrome.runtime.sendMessage({
        type: 'SET_SETTINGS',
        settings: { [key]: toggle.checked },
      });
    });
  });

  // Clear cache
  document.getElementById('rs-clear-cache').addEventListener('click', (e) => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, (result) => {
      e.target.textContent = `Cleared ${result.cleared} entries`;
      setTimeout(() => {
        e.target.textContent = 'Clear Cache';
      }, 2000);
    });
  });

  // Open settings
  document.getElementById('rs-open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
