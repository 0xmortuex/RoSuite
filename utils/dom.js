/**
 * RoSuite DOM Helpers
 */
RoSuite.DOM = {
  /**
   * Wait for an element to appear in the DOM
   */
  waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`[RoSuite] Timeout waiting for element: ${selector}`));
      }, timeout);
    });
  },

  /**
   * Create a DOM element with classes, attributes, and children
   */
  createElement(tag, options = {}) {
    const el = document.createElement(tag);

    if (options.classes) {
      const classList = Array.isArray(options.classes) ? options.classes : [options.classes];
      classList.forEach(c => el.classList.add(c));
    }

    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, val]) => el.setAttribute(key, val));
    }

    if (options.text) {
      el.textContent = options.text;
    }

    if (options.html) {
      el.innerHTML = options.html;
    }

    if (options.style) {
      Object.assign(el.style, options.style);
    }

    if (options.events) {
      Object.entries(options.events).forEach(([evt, handler]) => el.addEventListener(evt, handler));
    }

    if (options.children) {
      options.children.forEach(child => {
        if (child instanceof HTMLElement) {
          el.appendChild(child);
        } else if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        }
      });
    }

    if (options.parent) {
      options.parent.appendChild(el);
    }

    return el;
  },

  /**
   * Detect which Roblox page we're on
   */
  getPageType() {
    const path = window.location.pathname;
    if (/^\/games\/\d+/.test(path)) return 'game';
    if (/^\/users\/\d+\/profile/.test(path)) return 'profile';
    if (/^\/trades/.test(path)) return 'trades';
    if (/^\/catalog/.test(path)) return 'catalog';
    if (/^\/(home|discover)?$/.test(path) || path === '/') return 'home';
    return 'other';
  },

  /**
   * Extract place ID from game page URL
   */
  getGameId() {
    const match = window.location.pathname.match(/^\/games\/(\d+)/);
    return match ? match[1] : null;
  },

  /**
   * Extract universe ID from the page's meta data
   */
  getUniverseId() {
    const meta = document.querySelector('meta[name="roblox-universe-id"]');
    if (meta) return meta.getAttribute('content');
    const el = document.getElementById('game-detail-page');
    if (el) return el.getAttribute('data-universe-id');
    return null;
  },

  /**
   * Extract user ID from profile page URL
   */
  getUserId() {
    const match = window.location.pathname.match(/^\/users\/(\d+)/);
    return match ? match[1] : null;
  },

  /**
   * Get the currently logged-in user's ID from Roblox's page data
   */
  getLoggedInUserId() {
    const meta = document.querySelector('meta[name="user-data"]');
    if (meta) {
      try {
        const data = JSON.parse(meta.getAttribute('data-userid') || meta.getAttribute('content'));
        return data.userId || data;
      } catch (e) { /* fall through */ }
      const uid = meta.getAttribute('data-userid');
      if (uid) return uid;
    }

    const userIdMeta = document.querySelector('meta[name="user-data"][data-userid]');
    if (userIdMeta) return userIdMeta.getAttribute('data-userid');

    const pageData = document.querySelector('#navbar-universal-search');
    if (pageData) {
      const uid = pageData.getAttribute('data-userid');
      if (uid) return uid;
    }

    // Try parsing from Roblox's global
    try {
      const headerEl = document.getElementById('header');
      if (headerEl) {
        const uid = headerEl.getAttribute('data-userid');
        if (uid) return uid;
      }
    } catch (e) { /* ignore */ }

    return null;
  },

  /**
   * Log with RoSuite prefix (only when debug is on)
   */
  log(...args) {
    if (RoSuite.DEBUG) {
      console.log('[RoSuite]', ...args);
    }
  },

  /**
   * Log errors always
   */
  logError(...args) {
    console.error('[RoSuite]', ...args);
  },

  /**
   * Format large numbers with commas
   */
  formatNumber(num) {
    if (num == null || isNaN(num)) return '0';
    return Number(num).toLocaleString();
  },

  /**
   * Calculate relative time string
   */
  timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  },

  /**
   * Calculate account age string
   */
  accountAge(createdDate) {
    const created = new Date(createdDate);
    const now = new Date();
    let years = now.getFullYear() - created.getFullYear();
    let months = now.getMonth() - created.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    const parts = [];
    if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    return parts.length ? parts.join(', ') : 'Less than a month';
  },
};
