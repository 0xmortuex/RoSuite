/**
 * RoSuite Profile Enhancements Module
 * Adds account value, age, activity stats, and quick actions to profile pages
 */
(function () {
  'use strict';

  class ProfileEnhance {
    constructor() {
      this.userId = null;
      this.loggedInUserId = null;
      this.container = null;
    }

    async init() {
      this.userId = RoSuite.DOM.getUserId();
      if (!this.userId) return;

      this.loggedInUserId = RoSuite.DOM.getLoggedInUserId();

      await this._injectUI();
      this._loadData();
    }

    destroy() {
      if (this.container) this.container.remove();
    }

    async _injectUI() {
      let anchor;
      try {
        anchor = await RoSuite.DOM.waitForElement(
          '.profile-container .profile-about, .profile-about-content, .rbx-tabs-horizontal',
          5000
        );
      } catch {
        anchor = document.querySelector('.content') || document.body;
      }

      this.container = RoSuite.DOM.createElement('div', {
        classes: ['rs-profile-section'],
        attrs: { 'data-rosuite': 'profile-enhance' },
      });

      // Header
      const header = RoSuite.DOM.createElement('div', {
        classes: ['rs-section-header'],
        children: [
          RoSuite.DOM.createElement('span', {
            classes: ['rs-sb-logo'],
            text: 'RS',
          }),
          RoSuite.DOM.createElement('span', { text: 'RoSuite Profile' }),
        ],
      });

      this.container.appendChild(header);

      // Content grid
      this.contentGrid = RoSuite.DOM.createElement('div', {
        classes: ['rs-profile-grid'],
      });
      this.container.appendChild(this.contentGrid);

      // Quick actions
      this.container.appendChild(this._createQuickActions());

      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(this.container, anchor.nextSibling);
      }
    }

    async _loadData() {
      // Load user info, collectibles, friends, and presence in parallel
      const tasks = [
        this._loadUserInfo(),
        this._loadAccountValue(),
        this._loadActivity(),
      ];

      if (this.loggedInUserId && this.loggedInUserId !== this.userId) {
        tasks.push(this._loadMutualFriends());
      }

      await Promise.allSettled(tasks);
    }

    async _loadUserInfo() {
      try {
        const user = await RoSuite.API_Client.getUserInfo(this.userId);
        if (!user) return;

        // Account Age Card
        const ageCard = this._createCard('Account Age', []);
        if (user.created) {
          const created = new Date(user.created);
          const ageStr = RoSuite.DOM.accountAge(user.created);
          ageCard.querySelector('.rs-card-body').innerHTML = `
            <div class="rs-stat-value">${ageStr}</div>
            <div class="rs-stat-label">Created ${created.toLocaleDateString()}</div>
          `;
        } else {
          ageCard.querySelector('.rs-card-body').textContent = 'Unknown';
        }
        this.contentGrid.appendChild(ageCard);
      } catch (e) {
        RoSuite.DOM.logError('Profile: Failed to load user info:', e);
      }
    }

    async _loadAccountValue() {
      const card = this._createCard('Estimated Value (RAP)', []);
      this.contentGrid.appendChild(card);

      try {
        let totalRAP = 0;
        let cursor = '';
        let hasMore = true;
        let itemCount = 0;

        while (hasMore) {
          const data = await RoSuite.API_Client.getUserCollectibles(this.userId, cursor);

          if (!data || !data.data) {
            card.querySelector('.rs-card-body').innerHTML = `
              <div class="rs-stat-value rs-text-muted">Inventory Private</div>
              <div class="rs-stat-label">This user's inventory is private</div>
            `;
            return;
          }

          data.data.forEach(item => {
            totalRAP += item.recentAveragePrice || 0;
            itemCount++;
          });

          cursor = data.nextPageCursor || '';
          hasMore = !!data.nextPageCursor;
        }

        card.querySelector('.rs-card-body').innerHTML = `
          <div class="rs-stat-value rs-text-green">R$ ${RoSuite.DOM.formatNumber(totalRAP)}</div>
          <div class="rs-stat-label">${RoSuite.DOM.formatNumber(itemCount)} limited items</div>
        `;
      } catch (e) {
        const body = card.querySelector('.rs-card-body');
        if (e.message && e.message.includes('403')) {
          body.innerHTML = `
            <div class="rs-stat-value rs-text-muted">Inventory Private</div>
            <div class="rs-stat-label">This user's inventory is private</div>
          `;
        } else {
          body.innerHTML = `
            <div class="rs-stat-value rs-text-muted">Unavailable</div>
            <div class="rs-stat-label">Could not load value data</div>
          `;
        }
      }
    }

    async _loadActivity() {
      const card = this._createCard('Activity', []);
      this.contentGrid.appendChild(card);

      try {
        const presenceData = await RoSuite.API_Client.getUserPresence([parseInt(this.userId)]);

        if (presenceData && presenceData.userPresences && presenceData.userPresences.length > 0) {
          const presence = presenceData.userPresences[0];

          let statusText = 'Offline';
          let statusClass = 'rs-status-offline';
          let extraInfo = '';

          switch (presence.userPresenceType) {
            case 0:
              statusText = 'Offline';
              statusClass = 'rs-status-offline';
              if (presence.lastOnline) {
                extraInfo = `Last seen: ${RoSuite.DOM.timeAgo(presence.lastOnline)}`;
              }
              break;
            case 1:
              statusText = 'Online (Website)';
              statusClass = 'rs-status-online';
              break;
            case 2:
              statusText = 'In Game';
              statusClass = 'rs-status-ingame';
              if (presence.lastLocation) {
                extraInfo = `Playing: ${presence.lastLocation}`;
              }
              break;
            case 3:
              statusText = 'In Studio';
              statusClass = 'rs-status-online';
              break;
          }

          let html = `<div class="rs-stat-value"><span class="rs-status-dot ${statusClass}"></span> ${statusText}</div>`;
          if (extraInfo) {
            html += `<div class="rs-stat-label">${extraInfo}</div>`;
          }

          if (presence.placeId && presence.userPresenceType === 2) {
            html += `<div class="rs-activity-actions">
              <a href="https://www.roblox.com/games/${presence.placeId}" target="_blank" class="rs-btn rs-btn-sm">View Game</a>
            </div>`;
          }

          card.querySelector('.rs-card-body').innerHTML = html;
        } else {
          card.querySelector('.rs-card-body').innerHTML = `
            <div class="rs-stat-value"><span class="rs-status-dot rs-status-offline"></span> Unknown</div>
          `;
        }
      } catch (e) {
        card.querySelector('.rs-card-body').innerHTML = `
          <div class="rs-stat-value rs-text-muted">Unavailable</div>
        `;
      }
    }

    async _loadMutualFriends() {
      try {
        const [myFriends, theirFriends] = await Promise.all([
          RoSuite.API_Client.getUserFriends(this.loggedInUserId),
          RoSuite.API_Client.getUserFriends(this.userId),
        ]);

        if (!myFriends?.data || !theirFriends?.data) return;

        const myFriendIds = new Set(myFriends.data.map(f => String(f.id)));
        const mutual = theirFriends.data.filter(f => myFriendIds.has(String(f.id)));

        if (mutual.length > 0) {
          const card = this._createCard(`Mutual Friends (${mutual.length})`, []);
          const body = card.querySelector('.rs-card-body');

          const avatarRow = RoSuite.DOM.createElement('div', {
            classes: ['rs-mutual-friends'],
          });

          // Show up to 8 mutual friends
          const shown = mutual.slice(0, 8);
          const thumbIds = shown.map(f => f.id).join(',');

          try {
            const thumbData = await RoSuite.API_Client.getAvatarHeadshots(thumbIds, '48x48');
            const thumbMap = {};
            if (thumbData?.data) {
              thumbData.data.forEach(t => { thumbMap[t.targetId] = t.imageUrl; });
            }

            shown.forEach(friend => {
              const avatar = RoSuite.DOM.createElement('a', {
                classes: ['rs-mutual-avatar'],
                attrs: {
                  href: `https://www.roblox.com/users/${friend.id}/profile`,
                  target: '_blank',
                  title: friend.name,
                },
                children: [
                  RoSuite.DOM.createElement('img', {
                    attrs: {
                      src: thumbMap[friend.id] || '',
                      alt: friend.name,
                    },
                  }),
                ],
              });
              avatarRow.appendChild(avatar);
            });
          } catch {
            shown.forEach(friend => {
              avatarRow.appendChild(
                RoSuite.DOM.createElement('span', {
                  classes: ['rs-mutual-name'],
                  text: friend.name,
                })
              );
            });
          }

          if (mutual.length > 8) {
            avatarRow.appendChild(
              RoSuite.DOM.createElement('span', {
                classes: ['rs-mutual-more'],
                text: `+${mutual.length - 8} more`,
              })
            );
          }

          body.appendChild(avatarRow);
          this.contentGrid.appendChild(card);
        }
      } catch (e) {
        RoSuite.DOM.logError('Profile: Failed to load mutual friends:', e);
      }
    }

    _createCard(title, contentLines) {
      const card = RoSuite.DOM.createElement('div', {
        classes: ['rs-profile-card'],
        children: [
          RoSuite.DOM.createElement('div', {
            classes: ['rs-card-title'],
            text: title,
          }),
          RoSuite.DOM.createElement('div', {
            classes: ['rs-card-body'],
            html: contentLines.join('') || '<div class="rs-loading-text">Loading...</div>',
          }),
        ],
      });
      return card;
    }

    _createQuickActions() {
      const actions = RoSuite.DOM.createElement('div', {
        classes: ['rs-quick-actions'],
      });

      // Copy Profile Link
      actions.appendChild(
        RoSuite.DOM.createElement('button', {
          classes: ['rs-btn', 'rs-btn-sm'],
          text: 'Copy Profile Link',
          events: {
            click: (e) => {
              navigator.clipboard.writeText(window.location.href);
              e.target.textContent = 'Copied!';
              setTimeout(() => { e.target.textContent = 'Copy Profile Link'; }, 2000);
            },
          },
        })
      );

      // Copy User ID
      actions.appendChild(
        RoSuite.DOM.createElement('button', {
          classes: ['rs-btn', 'rs-btn-sm'],
          text: 'Copy User ID',
          events: {
            click: (e) => {
              navigator.clipboard.writeText(this.userId);
              e.target.textContent = 'Copied!';
              setTimeout(() => { e.target.textContent = 'Copy User ID'; }, 2000);
            },
          },
        })
      );

      // View Inventory
      actions.appendChild(
        RoSuite.DOM.createElement('a', {
          classes: ['rs-btn', 'rs-btn-sm'],
          attrs: {
            href: `https://www.roblox.com/users/${this.userId}/inventory`,
            target: '_blank',
          },
          text: 'View Inventory',
        })
      );

      return actions;
    }
  }

  RoSuite.ProfileEnhance = ProfileEnhance;
})();
