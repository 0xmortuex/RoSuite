// Run: node --test tests/
// The pure parts of RoSuite 1.2.0: where a server is, which one to join,
// what items are worth, and how long you have played.
const test = require('node:test');
const assert = require('node:assert/strict');
const Region = require('../utils/region.js');
const Values = require('../utils/values.js');
const Playtime = require('../utils/playtime.js');

test('a server address comes from the join answer, never an internal one', () => {
  assert.equal(Region.addressFrom({ joinScript: { UdmuxEndpoints: [{ Address: '128.116.99.3' }], MachineAddress: '10.0.0.5' } }), '128.116.99.3');
  assert.equal(Region.addressFrom({ joinScript: { MachineAddress: '128.116.50.1' } }), '128.116.50.1');
  assert.equal(Region.addressFrom({ joinScript: { MachineAddress: '10.1.2.3' } }), null);
  assert.equal(Region.addressFrom({ status: 6 }), null);
  assert.equal(Region.isPrivate('192.168.1.2'), true);
  assert.equal(Region.isPrivate('172.20.0.1'), true);
  assert.equal(Region.isPrivate('172.32.0.1'), false);
});

test('distance and label', () => {
  const istanbul = { latitude: 41.0, longitude: 29.0 }, frankfurt = { latitude: 50.11, longitude: 8.68, city: 'Frankfurt am Main', country_code: 'DE' };
  const km = Region.distanceKm(istanbul, frankfurt);
  assert.ok(km > 1800 && km < 1900, 'Istanbul-Frankfurt is about 1,860 km, got ' + km);
  assert.equal(Region.label(frankfurt), 'Frankfurt am Main, DE');
  assert.equal(Region.distanceKm(null, frankfurt), null);
});

test('a small server has somebody in it and room for you', () => {
  const servers = [{ id: 'a', playing: 0, maxPlayers: 30 }, { id: 'b', playing: 30, maxPlayers: 30 }, { id: 'c', playing: 4, maxPlayers: 30 }, { id: 'd', playing: 2, maxPlayers: 30 }];
  assert.equal(Region.smallServer(servers).id, 'd');
  assert.equal(Region.smallServer([{ playing: 30, maxPlayers: 30 }]), null);
  assert.equal(Region.smallServer(null), null);
});

test('Rolimons rows: value when there is one, RAP when not, and projected', () => {
  const table = {
    1029025: ['The Classic ROBLOX Fedora', 'CF', 370459, 430000, 430000, 4, 2, -1, -1, -1, 1],
    1037673: ["Jester's Cap", '', 21653, -1, 21653, -1, -1, 1, -1, -1, 1],
  };
  const fedora = Values.parse(table[1029025]);
  assert.equal(fedora.worth, 430000);
  assert.equal(fedora.demand, 'Amazing');
  assert.equal(Values.parse(table[1037673]).projected, true);
  const side = Values.side([{ id: 1029025, rap: 370459 }, { id: 1037673, rap: 21653 }, { id: 999, rap: 50 }], table);
  assert.deepEqual(side, { worth: 430000 + 21653 + 50, rap: 370459 + 21653 + 50, projected: 1 });
  assert.deepEqual(Values.side([{ id: 1, rap: 100 }], null), { worth: 100, rap: 100, projected: 0 });
  assert.equal(Values.verdict(1000, 1030).label, 'Fair');
  assert.equal(Values.verdict(1000, 1500).label, 'You win');
  assert.equal(Values.verdict(1000, 500).label, 'You lose');
});

test('playtime adds two minutes a tick, and a gap starts a new session', () => {
  const inGame = { userPresenceType: 2, universeId: 1686885941, rootPlaceId: 4924922222, lastLocation: 'Brookhaven RP' };
  let s = Playtime.empty();
  const t0 = Date.UTC(2026, 8, 27, 12);
  s = Playtime.record(s, inGame, t0);
  s = Playtime.record(s, inGame, t0 + 2 * 60000);
  s = Playtime.record(s, { userPresenceType: 1 }, t0 + 4 * 60000);    // on the website: nothing
  s = Playtime.record(s, inGame, t0 + 60 * 60000);                    // an hour later: new session
  const g = Playtime.forPlace(s, 4924922222, null);
  assert.equal(g.minutes, 6);
  assert.equal(g.sessions, 2);
  assert.equal(g.name, 'Brookhaven RP');
  assert.equal(Playtime.list(s)[0].universeId, '1686885941');
  assert.equal(Playtime.format(200), '3 h 20 min');
  assert.equal(Playtime.format(45), '45 min');
});
