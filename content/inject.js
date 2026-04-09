/**
 * RoSuite Content Script — Main entry point
 * Detects which Roblox page we're on and loads the appropriate modules
 */
(function () {
  'use strict';

  if (window._rosuiteInjected) return;
  window._rosuiteInjected = true;

  let currentPageType = null;
  let activeModules = [];
  let settings = {};

  /**
   * Detect Roblox's current theme and apply matching RoSuite theme.
   * Roblox uses a 'dark-theme' class on body or a light background color.
   */
  function detectAndApplyTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-theme') ||
      body.getAttribute('data-theme') === 'dark' ||
      getComputedStyle(body).backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/) &&
      (() => {
        const m = getComputedStyle(body).backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        return m && (parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3])) / 3 < 128;
      })();

    const themeSetting = settings.theme || 'auto';
    if (themeSetting === 'light' || (themeSetting === 'auto' && !isDark)) {
      document.documentElement.setAttribute('data-rs-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-rs-theme');
    }
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (result) => {
        settings = result || {};
        resolve(settings);
      });
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function loadCSS(href) {
    const existing = document.querySelector(`link[data-rosuite-css="${href}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(href);
    link.setAttribute('data-rosuite-css', href);
    document.head.appendChild(link);
  }

  function cleanupModules() {
    activeModules.forEach(mod => {
      if (mod && typeof mod.destroy === 'function') {
        try {
          mod.destroy();
        } catch (e) {
          RoSuite.DOM.logError('Module cleanup error:', e);
        }
      }
    });
    activeModules = [];

    // Remove injected RoSuite elements
    document.querySelectorAll('[data-rosuite]').forEach(el => el.remove());
  }

  async function initPage() {
    const pageType = RoSuite.DOM.getPageType();

    if (pageType === currentPageType && activeModules.length > 0) {
      return; // Already initialized for this page type
    }

    cleanupModules();
    currentPageType = pageType;

    await loadSettings();
    detectAndApplyTheme();

    RoSuite.DOM.log('Page type:', pageType, 'Settings:', settings);

    try {
      switch (pageType) {
        case 'game':
          if (settings.gameStats !== false) {
            loadCSS('content/styles/gameStats.css');
            const gameStats = new RoSuite.GameStats();
            activeModules.push(gameStats);
            await gameStats.init();
          }
          if (settings.serverBrowser !== false) {
            loadCSS('content/styles/serverBrowser.css');
            loadCSS('content/styles/playerInfo.css');
            const serverBrowser = new RoSuite.ServerBrowser();
            activeModules.push(serverBrowser);
            await serverBrowser.init();
          }
          break;

        case 'profile':
          if (settings.profileEnhance !== false) {
            loadCSS('content/styles/profileEnhance.css');
            const profileEnhance = new RoSuite.ProfileEnhance();
            activeModules.push(profileEnhance);
            await profileEnhance.init();
          }
          break;

        case 'trades':
          if (settings.tradeCalc !== false) {
            loadCSS('content/styles/tradeCalc.css');
            const tradeCalc = new RoSuite.TradeCalc();
            activeModules.push(tradeCalc);
            await tradeCalc.init();
          }
          break;
      }
    } catch (error) {
      RoSuite.DOM.logError('Module initialization error:', error);
    }
  }

  // Watch for SPA-style navigation
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      RoSuite.DOM.log('URL changed:', lastUrl);
      setTimeout(initPage, 500); // Brief delay for DOM to update
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Listen for background script URL change messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'URL_CHANGED') {
      setTimeout(initPage, 500);
    }
  });

  // Also watch popstate for back/forward navigation
  window.addEventListener('popstate', () => {
    setTimeout(initPage, 500);
  });

  // Initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
