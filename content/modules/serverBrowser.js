/**
 * RoSuite Server Browser Module
 * Enhanced server list for game pages with sorting, filtering, and join functionality
 */
(function () {
  'use strict';

  class ServerBrowser {
    constructor() {
      this.placeId = null;
      this.universeId = null;
      this.servers = [];
      this.filteredServers = [];
      this.cursor = '';
      this.hasMore = true;
      this.loading = false;
      this.container = null;
      this.autoRefreshTimer = null;
      this.friendIds = new Set();
      this.loggedInUserId = null;
      this.sortMode = 'players-high';
      this.pingResults = new Map(); // serverId -> { ping, quality }
      this.pingChecking = false;
      this.filters = {
        minPlayers: 0,
        maxPlayers: Infinity,
        hideFull: false,
        hideEmpty: false,
        searchPlayer: '',
      };
    }

    async init() {
      this.placeId = RoSuite.DOM.getGameId();
      if (!this.placeId) return;

      this.universeId = RoSuite.DOM.getUniverseId();
      this.loggedInUserId = RoSuite.DOM.getLoggedInUserId();

      // Load friends list for highlighting
      if (this.loggedInUserId) {
        this._loadFriends();
      }

      // Load saved settings
      const settings = await new Promise(r =>
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, r)
      );
      this.sortMode = settings.serverBrowserSort || 'players-high';
      this.filters.hideFull = settings.serverBrowserHideFull || false;
      this.filters.hideEmpty = settings.serverBrowserHideEmpty || false;

      await this._injectUI();
      await this._loadServers();

      // Measure base latency in background
      RoSuite.Ping.measureBaseLatency().then(latency => {
        this._updateBaseLatency(latency);
      });
    }

    destroy() {
      if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
      if (this.container) this.container.remove();
    }

    async _loadFriends() {
      try {
        const data = await RoSuite.API_Client.getUserFriends(this.loggedInUserId);
        if (data && data.data) {
          data.data.forEach(f => this.friendIds.add(String(f.id)));
        }
      } catch (e) {
        RoSuite.DOM.logError('Failed to load friends:', e);
      }
    }

    async _injectUI() {
      // Find injection point — below the game description
      let anchor;
      try {
        anchor = await RoSuite.DOM.waitForElement(
          '#game-detail-page, .game-main-content, [id*="game-instances"]',
          5000
        );
      } catch {
        anchor = document.querySelector('.content') || document.body;
      }

      this.container = RoSuite.DOM.createElement('div', {
        classes: ['rs-server-browser'],
        attrs: { 'data-rosuite': 'server-browser' },
      });

      // Header
      const header = RoSuite.DOM.createElement('div', {
        classes: ['rs-sb-header'],
        children: [
          RoSuite.DOM.createElement('div', {
            classes: ['rs-sb-title'],
            children: [
              RoSuite.DOM.createElement('span', {
                classes: ['rs-sb-logo'],
                text: 'RS',
              }),
              RoSuite.DOM.createElement('span', { text: 'RoSuite Server Browser' }),
              RoSuite.DOM.createElement('span', {
                classes: ['rs-sb-count'],
                attrs: { id: 'rs-server-count' },
                text: '0 servers',
              }),
            ],
          }),
          RoSuite.DOM.createElement('div', {
            classes: ['rs-sb-controls'],
            children: [
              this._createSortDropdown(),
              RoSuite.DOM.createElement('button', {
                classes: ['rs-btn', 'rs-btn-sm'],
                text: 'Refresh',
                events: { click: () => this._refreshServers() },
              }),
              this._createAutoRefreshToggle(),
            ],
          }),
        ],
      });

      // Filter bar
      const filterBar = this._createFilterBar();

      // Server list container
      this.serverList = RoSuite.DOM.createElement('div', {
        classes: ['rs-sb-list'],
        attrs: { id: 'rs-server-list' },
      });

      // Loading indicator
      this.loadingEl = RoSuite.DOM.createElement('div', {
        classes: ['rs-sb-loading'],
        text: 'Loading servers...',
        style: { display: 'none' },
      });

      // Load more button
      this.loadMoreBtn = RoSuite.DOM.createElement('button', {
        classes: ['rs-btn', 'rs-btn-primary', 'rs-sb-load-more'],
        text: 'Load More Servers',
        style: { display: 'none' },
        events: { click: () => this._loadServers() },
      });

      // Base latency indicator
      this.latencyBar = RoSuite.DOM.createElement('div', {
        classes: ['rs-sb-latency'],
        attrs: { id: 'rs-base-latency' },
        html: '<span class="rs-latency-label">Your connection to Roblox:</span> <span class="rs-latency-value">measuring...</span>',
      });

      // Ping all visible servers button
      this.pingAllBtn = RoSuite.DOM.createElement('button', {
        classes: ['rs-btn', 'rs-btn-sm', 'rs-ping-all-btn'],
        text: 'Check All Pings',
        events: { click: () => this._pingAllServers() },
      });
      this.latencyBar.appendChild(this.pingAllBtn);

      // Ping disclaimer
      const disclaimer = RoSuite.DOM.createElement('span', {
        classes: ['rs-ping-disclaimer'],
        text: 'Ping estimates are approximate',
      });
      this.latencyBar.appendChild(disclaimer);

      this.container.appendChild(header);
      this.container.appendChild(filterBar);
      this.container.appendChild(this.latencyBar);
      this.container.appendChild(this.serverList);
      this.container.appendChild(this.loadingEl);
      this.container.appendChild(this.loadMoreBtn);

      // Insert after the anchor
      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(this.container, anchor.nextSibling);
      } else {
        document.body.appendChild(this.container);
      }
    }

    _createSortDropdown() {
      const select = RoSuite.DOM.createElement('select', {
        classes: ['rs-select'],
        events: {
          change: (e) => {
            this.sortMode = e.target.value;
            this._applyFiltersAndSort();
          },
        },
      });

      const options = [
        { value: 'players-high', text: 'Players (High→Low)' },
        { value: 'players-low', text: 'Players (Low→High)' },
        { value: 'newest', text: 'Newest First' },
        { value: 'oldest', text: 'Oldest First' },
        { value: 'ping', text: 'Best Connection' },
      ];

      options.forEach(opt => {
        const el = RoSuite.DOM.createElement('option', {
          attrs: { value: opt.value },
          text: opt.text,
        });
        if (opt.value === this.sortMode) el.selected = true;
        select.appendChild(el);
      });

      return select;
    }

    _createAutoRefreshToggle() {
      const label = RoSuite.DOM.createElement('label', {
        classes: ['rs-toggle-label'],
        children: [
          RoSuite.DOM.createElement('input', {
            attrs: { type: 'checkbox' },
            events: {
              change: (e) => {
                if (e.target.checked) {
                  this.autoRefreshTimer = setInterval(() => this._refreshServers(), 30000);
                } else {
                  clearInterval(this.autoRefreshTimer);
                  this.autoRefreshTimer = null;
                }
              },
            },
          }),
          RoSuite.DOM.createElement('span', { text: 'Auto-refresh' }),
        ],
      });
      return label;
    }

    _createFilterBar() {
      const bar = RoSuite.DOM.createElement('div', { classes: ['rs-sb-filters'] });

      // Player count range
      const rangeGroup = RoSuite.DOM.createElement('div', {
        classes: ['rs-filter-group'],
        children: [
          RoSuite.DOM.createElement('label', { text: 'Players:' }),
          RoSuite.DOM.createElement('input', {
            attrs: { type: 'number', min: '0', placeholder: 'Min', value: '' },
            classes: ['rs-input', 'rs-input-sm'],
            events: {
              input: (e) => {
                this.filters.minPlayers = parseInt(e.target.value) || 0;
                this._applyFiltersAndSort();
              },
            },
          }),
          RoSuite.DOM.createElement('span', { text: '–' }),
          RoSuite.DOM.createElement('input', {
            attrs: { type: 'number', min: '0', placeholder: 'Max', value: '' },
            classes: ['rs-input', 'rs-input-sm'],
            events: {
              input: (e) => {
                this.filters.maxPlayers = parseInt(e.target.value) || Infinity;
                this._applyFiltersAndSort();
              },
            },
          }),
        ],
      });

      // Toggle: Hide full
      const hideFullToggle = RoSuite.DOM.createElement('label', {
        classes: ['rs-toggle-label'],
        children: [
          RoSuite.DOM.createElement('input', {
            attrs: { type: 'checkbox' },
            events: {
              change: (e) => {
                this.filters.hideFull = e.target.checked;
                this._applyFiltersAndSort();
              },
            },
          }),
          RoSuite.DOM.createElement('span', { text: 'Hide full' }),
        ],
      });
      if (this.filters.hideFull) hideFullToggle.querySelector('input').checked = true;

      // Toggle: Hide empty
      const hideEmptyToggle = RoSuite.DOM.createElement('label', {
        classes: ['rs-toggle-label'],
        children: [
          RoSuite.DOM.createElement('input', {
            attrs: { type: 'checkbox' },
            events: {
              change: (e) => {
                this.filters.hideEmpty = e.target.checked;
                this._applyFiltersAndSort();
              },
            },
          }),
          RoSuite.DOM.createElement('span', { text: 'Hide empty' }),
        ],
      });
      if (this.filters.hideEmpty) hideEmptyToggle.querySelector('input').checked = true;

      // Search by player name
      const searchInput = RoSuite.DOM.createElement('input', {
        attrs: { type: 'text', placeholder: 'Search player...' },
        classes: ['rs-input'],
        events: {
          input: (e) => {
            this.filters.searchPlayer = e.target.value.trim().toLowerCase();
            this._applyFiltersAndSort();
          },
        },
      });

      bar.appendChild(rangeGroup);
      bar.appendChild(hideFullToggle);
      bar.appendChild(hideEmptyToggle);
      bar.appendChild(searchInput);

      return bar;
    }

    async _loadServers() {
      if (this.loading) return;
      this.loading = true;
      this.loadingEl.style.display = 'block';
      this.loadMoreBtn.style.display = 'none';

      try {
        const data = await RoSuite.API_Client.getGameServers(this.placeId, this.cursor);

        if (data && data.data) {
          this.servers.push(...data.data);
          this.cursor = data.nextPageCursor || '';
          this.hasMore = !!data.nextPageCursor;

          chrome.runtime.sendMessage({
            type: 'UPDATE_STAT',
            stat: 'serversScanned',
            value: data.data.length,
          });
        }

        this._applyFiltersAndSort();
        this._updateServerCount();
      } catch (error) {
        RoSuite.DOM.logError('Failed to load servers:', error);
        this.serverList.innerHTML = '';
        this.serverList.appendChild(
          RoSuite.DOM.createElement('div', {
            classes: ['rs-sb-error'],
            text: 'Unable to load servers. Roblox API may be unavailable.',
          })
        );
      } finally {
        this.loading = false;
        this.loadingEl.style.display = 'none';
        if (this.hasMore) {
          this.loadMoreBtn.style.display = 'block';
        }
      }
    }

    async _refreshServers() {
      this.servers = [];
      this.cursor = '';
      this.hasMore = true;
      this.serverList.innerHTML = '';
      await this._loadServers();
    }

    _applyFiltersAndSort() {
      let filtered = [...this.servers];

      // Apply filters
      filtered = filtered.filter(server => {
        const count = server.playing || 0;
        const max = server.maxPlayers || 1;

        if (count < this.filters.minPlayers) return false;
        if (count > this.filters.maxPlayers) return false;
        if (this.filters.hideFull && count >= max) return false;
        if (this.filters.hideEmpty && count === 0) return false;

        if (this.filters.searchPlayer) {
          // Search through player tokens — we don't have names yet at filter level
          // This will be done after rendering
          return true;
        }

        return true;
      });

      // Apply sort
      switch (this.sortMode) {
        case 'players-high':
          filtered.sort((a, b) => (b.playing || 0) - (a.playing || 0));
          break;
        case 'players-low':
          filtered.sort((a, b) => (a.playing || 0) - (b.playing || 0));
          break;
        case 'newest':
          filtered.sort((a, b) => {
            // Use server id as proxy for age (higher = newer)
            return (b.id || '').localeCompare(a.id || '');
          });
          break;
        case 'oldest':
          filtered.sort((a, b) => {
            return (a.id || '').localeCompare(b.id || '');
          });
          break;
        case 'ping':
          filtered.sort((a, b) => {
            const pa = this.pingResults.get(a.id);
            const pb = this.pingResults.get(b.id);
            const pingA = pa ? pa.ping : 99999;
            const pingB = pb ? pb.ping : 99999;
            return pingA - pingB;
          });
          break;
      }

      this.filteredServers = filtered;
      this._renderServers();
    }

    _renderServers() {
      this.serverList.innerHTML = '';

      if (this.filteredServers.length === 0) {
        this.serverList.appendChild(
          RoSuite.DOM.createElement('div', {
            classes: ['rs-sb-empty'],
            text: 'No servers match your filters.',
          })
        );
        return;
      }

      this.filteredServers.forEach((server, index) => {
        const card = this._createServerCard(server, index + 1);
        this.serverList.appendChild(card);
      });

      this._updateServerCount();
    }

    _createServerCard(server, number) {
      const playing = server.playing || 0;
      const maxPlayers = server.maxPlayers || 1;
      const fillPercent = Math.min((playing / maxPlayers) * 100, 100);

      let fillColor = 'var(--rs-success)';
      if (fillPercent > 80) fillColor = 'var(--rs-danger)';
      else if (fillPercent > 50) fillColor = 'var(--rs-warning)';

      const card = RoSuite.DOM.createElement('div', { classes: ['rs-server-card'] });

      // Server header row
      const headerRow = RoSuite.DOM.createElement('div', {
        classes: ['rs-server-header'],
        children: [
          RoSuite.DOM.createElement('span', {
            classes: ['rs-server-number'],
            text: `#${number}`,
          }),
          RoSuite.DOM.createElement('div', {
            classes: ['rs-server-fill'],
            children: [
              RoSuite.DOM.createElement('div', {
                classes: ['rs-fill-bar'],
                children: [
                  RoSuite.DOM.createElement('div', {
                    classes: ['rs-fill-bar-inner'],
                    style: {
                      width: `${fillPercent}%`,
                      backgroundColor: fillColor,
                    },
                  }),
                ],
              }),
              RoSuite.DOM.createElement('span', {
                classes: ['rs-server-players'],
                style: { color: fillColor },
                text: `${playing}/${maxPlayers}`,
              }),
            ],
          }),
          this._createPingIndicator(server),
          RoSuite.DOM.createElement('div', {
            classes: ['rs-server-actions'],
            children: [
              RoSuite.DOM.createElement('button', {
                classes: ['rs-btn', 'rs-btn-sm', 'rs-ping-btn'],
                text: 'Ping',
                attrs: { 'data-server-id': server.id },
                events: {
                  click: (e) => this._checkServerPing(e.target, server),
                },
              }),
              RoSuite.DOM.createElement('button', {
                classes: ['rs-btn', 'rs-btn-primary', 'rs-btn-sm', 'rs-join-btn'],
                text: 'Join',
                events: {
                  click: () => this._joinServer(server),
                },
              }),
              RoSuite.DOM.createElement('button', {
                classes: ['rs-btn', 'rs-btn-sm', 'rs-expand-btn'],
                text: '\u25BC',
                events: {
                  click: (e) => this._togglePlayerList(e.target, server, card),
                },
              }),
            ],
          }),
        ],
      });

      // Player list (hidden by default)
      const playerContainer = RoSuite.DOM.createElement('div', {
        classes: ['rs-player-list'],
        style: { display: 'none' },
        attrs: { 'data-server-id': server.id },
      });

      card.appendChild(headerRow);
      card.appendChild(playerContainer);

      return card;
    }

    async _togglePlayerList(btn, server, card) {
      const playerContainer = card.querySelector('.rs-player-list');
      const isVisible = playerContainer.style.display !== 'none';

      if (isVisible) {
        playerContainer.style.display = 'none';
        btn.textContent = 'Players ▼';
        return;
      }

      playerContainer.style.display = 'block';
      btn.textContent = 'Players ▲';

      // Load player info if not already loaded
      if (playerContainer.children.length === 0) {
        playerContainer.innerHTML = '<div class="rs-loading-text">Loading players...</div>';

        try {
          const playerTokens = server.playerTokens || [];
          if (playerTokens.length === 0) {
            playerContainer.innerHTML = '<div class="rs-loading-text">No player data available</div>';
            return;
          }

          // Fetch player thumbnails using the tokens
          const thumbData = await RoSuite.API_Client.fetch(
            RoSuite.API.BASE.THUMBNAILS,
            '/v1/batch',
            {
              method: 'POST',
              body: playerTokens.map(token => ({
                requestId: `${token}:undefined:AvatarHeadShot:48x48:png:regular`,
                type: 'AvatarHeadShot',
                targetId: 0,
                token,
                size: '48x48',
                format: 'png',
              })),
              cacheTTL: RoSuite.CACHE_TTL.THUMBNAILS,
            }
          );

          playerContainer.innerHTML = '';

          const thumbnails = thumbData.data || thumbData || [];
          thumbnails.forEach(thumb => {
            const row = RoSuite.DOM.createElement('div', {
              classes: ['rs-player-row'],
              children: [
                RoSuite.DOM.createElement('img', {
                  classes: ['rs-player-avatar'],
                  attrs: {
                    src: thumb.imageUrl || '',
                    alt: 'Player',
                    loading: 'lazy',
                  },
                }),
                RoSuite.DOM.createElement('span', {
                  classes: ['rs-player-name'],
                  text: 'Player',
                }),
              ],
            });
            playerContainer.appendChild(row);
          });

          if (thumbnails.length === 0) {
            playerContainer.innerHTML = '<div class="rs-loading-text">Could not load player details</div>';
          }
        } catch (error) {
          RoSuite.DOM.logError('Failed to load player info:', error);
          playerContainer.innerHTML = '<div class="rs-loading-text">Failed to load player info</div>';
        }
      }
    }

    _joinServer(server) {
      const placeId = this.placeId;
      const serverId = server.id;

      // Try using Roblox's built-in game launcher
      try {
        if (typeof Roblox !== 'undefined' && Roblox.GameLauncher) {
          Roblox.GameLauncher.joinGameInstance(placeId, serverId);
          return;
        }
      } catch (e) { /* fall through */ }

      // Fallback: roblox:// protocol URL
      const launchUrl = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
      window.location.href = launchUrl;
    }

    _updateServerCount() {
      const countEl = document.getElementById('rs-server-count');
      if (countEl) {
        countEl.textContent = `${this.filteredServers.length} servers (${this.servers.length} loaded)`;
      }
    }

    _createPingIndicator(server) {
      const existing = this.pingResults.get(server.id);
      const el = RoSuite.DOM.createElement('span', {
        classes: ['rs-server-ping'],
        attrs: { 'data-ping-for': server.id },
      });

      if (existing) {
        const q = RoSuite.Ping.getQuality(existing.ping);
        el.textContent = `${existing.ping}ms`;
        el.style.color = q.color;
        el.title = `${q.label} - ${existing.method}`;
      }

      return el;
    }

    async _checkServerPing(btn, server) {
      btn.textContent = '...';
      btn.disabled = true;

      try {
        const result = await RoSuite.Ping.estimateServerPing(this.placeId, server.id);
        const quality = RoSuite.Ping.getQuality(result.ping);

        this.pingResults.set(server.id, result);

        // Update ping indicator on the card
        const indicator = this.container.querySelector(`[data-ping-for="${server.id}"]`);
        if (indicator) {
          indicator.textContent = `${result.ping}ms`;
          indicator.style.color = quality.color;
          indicator.title = `${quality.label} - ${result.method}`;
        }

        btn.textContent = `${result.ping}ms`;
        btn.style.color = quality.color;
      } catch (e) {
        btn.textContent = 'Err';
      } finally {
        btn.disabled = false;
      }
    }

    async _pingAllServers() {
      if (this.pingChecking) return;
      this.pingChecking = true;

      const serverIds = this.filteredServers.map(s => s.id);
      const total = serverIds.length;

      this.pingAllBtn.disabled = true;
      this.pingAllBtn.textContent = `Checking... 0/${total}`;

      try {
        await RoSuite.Ping.batchCheckPing(
          this.placeId,
          serverIds,
          (done, totalCount, result) => {
            this.pingAllBtn.textContent = `Checking... ${done}/${totalCount}`;
            this.pingResults.set(result.serverId, result);

            // Update the ping indicator in the rendered card
            const indicator = this.container.querySelector(`[data-ping-for="${result.serverId}"]`);
            if (indicator) {
              indicator.textContent = `${result.ping}ms`;
              indicator.style.color = result.quality.color;
              indicator.title = result.quality.label;
            }

            // Update the ping button too
            const pingBtn = this.container.querySelector(`[data-server-id="${result.serverId}"]`);
            if (pingBtn) {
              pingBtn.textContent = `${result.ping}ms`;
              pingBtn.style.color = result.quality.color;
            }
          }
        );

        this.pingAllBtn.textContent = 'Re-check Pings';

        // If sorted by ping, re-sort
        if (this.sortMode === 'ping') {
          this._applyFiltersAndSort();
        }
      } catch (e) {
        RoSuite.DOM.logError('Batch ping failed:', e);
        this.pingAllBtn.textContent = 'Check All Pings';
      } finally {
        this.pingChecking = false;
        this.pingAllBtn.disabled = false;
      }
    }

    _updateBaseLatency(latency) {
      const el = document.getElementById('rs-base-latency');
      if (!el) return;
      const valueEl = el.querySelector('.rs-latency-value');
      if (!valueEl) return;

      if (latency === null) {
        valueEl.textContent = 'unavailable';
        valueEl.style.color = 'var(--rs-text-muted)';
      } else {
        const quality = RoSuite.Ping.getQuality(latency);
        valueEl.textContent = `${latency}ms (${quality.label})`;
        valueEl.style.color = quality.color;
      }
    }
  }

  RoSuite.ServerBrowser = ServerBrowser;
})();
