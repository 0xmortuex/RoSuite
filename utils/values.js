/**
 * RoSuite Values — what limited items are worth, from Rolimons.
 *
 * Roblox's own RAP (recent average price) is easy to push up with a few
 * rigged sales, which is exactly what traders watch for. Rolimons publishes
 * a curated value per item and flags "projected" ones (RAP pushed above what
 * the item is really worth). It is an outside site, so the trade calculator
 * only uses it when "Rolimons values" is switched on in RoSuite's options;
 * the download itself happens in the background worker (Rolimons only
 * answers pages on rolimons.com).
 *
 * A Rolimons row: [name, acronym, rap, value, default_value, demand, trend,
 * projected, hyped, rare, ...], with -1 meaning "none".
 */
(function (root) {
  'use strict';

  const DEMAND = { 0: 'Terrible', 1: 'Low', 2: 'Normal', 3: 'High', 4: 'Amazing' };

  const Values = {
    // One item, or null when Rolimons does not list it.
    parse(row) {
      if (!Array.isArray(row)) return null;
      const n = (v) => (typeof v === 'number' && v >= 0 ? v : null);
      const rap = n(row[2]);
      const value = n(row[3]);
      return {
        name: String(row[0] || ''),
        acronym: String(row[1] || ''),
        rap,
        value,                                   // null: no value set, RAP is what it is worth
        worth: value != null ? value : (n(row[4]) != null ? n(row[4]) : rap),
        demand: DEMAND[row[5]] || null,
        projected: row[7] === 1,
        hyped: row[8] === 1,
        rare: row[9] === 1,
      };
    },

    // Sum a side of a trade. items: [{ id, rap? }]; table: Rolimons items map.
    side(items, table) {
      let worth = 0, rap = 0, projected = 0;
      for (const it of items || []) {
        const v = table ? this.parse(table[String(it.id)]) : null;
        const itemRap = v && v.rap != null ? v.rap : (it.rap || 0);
        rap += itemRap;
        worth += v ? v.worth || 0 : itemRap;
        if (v && v.projected) projected++;
      }
      return { worth, rap, projected };
    },

    // "Fair" / "You win" / "You lose", from worth given against worth got.
    verdict(give, get) {
      if (!give && !get) return { label: 'Nothing to compare', tone: 'neutral' };
      const diff = get - give;
      const pct = give ? diff / give : 1;
      if (Math.abs(pct) <= 0.05) return { label: 'Fair', tone: 'fair', pct };
      return diff > 0 ? { label: 'You win', tone: 'win', pct } : { label: 'You lose', tone: 'loss', pct };
    },

    // In the page: the whole table from the background worker (cached there).
    fetchTable() {
      return new Promise((resolve) => {
        try { chrome.runtime.sendMessage({ type: 'GET_ITEM_VALUES' }, (r) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (r || { ok: false }))); }
        catch (e) { resolve({ ok: false, error: e.message }); }
      });
    },
  };

  root.RoSuite = root.RoSuite || {};
  root.RoSuite.Values = Values;
  if (typeof module !== 'undefined' && module.exports) module.exports = Values;
})(typeof window !== 'undefined' ? window : globalThis);
