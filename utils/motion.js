/**
 * RoSuite Motion — lightweight, accessible animation helpers for RoSuite's
 * own injected UI. Never touches Roblox's native elements.
 *
 * Rules this module follows:
 *  - transform/opacity only (no layout-triggering properties animated)
 *  - requestAnimationFrame for anything JS-driven; never setInterval
 *  - every effect is gated behind `prefers-reduced-motion`
 *  - idempotent: safe to call repeatedly across SPA route changes
 *    without re-animating or double-injecting
 */
RoSuite.Motion = {
  _query: null,
  _reduced: false,
  _animatedEls: new WeakSet(),

  init() {
    if (this._query) return;
    try {
      this._query = window.matchMedia('(prefers-reduced-motion: reduce)');
      this._reduced = this._query.matches;
      const handler = (e) => { this._reduced = e.matches; };
      if (this._query.addEventListener) {
        this._query.addEventListener('change', handler);
      } else if (this._query.addListener) {
        // Older Safari
        this._query.addListener(handler);
      }
    } catch (e) {
      this._reduced = false;
    }
  },

  get reduced() {
    if (!this._query) this.init();
    return this._reduced;
  },

  /**
   * Fade + slide an element in. Idempotent per-element — calling this
   * again on the same node (e.g. because a module re-ran) is a no-op,
   * which is what keeps SPA route changes from re-triggering or
   * double-animating injected panels.
   */
  animateIn(el, { delay = 0 } = {}) {
    if (!el || this._animatedEls.has(el)) return;
    this._animatedEls.add(el);

    if (this.reduced) return;

    el.classList.add('rs-anim-enter');
    el.style.transitionDelay = `${delay}ms`;

    // Double rAF: let the browser paint the "hidden" starting state on
    // its own frame before we flip to the visible state, otherwise the
    // transition can get coalesced away and just snap in.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('rs-anim-enter-active');
        const cleanup = () => {
          el.classList.remove('rs-anim-enter', 'rs-anim-enter-active');
          el.style.transitionDelay = '';
          el.removeEventListener('transitionend', cleanup);
        };
        el.addEventListener('transitionend', cleanup, { once: true });
      });
    });
  },

  /**
   * Animate a list/collection of elements in with a staggered delay.
   * Capped so long lists (e.g. 100 servers) don't queue an absurd delay.
   */
  staggerIn(els, { stagger = 40, maxStagger = 10 } = {}) {
    Array.from(els).forEach((el, i) => {
      this.animateIn(el, { delay: Math.min(i, maxStagger) * stagger });
    });
  },

  /**
   * Count a number up to `target` via requestAnimationFrame (never
   * setInterval). Used for RAP/account-value style stat reveals.
   * Falls back to setting the final value instantly under reduced motion.
   */
  countUp(el, target, options = {}) {
    if (!el) return;
    const {
      duration = 700,
      format = (n) => Math.round(n).toLocaleString(),
      prefix = '',
      suffix = '',
    } = options;

    const numericTarget = Number(target) || 0;

    if (this.reduced) {
      el.textContent = `${prefix}${format(numericTarget)}${suffix}`;
      return;
    }

    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = `${prefix}${format(numericTarget * eased)}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  },

  /**
   * Trigger a brief, finite glow-pulse (e.g. on a friend badge). Never
   * loops indefinitely — a couple of pulses, then it settles.
   */
  pulse(el) {
    if (!el || this.reduced) return;
    el.classList.remove('rs-anim-pulse');
    void el.offsetWidth; // restart animation if already applied
    el.classList.add('rs-anim-pulse');
  },

  /**
   * Toggle a shimmering skeleton placeholder state on an element. Callers
   * turn this on right before an API call and off in the finally/then
   * once real content lands, so it tracks the actual fetch lifecycle
   * rather than a fixed timer.
   */
  setSkeleton(el, on) {
    if (!el) return;
    el.classList.toggle('rs-skeleton', !!on);
  },
};

RoSuite.Motion.init();
