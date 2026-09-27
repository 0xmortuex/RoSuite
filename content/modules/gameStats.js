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
      RoSuite.Motion.animateIn(this.container);
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

    // Players come from Roblox's own live count for the game (game details,
    // `playing`). They used to be the sum of ONE page of 100 servers sorted
    // emptiest-first, shown as the game's total: Brookhaven read "100 active
    // players, 100 active servers". Roblox publishes no server count, so the
    // honest figure is a floor: players divided by the most a server holds.
    async _loadLiveStats() {
      try {
        if (!this.universeId) await this._waitForUniverseId();
        const [details, servers] = await Promise.all([
          this.universeId ? RoSuite.API_Client.getGameLive(this.universeId).catch(() => null) : null,
          RoSuite.API_Client.getGameServers(this.placeId, '', 'Desc', 100).catch(() => null),
        ]);
        const game = details && details.data && details.data[0];
        const sample = (servers && servers.data) || [];
        this.serverData = sample;
        if (!game && !sample.length) throw new Error('no data');

        const playing = game ? (game.playing || 0) : null;
        const maxPlayers = (game && game.maxPlayers) || Math.max(0, ...sample.map(s => s.maxPlayers || 0));
        if (playing != null && playing > this.peakPlayers) this.peakPlayers = playing;

        const sampled = sample.reduce((n, s) => n + (s.playing || 0), 0);
        const avgBusy = sample.length ? (sampled / sample.length).toFixed(1) : '—';
        const minServers = playing && maxPlayers ? Math.ceil(playing / maxPlayers) : null;

        this.statsGrid.innerHTML = '';

        const stats = [
          { label: 'Playing now', value: playing != null ? RoSuite.DOM.formatNumber(playing) : '—', className: 'rs-stat-players' },
          { label: 'Servers (at least)', value: minServers != null ? RoSuite.DOM.formatNumber(minServers) : '—', className: '' },
          { label: 'Avg in busiest ' + (sample.length || 100), value: avgBusy, className: '' },
          { label: 'Peak this visit', value: this.peakPlayers ? RoSuite.DOM.formatNumber(this.peakPlayers) : '—', className: 'rs-stat-peak' },
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
        RoSuite.Motion.staggerIn(this.statsGrid.querySelectorAll('.rs-stat-card'));

        // Update server distribution chart
        this._renderDistributionChart(sample);
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
        RoSuite.Motion.staggerIn(this.infoCards.querySelectorAll('.rs-info-card'));
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
        <div class="rs-chart-title">How full the ${servers.length} busiest servers are</div>
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

    // From the page if it says, otherwise from Roblox's place-to-universe
    // lookup. Three callers ask at once on load; they share one request.
    async _waitForUniverseId() {
      this.universeId = this.universeId || RoSuite.DOM.getUniverseId();
      if (this.universeId) return;
      if (!this._universeLookup) {
        this._universeLookup = RoSuite.API_Client.getUniverseIdForPlace(this.placeId)
          .then(id => { this.universeId = id; })
          .catch(e => { RoSuite.DOM.logError('GameStats: could not find the universe:', e); });
      }
      await this._universeLookup;
    }
  }

  RoSuite.GameStats = GameStats;
})();
