/**
 * RoSuite Options Page Script
 */
document.addEventListener('DOMContentLoaded', () => {
  const saveStatus = document.getElementById('rs-save-status');

  function showSaved() {
    saveStatus.textContent = 'Settings saved';
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  }

  // Load current settings
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
    if (!settings) return;

    // Apply checkbox settings
    document.querySelectorAll('input[data-setting]').forEach(input => {
      const key = input.getAttribute('data-setting');
      if (settings[key] !== undefined) {
        input.checked = settings[key];
      }
    });

    // Apply select settings
    document.querySelectorAll('select[data-setting]').forEach(select => {
      const key = select.getAttribute('data-setting');
      if (settings[key] !== undefined) {
        select.value = String(settings[key]);
      }
    });
  });

  // Checkbox change handlers
  document.querySelectorAll('input[data-setting]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.getAttribute('data-setting');
      chrome.runtime.sendMessage({
        type: 'SET_SETTINGS',
        settings: { [key]: input.checked },
      }, () => showSaved());
    });
  });

  // Select change handlers
  document.querySelectorAll('select[data-setting]').forEach(select => {
    select.addEventListener('change', () => {
      const key = select.getAttribute('data-setting');
      let value = select.value;
      // Convert numeric strings to numbers
      if (!isNaN(value) && value !== '') {
        value = Number(value);
      }
      chrome.runtime.sendMessage({
        type: 'SET_SETTINGS',
        settings: { [key]: value },
      }, () => showSaved());
    });
  });

  // Reset all settings
  document.getElementById('rs-reset-settings').addEventListener('click', () => {
    if (confirm('Reset all RoSuite settings to defaults? This cannot be undone.')) {
      const defaults = {
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
      };

      chrome.runtime.sendMessage({
        type: 'SET_SETTINGS',
        settings: defaults,
      }, () => {
        window.location.reload();
      });
    }
  });
});
