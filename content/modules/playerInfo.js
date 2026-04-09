/**
 * RoSuite Player Info Module
 * Shows detailed player information in server player lists
 */
(function () {
  'use strict';

  class PlayerInfo {
    constructor() {
      this.cache = new Map();
      this.loggedInUserId = null;
      this.friendIds = new Set();
    }

    async init() {
      this.loggedInUserId = RoSuite.DOM.getLoggedInUserId();
      if (this.loggedInUserId) {
        await this._loadFriends();
      }
    }

    destroy() {
      this.cache.clear();
    }

    async _loadFriends() {
      try {
        const data = await RoSuite.API_Client.getUserFriends(this.loggedInUserId);
        if (data && data.data) {
          data.data.forEach(f => this.friendIds.add(String(f.id)));
        }
      } catch (e) {
        RoSuite.DOM.logError('PlayerInfo: Failed to load friends:', e);
      }
    }

    /**
     * Create a detailed player row element
     */
    createPlayerRow(userId, username, displayName, thumbnailUrl) {
      const isFriend = this.friendIds.has(String(userId));

      const row = RoSuite.DOM.createElement('div', {
        classes: ['rs-player-row'],
      });

      // Avatar
      const avatar = RoSuite.DOM.createElement('img', {
        classes: ['rs-player-avatar'],
        attrs: {
          src: thumbnailUrl || '',
          alt: username || 'Player',
          loading: 'lazy',
        },
      });

      // Name container
      const nameContainer = RoSuite.DOM.createElement('div', {
        classes: ['rs-player-name-container'],
      });

      const nameLink = RoSuite.DOM.createElement('a', {
        classes: ['rs-player-name'],
        attrs: {
          href: `https://www.roblox.com/users/${userId}/profile`,
          target: '_blank',
          rel: 'noopener',
        },
        text: username || 'Unknown',
      });

      nameContainer.appendChild(nameLink);

      if (displayName && displayName !== username) {
        const display = RoSuite.DOM.createElement('span', {
          classes: ['rs-player-display-name'],
          text: ` (${displayName})`,
        });
        nameContainer.appendChild(display);
      }

      // Badges container
      const badges = RoSuite.DOM.createElement('div', {
        classes: ['rs-player-badges'],
      });

      if (isFriend) {
        badges.appendChild(
          RoSuite.DOM.createElement('span', {
            classes: ['rs-badge', 'rs-badge-friend'],
            text: 'Friend',
          })
        );
      }

      row.appendChild(avatar);
      row.appendChild(nameContainer);
      row.appendChild(badges);

      // Add hover tooltip with more info
      row.addEventListener('mouseenter', () => this._showTooltip(row, userId));
      row.addEventListener('mouseleave', () => this._hideTooltip(row));

      return row;
    }

    /**
     * Enrich a player row with async data (account age, presence, etc.)
     */
    async enrichPlayerRow(row, userId) {
      try {
        const userInfo = await RoSuite.API_Client.getUserInfo(userId);
        if (!userInfo) return;

        const badges = row.querySelector('.rs-player-badges');
        if (!badges) return;

        // Account age badge
        if (userInfo.created) {
          const created = new Date(userInfo.created);
          const ageYears = (Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

          let ageClass = 'rs-badge-age-new';
          if (ageYears > 3) ageClass = 'rs-badge-age-old';
          else if (ageYears >= 1) ageClass = 'rs-badge-age-mid';

          badges.appendChild(
            RoSuite.DOM.createElement('span', {
              classes: ['rs-badge', ageClass],
              text: `${Math.floor(ageYears)}y`,
            })
          );
        }

        // Store data for tooltip
        this.cache.set(String(userId), userInfo);
      } catch (e) {
        // Silently fail — player info is enhancement, not critical
      }
    }

    _showTooltip(row, userId) {
      this._hideTooltip(row);

      const userInfo = this.cache.get(String(userId));
      if (!userInfo) return;

      const tooltip = RoSuite.DOM.createElement('div', {
        classes: ['rs-player-tooltip'],
      });

      const lines = [];
      if (userInfo.created) {
        lines.push(`Joined: ${new Date(userInfo.created).toLocaleDateString()}`);
        lines.push(`Account Age: ${RoSuite.DOM.accountAge(userInfo.created)}`);
      }
      if (userInfo.isBanned) {
        lines.push('Status: Banned');
      }

      tooltip.innerHTML = lines.map(l => `<div class="rs-tooltip-line">${l}</div>`).join('');

      row.style.position = 'relative';
      row.appendChild(tooltip);
    }

    _hideTooltip(row) {
      const tooltip = row.querySelector('.rs-player-tooltip');
      if (tooltip) tooltip.remove();
    }

    /**
     * Get presence info for multiple users
     */
    async getPresence(userIds) {
      try {
        const data = await RoSuite.API_Client.getUserPresence(userIds);
        if (data && data.userPresences) {
          return data.userPresences;
        }
      } catch (e) {
        RoSuite.DOM.logError('PlayerInfo: Failed to get presence:', e);
      }
      return [];
    }
  }

  RoSuite.PlayerInfo = PlayerInfo;
})();
