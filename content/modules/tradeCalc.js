/**
 * RoSuite Trade Calculator Module
 * Adds value calculations and fairness indicators to the trades page
 */
(function () {
  'use strict';

  class TradeCalc {
    constructor() {
      this.container = null;
      this.observer = null;
    }

    async init() {
      await this._injectUI();
      this._observeTradeChanges();
    }

    destroy() {
      if (this.container) this.container.remove();
      if (this.observer) this.observer.disconnect();
    }

    async _injectUI() {
      let anchor;
      try {
        anchor = await RoSuite.DOM.waitForElement(
          '.trades-container, .content .trade, #trades-page-container',
          5000
        );
      } catch {
        anchor = document.querySelector('.content') || document.body;
      }

      this.container = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-calc'],
        attrs: { 'data-rosuite': 'trade-calc' },
      });

      // Header
      const header = RoSuite.DOM.createElement('div', {
        classes: ['rs-section-header'],
        children: [
          RoSuite.DOM.createElement('span', {
            classes: ['rs-sb-logo'],
            text: 'RS',
          }),
          RoSuite.DOM.createElement('span', { text: 'Trade Calculator' }),
        ],
      });

      this.container.appendChild(header);

      // Trade summary panel
      this.summaryPanel = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-summary'],
      });
      this.container.appendChild(this.summaryPanel);

      // Trade list
      this.tradeList = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-list'],
      });
      this.container.appendChild(this.tradeList);

      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(this.container, anchor);
      }

      // Load recent trades
      await this._loadTrades();
    }

    async _loadTrades() {
      this.tradeList.innerHTML = '<div class="rs-loading-text">Loading trades...</div>';

      try {
        // Try loading inbound trades
        const inbound = await RoSuite.API_Client.getTrades('Inbound');
        const outbound = await RoSuite.API_Client.getTrades('Outbound');
        const completed = await RoSuite.API_Client.getTrades('Completed');

        this.tradeList.innerHTML = '';

        const sections = [
          { title: 'Inbound Trades', data: inbound },
          { title: 'Outbound Trades', data: outbound },
          { title: 'Completed Trades', data: completed },
        ];

        let hasAny = false;

        for (const section of sections) {
          if (section.data && section.data.data && section.data.data.length > 0) {
            hasAny = true;

            const sectionEl = RoSuite.DOM.createElement('div', {
              classes: ['rs-trade-section'],
            });

            sectionEl.appendChild(
              RoSuite.DOM.createElement('h3', {
                classes: ['rs-trade-section-title'],
                text: `${section.title} (${section.data.data.length})`,
              })
            );

            section.data.data.slice(0, 10).forEach(trade => {
              sectionEl.appendChild(this._createTradeCard(trade));
            });

            this.tradeList.appendChild(sectionEl);
          }
        }

        if (!hasAny) {
          this.tradeList.innerHTML = '<div class="rs-loading-text">No active trades found</div>';
        }
      } catch (e) {
        RoSuite.DOM.logError('TradeCalc: Failed to load trades:', e);
        this.tradeList.innerHTML = `
          <div class="rs-sb-error">
            Unable to load trades. You may need to be logged in, or the Trades API may be unavailable.
          </div>
        `;
      }
    }

    _createTradeCard(trade) {
      const card = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-card'],
      });

      // Trade partner info
      const partner = trade.user || {};
      const partnerRow = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-partner'],
        children: [
          RoSuite.DOM.createElement('span', { text: 'Trade with: ' }),
          RoSuite.DOM.createElement('a', {
            attrs: {
              href: `https://www.roblox.com/users/${partner.id || 0}/profile`,
              target: '_blank',
            },
            text: partner.name || partner.displayName || 'Unknown',
          }),
        ],
      });

      // Status
      const statusText = trade.status || 'Unknown';
      const statusEl = RoSuite.DOM.createElement('span', {
        classes: ['rs-trade-status', `rs-trade-status-${statusText.toLowerCase()}`],
        text: statusText,
      });

      // Date
      const dateEl = RoSuite.DOM.createElement('span', {
        classes: ['rs-trade-date'],
        text: trade.created ? RoSuite.DOM.timeAgo(trade.created) : '',
      });

      const topRow = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-top-row'],
        children: [partnerRow, statusEl, dateEl],
      });

      card.appendChild(topRow);

      // If we have offer details, show value breakdown
      if (trade.offers && trade.offers.length >= 2) {
        const myOffer = trade.offers[0];
        const theirOffer = trade.offers[1];

        const myRAP = this._calculateOfferRAP(myOffer);
        const theirRAP = this._calculateOfferRAP(theirOffer);

        const breakdown = RoSuite.DOM.createElement('div', {
          classes: ['rs-trade-breakdown'],
          children: [
            this._createOfferSummary('Your Side', myRAP, myOffer),
            this._createFairnessIndicator(myRAP, theirRAP),
            this._createOfferSummary('Their Side', theirRAP, theirOffer),
          ],
        });

        card.appendChild(breakdown);
      }

      // Analyze button
      card.appendChild(
        RoSuite.DOM.createElement('button', {
          classes: ['rs-btn', 'rs-btn-sm'],
          text: 'View Details',
          events: {
            click: () => this._showTradeDetails(trade),
          },
        })
      );

      return card;
    }

    _calculateOfferRAP(offer) {
      if (!offer || !offer.userAssets) return 0;
      return offer.userAssets.reduce((sum, item) => {
        return sum + (item.recentAveragePrice || 0);
      }, 0) + (offer.robux || 0);
    }

    _createOfferSummary(label, totalRAP, offer) {
      const itemCount = offer && offer.userAssets ? offer.userAssets.length : 0;
      const robux = offer ? (offer.robux || 0) : 0;

      return RoSuite.DOM.createElement('div', {
        classes: ['rs-offer-summary'],
        html: `
          <div class="rs-offer-label">${label}</div>
          <div class="rs-offer-value">R$ ${RoSuite.DOM.formatNumber(totalRAP)}</div>
          <div class="rs-offer-detail">${itemCount} items${robux > 0 ? ` + R$ ${RoSuite.DOM.formatNumber(robux)}` : ''}</div>
        `,
      });
    }

    _createFairnessIndicator(myRAP, theirRAP) {
      const total = myRAP + theirRAP;
      if (total === 0) {
        return RoSuite.DOM.createElement('div', {
          classes: ['rs-fairness', 'rs-fairness-unknown'],
          text: 'N/A',
        });
      }

      const diff = theirRAP - myRAP;
      const percentDiff = Math.abs(diff / Math.max(myRAP, 1)) * 100;

      let label, className;
      if (percentDiff <= 10) {
        label = 'Fair Trade';
        className = 'rs-fairness-fair';
      } else if (percentDiff <= 25) {
        label = diff > 0 ? 'Slight Win' : 'Slight Loss';
        className = 'rs-fairness-slight';
      } else {
        label = diff > 0 ? 'Big Win' : 'Big Loss';
        className = 'rs-fairness-big';
      }

      return RoSuite.DOM.createElement('div', {
        classes: ['rs-fairness', className],
        html: `
          <div class="rs-fairness-label">${label}</div>
          <div class="rs-fairness-percent">${diff > 0 ? '+' : ''}${percentDiff.toFixed(1)}%</div>
        `,
      });
    }

    _showTradeDetails(trade) {
      // Toggle item details visibility
      const card = event.target.closest('.rs-trade-card');
      if (!card) return;

      let details = card.querySelector('.rs-trade-details');
      if (details) {
        details.remove();
        return;
      }

      details = RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-details'],
      });

      if (trade.offers) {
        trade.offers.forEach((offer, idx) => {
          const side = idx === 0 ? 'Your Items' : 'Their Items';
          const sideEl = RoSuite.DOM.createElement('div', {
            classes: ['rs-trade-items-side'],
          });

          sideEl.appendChild(
            RoSuite.DOM.createElement('h4', { text: side })
          );

          if (offer.userAssets && offer.userAssets.length > 0) {
            offer.userAssets.forEach(item => {
              const itemEl = RoSuite.DOM.createElement('div', {
                classes: ['rs-trade-item'],
                html: `
                  <span class="rs-trade-item-name">${item.name || 'Unknown Item'}</span>
                  <span class="rs-trade-item-rap">RAP: R$ ${RoSuite.DOM.formatNumber(item.recentAveragePrice || 0)}</span>
                `,
              });
              sideEl.appendChild(itemEl);
            });
          }

          if (offer.robux > 0) {
            sideEl.appendChild(
              RoSuite.DOM.createElement('div', {
                classes: ['rs-trade-item'],
                text: `+ R$ ${RoSuite.DOM.formatNumber(offer.robux)} Robux`,
              })
            );
          }

          details.appendChild(sideEl);
        });
      }

      card.appendChild(details);
    }

    _observeTradeChanges() {
      // Watch for trade page content changes (SPA navigation within trades)
      this.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            // Check if trade content was updated
            const hasTradeContent = Array.from(mutation.addedNodes).some(
              node => node.nodeType === 1 && (
                node.classList?.contains('trade-row') ||
                node.querySelector?.('.trade-row')
              )
            );
            if (hasTradeContent) {
              this._loadTrades();
              break;
            }
          }
        }
      });

      const target = document.querySelector('.trades-container, .content');
      if (target) {
        this.observer.observe(target, { childList: true, subtree: true });
      }
    }
  }

  RoSuite.TradeCalc = TradeCalc;
})();
