/**
 * RoSuite Ping Estimation
 * Measures latency to Roblox infrastructure and estimates per-server connection quality.
 */
RoSuite.Ping = {
  _baseLatency: null,
  _measuring: false,
  _serverPingCache: new Map(),
  _cacheTTL: 60 * 1000, // 60 seconds

  /**
   * Measure base latency to Roblox's API infrastructure.
   * Takes multiple samples and returns the median.
   */
  async measureBaseLatency(samples = 5) {
    if (this._measuring) return this._baseLatency;
    this._measuring = true;

    const testUrl = 'https://games.roblox.com/v1/games/votes?universeIds=1';
    const results = [];

    for (let i = 0; i < samples; i++) {
      try {
        const start = performance.now();
        await fetch(testUrl, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
        });
        const end = performance.now();
        results.push(Math.round(end - start));
      } catch (e) {
        // Network error — skip this sample
      }

      // Small delay between samples to avoid burst
      if (i < samples - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    this._measuring = false;

    if (results.length === 0) {
      this._baseLatency = null;
      return null;
    }

    // Use median for stability
    results.sort((a, b) => a - b);
    this._baseLatency = results[Math.floor(results.length / 2)];

    RoSuite.DOM.log('Base Roblox latency:', this._baseLatency, 'ms (from', results.length, 'samples)');
    return this._baseLatency;
  },

  /**
   * Get the cached base latency, or measure if not yet done.
   */
  async getBaseLatency() {
    if (this._baseLatency !== null) return this._baseLatency;
    return this.measureBaseLatency();
  },

  /**
   * Estimate ping for a specific server by timing a request to the
   * game join endpoint with the server's instance ID.
   * Falls back to base latency if the join endpoint is restricted.
   */
  async estimateServerPing(placeId, serverId) {
    // Check cache
    const cacheKey = `${placeId}:${serverId}`;
    const cached = this._serverPingCache.get(cacheKey);
    if (cached && Date.now() - cached.time < this._cacheTTL) {
      return cached.result;
    }

    let result;

    try {
      // Try timing a request to the join endpoint
      // This doesn't actually join — we just time the response
      const start = performance.now();
      const response = await fetch('https://gamejoin.roblox.com/v1/join-game-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          placeId: parseInt(placeId),
          isTeleport: false,
          gameId: serverId,
          gameJoinAttemptId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        }),
      });
      const end = performance.now();
      const latency = Math.round(end - start);

      // The join endpoint may return useful data even without actually joining
      if (response.ok) {
        const data = await response.json();
        // If we got a server address, that's extra info
        result = {
          ping: latency,
          method: 'join-probe',
          region: this._extractRegion(data),
        };
      } else if (response.status === 429) {
        // Rate limited — fall back to base latency
        result = await this._fallbackEstimate();
      } else {
        // Auth error or other — the latency itself is still meaningful
        // as it shows network round-trip to Roblox
        result = {
          ping: latency,
          method: 'join-probe-partial',
          region: null,
        };
      }
    } catch (e) {
      // Network error — fall back to base latency
      result = await this._fallbackEstimate();
    }

    // Cache the result
    this._serverPingCache.set(cacheKey, { result, time: Date.now() });
    return result;
  },

  /**
   * Fallback: use base latency + navigator.connection info
   */
  async _fallbackEstimate() {
    const base = await this.getBaseLatency();
    let ping = base || 0;

    // Use navigator.connection RTT if available
    if (navigator.connection && navigator.connection.rtt) {
      // navigator.connection.rtt is in ms, represents the network RTT
      // Combine with our measured base latency
      const networkRTT = navigator.connection.rtt;
      ping = Math.round((ping + networkRTT) / 2);
    }

    return {
      ping,
      method: 'base-estimate',
      region: null,
    };
  },

  /**
   * Try to extract region info from join response data
   */
  _extractRegion(data) {
    if (!data) return null;
    // The join response may contain a server address or region hint
    if (data.joinScript && data.joinScript.MachineAddress) {
      return data.joinScript.MachineAddress;
    }
    return null;
  },

  /**
   * Batch check ping for multiple servers with progress callback.
   * Returns array of { serverId, ping, quality } objects.
   */
  async batchCheckPing(placeId, serverIds, onProgress) {
    const results = [];
    const total = serverIds.length;

    for (let i = 0; i < total; i++) {
      const serverId = serverIds[i];
      const pingResult = await this.estimateServerPing(placeId, serverId);

      results.push({
        serverId,
        ping: pingResult.ping,
        quality: this.getQuality(pingResult.ping),
        method: pingResult.method,
        region: pingResult.region,
      });

      if (onProgress) {
        onProgress(i + 1, total, results[results.length - 1]);
      }

      // Rate limit: don't hammer the endpoint
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return results;
  },

  /**
   * Categorize ping quality
   */
  getQuality(pingMs) {
    if (pingMs == null || pingMs <= 0) return { label: 'Unknown', color: 'var(--rs-text-muted)', level: 'unknown' };
    if (pingMs < 50) return { label: 'Excellent', color: 'var(--rs-success)', level: 'excellent' };
    if (pingMs < 100) return { label: 'Good', color: '#66cc66', level: 'good' };
    if (pingMs < 200) return { label: 'Fair', color: 'var(--rs-warning)', level: 'fair' };
    return { label: 'Poor', color: 'var(--rs-danger)', level: 'poor' };
  },

  /**
   * Clear the ping cache
   */
  clearCache() {
    this._serverPingCache.clear();
    this._baseLatency = null;
  },
};
