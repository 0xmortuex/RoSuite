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
