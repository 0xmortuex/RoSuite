/**
 * RoSuite API Wrapper — rate limiting, caching, error handling
 */
RoSuite.API_Client = {
  _queue: [],
  _processing: false,
  _lastRequestTimes: [],
  _backoffUntil: 0,
  _stats: { calls: 0, cacheHits: 0 },

  /**
   * Make an API request with caching and rate limiting
   */
  async fetch(baseUrl, endpoint, options = {}) {
    const {
      method = 'GET',
      params = {},
      body = null,
      cacheTTL = RoSuite.CACHE_TTL.DEFAULT,
      skipCache = false,
    } = options;

    let url = baseUrl + endpoint;

    // Replace path params like {placeId}
    url = url.replace(/\{(\w+)\}/g, (_, key) => {
      if (params[key] !== undefined) {
        const val = params[key];
        delete params[key];
        return val;
      }
      return `{${key}}`;
    });

    // Add query params for GET requests
    if (method === 'GET' && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }

    const cacheKey = `${method}:${url}:${body ? JSON.stringify(body) : ''}`;

    // Check cache first
    if (!skipCache) {
      const cached = await RoSuite.Cache.get(cacheKey);
      if (cached !== null) {
        this._stats.cacheHits++;
        this._updateStats();
        return cached;
      }
    }

    // Queue the request for rate limiting
    return new Promise((resolve, reject) => {
      this._queue.push({ url, method, body, cacheKey, cacheTTL, resolve, reject });
      this._processQueue();
    });
  },

  /**
   * Process the request queue with rate limiting
   */
  async _processQueue() {
    if (this._processing) return;
    this._processing = true;

    while (this._queue.length > 0) {
      // Wait for backoff if rate limited
      if (Date.now() < this._backoffUntil) {
        const wait = this._backoffUntil - Date.now();
        RoSuite.DOM.log(`Rate limited, waiting ${wait}ms`);
        await this._sleep(wait);
      }

      // Rate limit: max N requests per second
      const now = Date.now();
      this._lastRequestTimes = this._lastRequestTimes.filter(t => now - t < 1000);

      if (this._lastRequestTimes.length >= RoSuite.RATE_LIMIT.MAX_REQUESTS_PER_SECOND) {
        const oldest = this._lastRequestTimes[0];
        const waitTime = 1000 - (now - oldest) + 10;
        await this._sleep(waitTime);
        continue;
      }

      const req = this._queue.shift();
      this._lastRequestTimes.push(Date.now());
      this._stats.calls++;
      this._updateStats();

      try {
        const fetchOpts = {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Include Roblox session cookie
        };

        if (req.body) {
          fetchOpts.body = JSON.stringify(req.body);
        }

        const response = await window.fetch(req.url, fetchOpts);

        if (response.status === 429) {
          // Rate limited by Roblox
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
          const backoff = Math.min(
            retryAfter * 1000,
            RoSuite.RATE_LIMIT.BACKOFF_MAX_MS
          );
          this._backoffUntil = Date.now() + backoff;
          // Re-queue the request
          this._queue.unshift(req);
          RoSuite.DOM.log(`429 received, backing off ${backoff}ms`);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Cache the result
        await RoSuite.Cache.set(req.cacheKey, null, data, req.cacheTTL);

        req.resolve(data);
      } catch (error) {
        RoSuite.DOM.logError('API request failed:', req.url, error);
        req.reject(error);
      }
    }

    this._processing = false;
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  _updateStats() {
    try {
      chrome.storage.local.get('rs_stats', (result) => {
        const stats = result.rs_stats || { totalCalls: 0, totalCacheHits: 0, date: new Date().toDateString() };
        if (stats.date !== new Date().toDateString()) {
          stats.totalCalls = 0;
          stats.totalCacheHits = 0;
          stats.date = new Date().toDateString();
        }
        stats.totalCalls += 1;
        chrome.storage.local.set({ rs_stats: stats });
      });
    } catch (e) { /* ignore */ }
  },

  // Convenience methods

  async getGameServers(placeId, cursor = '', sortOrder = 'Asc', limit = 100) {
    return this.fetch(RoSuite.API.BASE.GAMES, RoSuite.API.ENDPOINTS.GAME_SERVERS, {
      params: { placeId, sortOrder, limit, cursor },
      cacheTTL: RoSuite.CACHE_TTL.SERVER_LIST,
    });
  },

  async getGameDetails(universeIds) {
    const ids = Array.isArray(universeIds) ? universeIds.join(',') : universeIds;
    return this.fetch(RoSuite.API.BASE.GAMES, RoSuite.API.ENDPOINTS.GAME_DETAILS, {
      params: { universeIds: ids },
      cacheTTL: RoSuite.CACHE_TTL.GAME_DETAILS,
    });
  },

  async getGameVotes(universeIds) {
    const ids = Array.isArray(universeIds) ? universeIds.join(',') : universeIds;
    return this.fetch(RoSuite.API.BASE.GAMES, RoSuite.API.ENDPOINTS.GAME_VOTES, {
      params: { universeIds: ids },
      cacheTTL: RoSuite.CACHE_TTL.GAME_DETAILS,
    });
  },

  async getUserInfo(userId) {
    return this.fetch(RoSuite.API.BASE.USERS, RoSuite.API.ENDPOINTS.USER_INFO, {
      params: { userId },
      cacheTTL: RoSuite.CACHE_TTL.USER_PROFILE,
    });
  },

  async getUserPresence(userIds) {
    return this.fetch(RoSuite.API.BASE.PRESENCE, RoSuite.API.ENDPOINTS.USER_PRESENCE, {
      method: 'POST',
      body: { userIds: Array.isArray(userIds) ? userIds : [userIds] },
      cacheTTL: 15000,
    });
  },

  async getAvatarHeadshots(userIds, size = '48x48') {
    const ids = Array.isArray(userIds) ? userIds.join(',') : userIds;
    return this.fetch(RoSuite.API.BASE.THUMBNAILS, RoSuite.API.ENDPOINTS.AVATAR_HEADSHOT, {
      params: { userIds: ids, size, format: 'Png', isCircular: false },
      cacheTTL: RoSuite.CACHE_TTL.THUMBNAILS,
    });
  },

  async getUserFriends(userId) {
    return this.fetch(RoSuite.API.BASE.FRIENDS, RoSuite.API.ENDPOINTS.USER_FRIENDS, {
      params: { userId },
      cacheTTL: RoSuite.CACHE_TTL.FRIENDS,
    });
  },

  async getUserCollectibles(userId, cursor = '') {
    return this.fetch(RoSuite.API.BASE.INVENTORY, RoSuite.API.ENDPOINTS.USER_COLLECTIBLES, {
      params: { userId, sortOrder: 'Asc', limit: 100, cursor },
      cacheTTL: RoSuite.CACHE_TTL.USER_PROFILE,
    });
  },

  async getTrades(tradeType = 'Inbound', sortOrder = 'Asc', limit = 25) {
    return this.fetch(RoSuite.API.BASE.TRADES, RoSuite.API.ENDPOINTS.TRADES_LIST, {
      params: { tradeType, sortOrder, limit },
      cacheTTL: RoSuite.CACHE_TTL.DEFAULT,
    });
  },

  async getCatalogDetails(itemIds) {
    return this.fetch(RoSuite.API.BASE.CATALOG, RoSuite.API.ENDPOINTS.CATALOG_DETAILS, {
      method: 'POST',
      body: { items: itemIds },
      cacheTTL: RoSuite.CACHE_TTL.GAME_DETAILS,
    });
  },

  async getUserCurrency(userId) {
    return this.fetch(RoSuite.API.BASE.ECONOMY, RoSuite.API.ENDPOINTS.USER_CURRENCY, {
      params: { userId },
      cacheTTL: RoSuite.CACHE_TTL.DEFAULT,
    });
  },
};
