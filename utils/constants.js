/**
 * RoSuite Constants
 */
const RoSuite = window.RoSuite || {};

RoSuite.VERSION = '1.0.0';
RoSuite.DEBUG = false;

RoSuite.API = {
  BASE: {
    GAMES: 'https://games.roblox.com',
    USERS: 'https://users.roblox.com',
    THUMBNAILS: 'https://thumbnails.roblox.com',
    FRIENDS: 'https://friends.roblox.com',
    INVENTORY: 'https://inventory.roblox.com',
    TRADES: 'https://trades.roblox.com',
    CATALOG: 'https://catalog.roblox.com',
    ECONOMY: 'https://economy.roblox.com',
    PRESENCE: 'https://presence.roblox.com',
  },

  ENDPOINTS: {
    GAME_SERVERS: '/v1/games/{placeId}/servers/Public',
    GAME_DETAILS: '/v1/games',
    GAME_VOTES: '/v1/games/votes',
    USER_INFO: '/v1/users/{userId}',
    USERNAMES_LOOKUP: '/v1/usernames/users',
    USER_PRESENCE: '/v1/presence/users',
    AVATAR_HEADSHOT: '/v1/users/avatar-headshot',
    USER_FRIENDS: '/v1/users/{userId}/friends',
    USER_COLLECTIBLES: '/v1/users/{userId}/assets/collectibles',
    TRADES_LIST: '/v1/trades/{tradeType}',
    CATALOG_DETAILS: '/v1/catalog/items/details',
    USER_CURRENCY: '/v1/users/{userId}/currency',
  },
};

RoSuite.CACHE_TTL = {
  SERVER_LIST: 30 * 1000,
  USER_PROFILE: 5 * 60 * 1000,
  GAME_DETAILS: 60 * 60 * 1000,
  THUMBNAILS: 10 * 60 * 1000,
  FRIENDS: 5 * 60 * 1000,
  DEFAULT: 30 * 1000,
};

RoSuite.RATE_LIMIT = {
  MAX_REQUESTS_PER_SECOND: 5,
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 30000,
};

RoSuite.DEFAULTS = {
  serverBrowser: true,
  playerInfo: true,
  profileEnhance: true,
  tradeCalc: true,
  gameStats: true,
  cacheDuration: 30,
  serverBrowserSort: 'players-high',
  serverBrowserAutoRefresh: 30,
  serverBrowserShowPlayers: false,
  serverBrowserHideFull: false,
  serverBrowserHideEmpty: false,
  profileShowRAP: true,
  profileShowAge: true,
  profileShowActivity: true,
  theme: 'auto',
};

RoSuite.CACHE_MAX_SIZE = 4 * 1024 * 1024; // 4MB

window.RoSuite = RoSuite;
