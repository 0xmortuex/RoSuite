/**
 * RoSuite Playtime — how long you have played each game, kept on this PC.
 *
 * The background worker asks Roblox every two minutes whether you are in a
 * game (your own presence, which only you can see in full). Each time the
 * answer is "in game X", X gets those two minutes. Nothing leaves your
 * browser; switch it off in RoSuite's options and it stops asking.
 */
(function (root) {
  'use strict';

  const STEP_MIN = 2;
  const MAX_RECENT = 20;

  const Playtime = {
    STEP_MIN,

    empty() { return { games: {}, recent: [] }; },

    // Count one tick. presence: a Roblox userPresence; now: ms.
    record(state, presence, now) {
      const s = state && state.games ? state : this.empty();
      if (!presence || presence.userPresenceType !== 2 || !presence.universeId) return s;
      const key = String(presence.universeId);
      const g = s.games[key] || { universeId: key, placeId: presence.rootPlaceId || presence.placeId || null, name: '', minutes: 0, sessions: 0, first: now, last: 0 };
      // A gap of more than two ticks is a new session.
      if (!g.last || now - g.last > STEP_MIN * 2 * 60000 + 30000) g.sessions++;
      g.minutes += STEP_MIN;
      g.last = now;
      if (presence.lastLocation) g.name = String(presence.lastLocation).slice(0, 80);
      if (presence.rootPlaceId || presence.placeId) g.placeId = presence.rootPlaceId || presence.placeId;
      s.games[key] = g;
      s.recent = [key, ...s.recent.filter(k => k !== key)].slice(0, MAX_RECENT);
      return s;
    },

    // "3 h 20 min", "45 min".
    format(minutes) {
      const m = Math.round(minutes || 0);
      if (m < 60) return m + ' min';
      const h = Math.floor(m / 60), r = m % 60;
      return h + ' h' + (r ? ' ' + r + ' min' : '');
    },

    // Most recent first.
    list(state) {
      const s = state && state.games ? state : this.empty();
      return s.recent.map(k => s.games[k]).filter(Boolean);
    },

    forPlace(state, placeId, universeId) {
      const s = state && state.games ? state : this.empty();
      if (universeId && s.games[String(universeId)]) return s.games[String(universeId)];
      return Object.values(s.games).find(g => String(g.placeId) === String(placeId)) || null;
    },
  };

  root.RoSuite = root.RoSuite || {};
  root.RoSuite.Playtime = Playtime;
  if (typeof module !== 'undefined' && module.exports) module.exports = Playtime;
})(typeof window !== 'undefined' ? window : globalThis);
