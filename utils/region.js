/**
 * RoSuite Region — where a server is, and which one to join.
 *
 * The old per-server "Est. Ping" timed a web request to Roblox's join API,
 * which says nothing about where the GAME server is. Where it is comes from
 * the join API's answer: the address Roblox would connect you to. That
 * address is placed with a public IP-location lookup (ipwho.is), which is an
 * outside site, so it only happens when "Server regions" is switched on in
 * RoSuite's options. The lookup itself runs in the background worker.
 */
(function (root) {
  'use strict';

  const Region = {
    // 10.x, 172.16-31.x, 192.168.x, 127.x: an address inside Roblox's own
    // network (joinScript.MachineAddress often is), useless for a location.
    isPrivate(ip) {
      const m = String(ip || '').match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return true;
      const a = +m[1], b = +m[2];
      return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
    },

    // The public address from a join-game-instance answer, or null.
    addressFrom(answer) {
      const js = answer && answer.joinScript;
      if (!js) return null;
      const udmux = Array.isArray(js.UdmuxEndpoints) && js.UdmuxEndpoints.length ? js.UdmuxEndpoints[0].Address : null;
      if (udmux && !this.isPrivate(udmux)) return udmux;
      if (js.MachineAddress && !this.isPrivate(js.MachineAddress)) return js.MachineAddress;
      return null;
    },

    // Great-circle distance in km between two {latitude, longitude}.
    distanceKm(a, b) {
      if (!a || !b || !isFinite(a.latitude) || !isFinite(b.latitude)) return null;
      const r = (d) => d * Math.PI / 180;
      const dLat = r(b.latitude - a.latitude), dLon = r(b.longitude - a.longitude);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLon / 2) ** 2;
      return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
    },

    // "Frankfurt, DE".
    label(loc) {
      if (!loc) return '';
      return [loc.city, loc.country_code].filter(Boolean).join(', ') || loc.country || '';
    },

    // The emptiest server that still has somebody in it and room for you.
    smallServer(servers) {
      const ok = (servers || []).filter(s => (s.playing || 0) >= 1 && (s.playing || 0) < (s.maxPlayers || 0));
      ok.sort((a, b) => (a.playing || 0) - (b.playing || 0));
      return ok[0] || null;
    },

    // ---- in the page -----------------------------------------------------
    _cache: new Map(),

    _ask(message) {
      return new Promise((resolve) => {
        try { chrome.runtime.sendMessage(message, (r) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (r || { ok: false }))); }
        catch (e) { resolve({ ok: false, error: e.message }); }
      });
    },

    myLocation() { return this._ask({ type: 'LOCATE_IP', ip: '' }); },

    // { ok, location, address } for one server, or { ok:false, error }.
    async serverLocation(placeId, gameId) {
      const key = placeId + ':' + gameId;
      if (this._cache.has(key)) return this._cache.get(key);
      let answer;
      try { answer = await RoSuite.API_Client.joinGameInstance(placeId, gameId); }
      catch (e) { return { ok: false, error: /40[13]/.test(e.message) ? 'Sign in to Roblox to see server regions' : 'Roblox did not answer' }; }
      const address = this.addressFrom(answer);
      if (!address) return { ok: false, error: answer && answer.status === 6 ? 'Server is full' : 'No address for this server' };
      const r = await this._ask({ type: 'LOCATE_IP', ip: address });
      const out = r && r.ok ? { ok: true, location: r.location, address } : { ok: false, error: (r && r.error) || 'Could not place it' };
      if (out.ok) this._cache.set(key, out);
      return out;
    },
  };

  root.RoSuite = root.RoSuite || {};
  root.RoSuite.Region = Region;
  if (typeof module !== 'undefined' && module.exports) module.exports = Region;
})(typeof window !== 'undefined' ? window : globalThis);
