/**
 * RoSuite Ping Estimation
 * Measures latency to Roblox infrastructure and estimates per-server connection quality.
 *
 * fetch() timing includes HTTP overhead (DNS, TLS, server processing) that UDP game
 * connections don't have. We calibrate by measuring the overhead per-user and applying
 * a correction factor to approximate real in-game ping.
 */
RoSuite.Ping = {
  _baseLatency: null,
  _calibrated: false,
  _measuring: false,
  _httpOverhead: 0, // estimated overhead in ms (avg - min from calibration)
  _serverPingCache: new Map(),
  _cacheTTL: 60 * 1000, // 60 seconds

  /** Correction multiplier: approximates UDP vs HTTPS difference */
  _UDP_FACTOR: 0.55,
  /** Minimum realistic ping floor */
  _MIN_PING: 10,

  /**
   * Calibrate HTTP overhead and measure base latency.
   * Takes 10 rapid samples — the minimum is closest to true network latency
   * since later requests reuse TCP/DNS. Overhead = average - minimum.
   */
  async measureBaseLatency() {
    if (this._measuring) return this._baseLatency;
    this._measuring = true;

    const testUrl = 'https://games.roblox.com/v1/games/votes?universeIds=1';
    const results = [];

    // 10 samples for calibration accuracy
    for (let i = 0; i < 10; i++) {
      try {
        const start = performance.now();
        await fetch(testUrl, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
        });
        const end = performance.now();
        results.push(end - start);
      } catch (e) {
        // Network error — skip this sample
      }

      // Brief pause to avoid burst rate limiting
      if (i < 9) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    this._measuring = false;

    if (results.length === 0) {
      this._baseLatency = null;
      return null;
    }

    results.sort((a, b) => a - b);

    const minTime = results[0];
    const avgTime = results.reduce((s, v) => s + v, 0) / results.length;

    // HTTP overhead = average - minimum (captures DNS/TLS/processing bloat)
    this._httpOverhead = avgTime - minTime;
    this._calibrated = true;

    // Corrected base latency: apply UDP factor to the minimum fetch time
    this._baseLatency = this._correctPing(minTime);

    RoSuite.DOM.log(
      'Ping calibration: min=' + Math.round(minTime) + 'ms, avg=' + Math.round(avgTime) + 'ms, ' +
      'overhead=' + Math.round(this._httpOverhead) + 'ms, corrected=' + this._baseLatency + 'ms'
    );

    return this._baseLatency;
  },

  /**
   * Apply correction to a raw fetch timing to approximate real game ping.
   * 1. Subtract calibrated HTTP overhead
   * 2. Apply UDP correction factor (0.55x)
   * 3. Floor at 10ms
   */
  _correctPing(rawMs) {
    const adjusted = rawMs - this._httpOverhead;
    return Math.max(this._MIN_PING, Math.round(adjusted * this._UDP_FACTOR));
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
    // Ensure calibration has run
    if (!this._calibrated) {
      await this.measureBaseLatency();
    }

    // Check cache
    const cacheKey = `${placeId}:${serverId}`;
    const cached = this._serverPingCache.get(cacheKey);
    if (cached && Date.now() - cached.time < this._cacheTTL) {
      return cached.result;
    }

    let result;

    try {
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
      const rawLatency = end - start;
      const correctedPing = this._correctPing(rawLatency);

      if (response.ok) {
        const data = await response.json();
        result = {
          ping: correctedPing,
          raw: Math.round(rawLatency),
          method: 'join-probe',
          region: this._extractRegion(data),
        };
      } else if (response.status === 429) {
        result = await this._fallbackEstimate();
      } else {
        result = {
          ping: correctedPing,
          raw: Math.round(rawLatency),
          method: 'join-probe-partial',
          region: null,
        };
      }
    } catch (e) {
      result = await this._fallbackEstimate();
    }

    this._serverPingCache.set(cacheKey, { result, time: Date.now() });
    return result;
  },

  /**
   * Fallback: use calibrated base latency + navigator.connection info
   */
  async _fallbackEstimate() {
    const base = await this.getBaseLatency();
    let ping = base || this._MIN_PING;

    // Blend with navigator.connection RTT if available
    if (navigator.connection && navigator.connection.rtt) {
      const networkRTT = navigator.connection.rtt;
      // navigator.connection.rtt is already a rough estimate — average with our corrected base
      ping = Math.max(this._MIN_PING, Math.round((ping + networkRTT * this._UDP_FACTOR) / 2));
    }

    return {
      ping,
      raw: null,
      method: 'base-estimate',
      region: null,
    };
  },

  /**
   * Try to extract region info from join response data
   */
  _extractRegion(data) {
    if (!data) return null;
    if (data.joinScript && data.joinScript.MachineAddress) {
      return data.joinScript.MachineAddress;
    }
    return null;
  },

  /**
   * Batch check ping for multiple servers with progress callback.
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
   * Clear the ping cache and calibration data
   */
  clearCache() {
    this._serverPingCache.clear();
    this._baseLatency = null;
    this._calibrated = false;
    this._httpOverhead = 0;
  },
};
