/**
 * RoSuite Game Stats Module
 * Enhanced game statistics panel on game detail pages
 */
(function () {
  'use strict';

  class GameStats {
    constructor() {
      this.placeId = null;
      this.universeId = null;
      this.container = null;
      this.refreshTimer = null;
      this.peakPlayers = 0;
      this.serverData = null;
    }

    async init() {
      this.placeId = RoSuite.DOM.getGameId();
      if (!this.placeId) return;

      this.universeId = RoSuite.DOM.getUniverseId();

      await this._injectUI();
      await this._loadAllStats();

      // Auto-refresh every 30s
      this.refreshTimer = setInterval(() => this._refreshLiveStats(), 30000);
    }

    destroy() {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      if (this.container) this.container.remove();
    }

    async _injectUI() {
      let anchor;
      try {
        anchor = await RoSuite.DOM.waitForElement(
          '#game-detail-page, .game-main-content, .game-stats-container',
          5000
        );
      } catch {
        anchor = document.querySelector('.content') || document.body;
      }

      this.container = RoSuite.DOM.createElement('div', {
        classes: ['rs-game-stats'],
        attrs: { 'data-rosuite': 'game-stats' },
      });

      // Header
      const header = RoSuite.DOM.createElement('div', {
        classes: ['rs-section-header'],
        children: [
          RoSuite.DOM.createElement('span', {
            classes: ['rs-sb-logo'],
            text: 'RS',
          }),
          RoSuite.DOM.createElement('span', { text: 'Enhanced Game Stats' }),
        ],
      });

      this.container.appendChild(header);

      // Stats grid
      this.statsGrid = RoSuite.DOM.createElement('div', {
        classes: ['rs-stats-grid'],
      });
      this.container.appendChild(this.statsGrid);

      // Rating bar
      this.ratingContainer = RoSuite.DOM.createElement('div', {
        classes: ['rs-rating-container'],
      });
      this.container.appendChild(this.ratingContainer);

      // Server distribution chart
      this.chartContainer = RoSuite.DOM.createElement('div', {
        classes: ['rs-chart-container'],
      });
      this.container.appendChild(this.chartContainer);

      // Game info cards
      this.infoCards = RoSuite.DOM.createElement('div', {
        classes: ['rs-info-cards'],
      });
      this.container.appendChild(this.infoCards);

      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(this.container, anchor.nextSibling);
      }
    }

    async _loadAllStats() {
      await Promise.allSettled([
        this._loadLiveStats(),
        this._loadVotes(),
        this._loadGameDetails(),
      ]);
    }

    async _refreshLiveStats() {
      await this._loadLiveStats();
    }

    async _loadLiveStats() {
      try {
        const data = await RoSuite.API_Client.getGameServers(this.placeId, '', 'Asc', 100);
        if (!data || !data.data) return;

        this.serverData = data.data;

        let totalPlayers = 0;
        let totalServers = data.data.length;
        let maxPerServer = 0;

        data.data.forEach(server => {
          totalPlayers += server.playing || 0;
          if (server.maxPlayers > maxPerServer) maxPerServer = server.maxPlayers;
        });

        if (totalPlayers > this.peakPlayers) {
          this.peakPlayers = totalPlayers;
        }

        const avgPlayers = totalServers > 0 ? (totalPlayers / totalServers).toFixed(1) : '0';

        this.statsGrid.innerHTML = '';

        const stats = [
          { label: 'Active Players', value: RoSuite.DOM.formatNumber(totalPlayers), className: 'rs-stat-players' },
          { label: 'Active Servers', value: RoSuite.DOM.formatNumber(totalServers), className: '' },
          { label: 'Avg per Server', value: avgPlayers, className: '' },
          { label: 'Session Peak', value: RoSuite.DOM.formatNumber(this.peakPlayers), className: 'rs-stat-peak' },
        ];

        stats.forEach(stat => {
          this.statsGrid.appendChild(
            RoSuite.DOM.createElement('div', {
              classes: ['rs-stat-card', stat.className].filter(Boolean),
              html: `
                <div class="rs-stat-value">${stat.value}</div>
                <div class="rs-stat-label">${stat.label}</div>
              `,
            })
          );
        });

        // Update server distribution chart
        this._renderDistributionChart(data.data);
      } catch (e) {
        RoSuite.DOM.logError('GameStats: Failed to load live stats:', e);
        this.statsGrid.innerHTML = '<div class="rs-sb-error">Could not load live stats</div>';
      }
    }

    async _loadVotes() {
      if (!this.universeId) {
        // Try to get universe ID from page
        await this._waitForUniverseId();
      }
      if (!this.universeId) return;

      try {
        const data = await RoSuite.API_Client.getGameVotes(this.universeId);
        if (!data || !data.data || data.data.length === 0) return;

        const votes = data.data[0];
        const upVotes = votes.upVotes || 0;
        const downVotes = votes.downVotes || 0;
        const total = upVotes + downVotes;
        const approval = total > 0 ? ((upVotes / total) * 100).toFixed(1) : 0;
        const likePercent = total > 0 ? (upVotes / total) * 100 : 50;

        this.ratingContainer.innerHTML = `
          <div class="rs-rating-header">
            <span class="rs-rating-approval">Approval Rating: ${approval}%</span>
            <span class="rs-rating-total">${RoSuite.DOM.formatNumber(total)} votes</span>
          </div>
          <div class="rs-rating-bar">
            <div class="rs-rating-bar-likes" style="width: ${likePercent}%"></div>
            <div class="rs-rating-bar-dislikes" style="width: ${100 - likePercent}%"></div>
          </div>
          <div class="rs-rating-counts">
            <span class="rs-rating-likes">👍 ${RoSuite.DOM.formatNumber(upVotes)}</span>
            <span class="rs-rating-dislikes">👎 ${RoSuite.DOM.formatNumber(downVotes)}</span>
          </div>
        `;
      } catch (e) {
        RoSuite.DOM.logError('GameStats: Failed to load votes:', e);
      }
    }

    async _loadGameDetails() {
      if (!this.universeId) {
        await this._waitForUniverseId();
      }
      if (!this.universeId) return;

      try {
        const data = await RoSuite.API_Client.getGameDetails(this.universeId);
        if (!data || !data.data || data.data.length === 0) return;

        const game = data.data[0];

        this.infoCards.innerHTML = '';

        const details = [
          { label: 'Created', value: game.created ? new Date(game.created).toLocaleDateString() : 'Unknown' },
          { label: 'Updated', value: game.updated ? new Date(game.updated).toLocaleDateString() : 'Unknown' },
          { label: 'Max Players', value: game.maxPlayers || 'Unknown' },
          { label: 'Genre', value: game.genre || 'Unknown' },
          {
            label: 'Creator',
            value: game.creator ? game.creator.name : 'Unknown',
            link: game.creator && game.creator.type === 'User'
              ? `https://www.roblox.com/users/${game.creator.id}/profile`
              : game.creator && game.creator.type === 'Group'
                ? `https://www.roblox.com/groups/${game.creator.id}`
                : null,
          },
          { label: 'Visits', value: game.visits ? RoSuite.DOM.formatNumber(game.visits) : 'Unknown' },
          { label: 'Favorites', value: game.favoritedCount ? RoSuite.DOM.formatNumber(game.favoritedCount) : 'Unknown' },
        ];

        details.forEach(detail => {
          const card = RoSuite.DOM.createElement('div', {
            classes: ['rs-info-card'],
          });

          card.appendChild(
            RoSuite.DOM.createElement('div', {
              classes: ['rs-info-label'],
              text: detail.label,
            })
          );

          if (detail.link) {
            card.appendChild(
              RoSuite.DOM.createElement('a', {
                classes: ['rs-info-value', 'rs-info-link'],
                attrs: { href: detail.link, target: '_blank' },
                text: String(detail.value),
              })
            );
          } else {
            card.appendChild(
              RoSuite.DOM.createElement('div', {
                classes: ['rs-info-value'],
                text: String(detail.value),
              })
            );
          }

          this.infoCards.appendChild(card);
        });
      } catch (e) {
        RoSuite.DOM.logError('GameStats: Failed to load game details:', e);
      }
    }

    _renderDistributionChart(servers) {
      if (!servers || servers.length === 0) {
        this.chartContainer.innerHTML = '';
        return;
      }

      const buckets = [
        { label: '0-25%', count: 0 },
        { label: '25-50%', count: 0 },
        { label: '50-75%', count: 0 },
        { label: '75-100%', count: 0 },
      ];

      servers.forEach(server => {
        const fill = server.maxPlayers > 0
          ? (server.playing / server.maxPlayers) * 100
          : 0;

        if (fill <= 25) buckets[0].count++;
        else if (fill <= 50) buckets[1].count++;
        else if (fill <= 75) buckets[2].count++;
        else buckets[3].count++;
      });

      const maxCount = Math.max(...buckets.map(b => b.count), 1);

      this.chartContainer.innerHTML = `
        <div class="rs-chart-title">Server Fill Distribution</div>
        <div class="rs-chart">
          ${buckets.map(bucket => {
            const height = (bucket.count / maxCount) * 100;
            return `
              <div class="rs-chart-bar-container">
                <div class="rs-chart-count">${bucket.count}</div>
                <div class="rs-chart-bar" style="height: ${Math.max(height, 4)}%"></div>
                <div class="rs-chart-label">${bucket.label}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    async _waitForUniverseId() {
      // Try multiple times to get the universe ID
      for (let i = 0; i < 10; i++) {
        this.universeId = RoSuite.DOM.getUniverseId();
        if (this.universeId) return;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  RoSuite.GameStats = GameStats;
})();
