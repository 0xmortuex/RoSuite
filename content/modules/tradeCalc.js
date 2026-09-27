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
      RoSuite.Motion.animateIn(this.container);

      // Load recent trades
      await this._loadTrades();
    }

    _showLoadingSkeleton() {
      this.tradeList.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        this.tradeList.appendChild(
          RoSuite.DOM.createElement('div', {
            classes: ['rs-trade-card', 'rs-skeleton'],
            style: { height: '56px', marginBottom: '8px' },
          })
        );
      }
    }

    async _loadTrades() {
      this._showLoadingSkeleton();

      // Rolimons values when switched on (RoSuite.Values); RAP otherwise.
      const table = await RoSuite.Values.fetchTable();
      this.valueTable = table && table.ok ? table.items : null;

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
              const card = this._createTradeCard(trade);
              sectionEl.appendChild(card);
              // The list has no items; each trade's own details do.
              if (!trade.offers) this._fillTradeDetails(card, trade);
            });

            this.tradeList.appendChild(sectionEl);
          }
        }

        if (!hasAny) {
          this.tradeList.innerHTML = '<div class="rs-loading-text">No active trades found</div>';
        } else {
          RoSuite.Motion.staggerIn(this.tradeList.querySelectorAll('.rs-trade-card'));
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
      if (trade.offers && trade.offers.length >= 2) card.appendChild(this._breakdown(trade));

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

    // Your side is the offer whose user is you, not whichever comes first.
    _sides(trade) {
      const me = String(RoSuite.DOM.getLoggedInUserId() || '');
      const offers = trade.offers || [];
      const mine = offers.find(o => o.user && String(o.user.id) === me) || offers[0];
      const theirs = offers.find(o => o !== mine) || offers[1];
      return { mine, theirs };
    }

    _breakdown(trade) {
      const { mine, theirs } = this._sides(trade);
      const myValue = this._calculateOfferRAP(mine);
      const theirValue = this._calculateOfferRAP(theirs);
      return RoSuite.DOM.createElement('div', {
        classes: ['rs-trade-breakdown'],
        children: [
          this._createOfferSummary('Your Side', myValue, mine),
          this._createFairnessIndicator(myValue, theirValue),
          this._createOfferSummary('Their Side', theirValue, theirs),
        ],
      });
    }

    async _fillTradeDetails(card, trade) {
      try {
        const full = await RoSuite.API_Client.getTradeDetails(trade.id);
        if (!full || !full.offers || full.offers.length < 2) return;
        trade.offers = full.offers;
        const btn = card.querySelector('.rs-btn');
        card.insertBefore(this._breakdown(trade), btn || null);
      } catch (e) {
        RoSuite.DOM.logError('TradeCalc: could not load trade ' + trade.id + ':', e);
      }
    }

    // An offer's worth: Rolimons value per item when switched on (RAP when an
    // item has no value there), RAP otherwise; Robux counts at face value.
    _calculateOfferRAP(offer) {
      if (!offer || !offer.userAssets) return (offer && offer.robux) || 0;
      const items = offer.userAssets.map(item => ({ id: item.assetId, rap: item.recentAveragePrice || 0 }));
      return RoSuite.Values.side(items, this.valueTable).worth + (offer.robux || 0);
    }

    _projectedIn(offer) {
      if (!this.valueTable || !offer || !offer.userAssets) return 0;
      const items = offer.userAssets.map(item => ({ id: item.assetId, rap: item.recentAveragePrice || 0 }));
      return RoSuite.Values.side(items, this.valueTable).projected;
    }

    _createOfferSummary(label, totalRAP, offer) {
      const itemCount = offer && offer.userAssets ? offer.userAssets.length : 0;
      const robux = offer ? (offer.robux || 0) : 0;

      const valueEl = RoSuite.DOM.createElement('div', {
        classes: ['rs-offer-value'],
        text: 'R$ 0',
      });

      const summary = RoSuite.DOM.createElement('div', {
        classes: ['rs-offer-summary'],
        children: [
          RoSuite.DOM.createElement('div', {
            classes: ['rs-offer-label'],
            text: label,
          }),
          valueEl,
          RoSuite.DOM.createElement('div', {
            classes: ['rs-offer-detail'],
            text: `${itemCount} items${robux > 0 ? ` + R$ ${RoSuite.DOM.formatNumber(robux)}` : ''}` + (this.valueTable ? ' · Rolimons value' : ' · RAP'),
          }),
        ],
      });
      const projected = this._projectedIn(offer);
      if (projected) {
        summary.appendChild(RoSuite.DOM.createElement('div', {
          classes: ['rs-offer-projected'],
          text: `${projected} projected item${projected === 1 ? '' : 's'} (RAP pushed above worth)`,
        }));
      }

      RoSuite.Motion.countUp(valueEl, totalRAP, {
        prefix: 'R$ ',
        format: (n) => RoSuite.DOM.formatNumber(Math.round(n)),
      });

      return summary;
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
              // item.name is a Roblox catalog item name — attacker-influenceable,
              // so build this with textContent rather than innerHTML.
              const itemEl = RoSuite.DOM.createElement('div', {
                classes: ['rs-trade-item'],
                children: [
                  RoSuite.DOM.createElement('span', {
                    classes: ['rs-trade-item-name'],
                    text: item.name || 'Unknown Item',
                  }),
                  RoSuite.DOM.createElement('span', {
                    classes: ['rs-trade-item-rap'],
                    text: (() => {
                      const v = this.valueTable ? RoSuite.Values.parse(this.valueTable[String(item.assetId)]) : null;
                      const rap = `RAP: R$ ${RoSuite.DOM.formatNumber(item.recentAveragePrice || 0)}`;
                      if (!v) return rap;
                      return (v.value != null ? `Value: R$ ${RoSuite.DOM.formatNumber(v.value)} · ` : '') + rap + (v.projected ? ' · Projected' : '') + (v.demand ? ' · Demand: ' + v.demand : '');
                    })(),
                  }),
                ],
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
