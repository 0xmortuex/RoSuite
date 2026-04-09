/**
 * RoSuite Cache Layer — chrome.storage.local backed caching
 */
RoSuite.Cache = {
  _memoryCache: new Map(),

  /**
   * Generate a cache key from endpoint and params
   */
  _key(endpoint, params) {
    const paramStr = params ? JSON.stringify(params) : '';
    return `rs_cache_${endpoint}_${paramStr}`;
  },

  /**
   * Get a cached value. Returns null if expired or missing.
   */
  async get(endpoint, params) {
    const key = this._key(endpoint, params);

    // Check memory cache first
    const mem = this._memoryCache.get(key);
    if (mem && Date.now() < mem.expires) {
      return mem.data;
    }

    // Check chrome.storage
    try {
      const result = await chrome.storage.local.get(key);
      const entry = result[key];
      if (entry && Date.now() < entry.expires) {
        this._memoryCache.set(key, entry);
        return entry.data;
      }
      // Expired — remove
      if (entry) {
        chrome.storage.local.remove(key);
      }
    } catch (e) {
      RoSuite.DOM.logError('Cache get error:', e);
    }

    return null;
  },

  /**
   * Store a value in cache with a TTL
   */
  async set(endpoint, params, data, ttl) {
    const key = this._key(endpoint, params);
    const entry = {
      data,
      expires: Date.now() + (ttl || RoSuite.CACHE_TTL.DEFAULT),
      storedAt: Date.now(),
    };

    this._memoryCache.set(key, entry);

    try {
      await chrome.storage.local.set({ [key]: entry });
      await this._enforceSize();
    } catch (e) {
      RoSuite.DOM.logError('Cache set error:', e);
    }
  },

  /**
   * Remove a specific cache entry
   */
  async remove(endpoint, params) {
    const key = this._key(endpoint, params);
    this._memoryCache.delete(key);
    try {
      await chrome.storage.local.remove(key);
    } catch (e) {
      RoSuite.DOM.logError('Cache remove error:', e);
    }
  },

  /**
   * Clear all RoSuite cache entries
   */
  async clear() {
    this._memoryCache.clear();
    try {
      const all = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(all).filter(k => k.startsWith('rs_cache_'));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (e) {
      RoSuite.DOM.logError('Cache clear error:', e);
    }
  },

  /**
   * Evict oldest entries if storage exceeds limit
   */
  async _enforceSize() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheEntries = [];
      let totalSize = 0;

      for (const [key, val] of Object.entries(all)) {
        if (key.startsWith('rs_cache_')) {
          const size = JSON.stringify(val).length;
          totalSize += size;
          cacheEntries.push({ key, storedAt: val.storedAt || 0, size });
        }
      }

      if (totalSize > RoSuite.CACHE_MAX_SIZE) {
        cacheEntries.sort((a, b) => a.storedAt - b.storedAt);
        const keysToRemove = [];
        let freed = 0;
        const target = totalSize - RoSuite.CACHE_MAX_SIZE + (512 * 1024); // free 512KB extra

        for (const entry of cacheEntries) {
          if (freed >= target) break;
          keysToRemove.push(entry.key);
          freed += entry.size;
          this._memoryCache.delete(entry.key);
        }

        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          RoSuite.DOM.log(`Cache: evicted ${keysToRemove.length} entries (${(freed / 1024).toFixed(1)}KB)`);
        }
      }
    } catch (e) {
      RoSuite.DOM.logError('Cache enforce size error:', e);
    }
  },

  /**
   * Get cache stats
   */
  async getStats() {
    try {
      const all = await chrome.storage.local.get(null);
      let count = 0;
      let size = 0;
      for (const [key, val] of Object.entries(all)) {
        if (key.startsWith('rs_cache_')) {
          count++;
          size += JSON.stringify(val).length;
        }
      }
      return { entries: count, sizeKB: (size / 1024).toFixed(1) };
    } catch (e) {
      return { entries: 0, sizeKB: '0' };
    }
  },
};
