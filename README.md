# RoSuite — Free Roblox Enhancement Suite

A free, open-source Chrome/Brave extension that enhances Roblox with a server browser, player info, profile upgrades, trade calculator, and game statistics. The open-source alternative to RoPro.

## Features

### Server Browser
Enhanced server list on game pages with sorting (busiest or emptiest first, best connection), filtering (player range, hide full/empty), player name search, and a **Join Server** button to connect directly to specific servers.

### Player Info
Detailed player information in server lists including avatar thumbnails, display names, account age badges, online status, and friend highlighting.

### Server Regions, Friends Here, Small Servers
Where each server is and a Nearest-to-you sort (opt-in), which friends are playing the game with a Join button, and one click into a small server.

### Playtime
How long you have played each game, kept in your browser: recently played in the popup, your time on each game page.

### Profile Enhancements
Adds account value (RAP), account age, online activity status, mutual friends, and quick actions (copy profile link, copy user ID, view inventory) to user profile pages.

### Trade Calculator
Value calculator on the trades page showing RAP for each side, fairness indicators (fair/slight win/big loss), and detailed item breakdowns.

### Game Stats
Enhanced statistics panel on game pages with the live player count, a minimum server count, approval rating bar, how full the busiest servers are, and detailed game info cards.

## Installation

**In Vex:** Settings › Extensions › *Extensions worth installing* › RoSuite › **Install**. Press it again later to update.

**In Chrome or Brave:**
1. Download `RoSuite-<version>.zip` from [Releases](https://github.com/0xmortuex/RoSuite/releases/latest) and unzip it
2. Open `chrome://extensions/` and turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick the unzipped folder
4. Visit any Roblox page — RoSuite activates automatically

## What's new in 1.2.0

- **Server regions** — where each server is ("Frankfurt am Main, DE · 1,860 km") and a **Nearest to you** sort. Replaces the per-server "Est. Ping", which timed a web request and said nothing about where a game server is. Roblox gives the server's address when you're signed in; ipwho.is turns it into a city, so it is **off until you switch it on** in the options.
- **Friends here** — on a game page, which of your friends are playing it right now, with a Join button for each (when their privacy shows the server).
- **Join a small server** — one button into the emptiest server that still has players and room for you.
- **Playtime** — how long you have played each game, counted from your own Roblox status every two minutes and kept in this browser. Recently played is in the popup; your time shows on each game page. Switch it off in the options.
- **Rolimons values in trades** — each item valued by Rolimons instead of RAP, with projected items flagged. Off until you switch it on (it downloads Rolimons' public item list hourly).
- **The trade calculator shows values at all.** Roblox's trade list carries no items, so the breakdown never appeared; each trade's details are now loaded, and your side is found by your user ID rather than assumed first.
- **Signed-in requests work.** Roblox needs a CSRF token on every signed-in POST; without it, Activity, joins and trades failed for anyone signed in.
- Two settings changed in quick succession no longer lose the first one.

Tests: `node --test tests/logic.test.js`

## What's new in 1.1.0

- **Every feature is styled again.** The per-feature stylesheets were added as `<link>`s to extension files, which Manifest V3 refuses unless they are web-accessible, so the server browser, game stats, trade calculator and player info rendered unstyled in every browser. They now load through the manifest.
- **Game Stats shows the real numbers.** It summed one page of 100 servers, emptiest first, and called that the game's total ("100 active players" for a game with half a million). It now shows Roblox's live player count, a minimum server count, and labels the fill chart as the busiest 100 servers. The game's details and votes load again too: the universe ID is looked up from the place when the page no longer carries it.
- **The server browser lists the busiest servers first.** It always fetched the emptiest and re-sorted those, so "High→Low" was a list of one-player servers. "Newest/Oldest First" are gone: they sorted by a random server ID that says nothing about age.
- **Profiles fit Roblox's new profile page.** The panel sits under the header instead of waiting five seconds for elements that no longer exist; Activity shows its status again ("Online", "Offline", "In Game") — the words were being dropped.
- **Ping works.** Calibration used HEAD requests, which Roblox's API refuses cross-origin, so it always read "unavailable".

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Save settings and cache API responses locally |
| `activeTab` | Interact with the current Roblox tab |
| `host_permissions` (roblox.com subdomains) | Make API calls to Roblox's public endpoints |

## API Usage

RoSuite uses Roblox's public APIs only. No data is collected, no external servers are contacted, and no proxy is used. API calls are rate-limited (max 5/second) and cached to minimize requests.

Some features (trades, presence, friend list) use the browser's existing Roblox session cookie — no credentials are stored or transmitted by the extension.

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks or build step)
- Content scripts injected into roblox.com pages
- CSS with `rs-` prefixed classes to avoid conflicts with Roblox's UI

## Project Structure

```
rosuite/
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker
├── content/
│   ├── inject.js              # Main content script
│   ├── modules/               # Feature modules
│   │   ├── serverBrowser.js
│   │   ├── playerInfo.js
│   │   ├── profileEnhance.js
│   │   ├── tradeCalc.js
│   │   └── gameStats.js
│   └── styles/                # Scoped CSS
├── popup/                     # Extension popup UI
├── options/                   # Settings page
├── utils/                     # Shared utilities
│   ├── api.js                 # API wrapper with rate limiting
│   ├── cache.js               # chrome.storage caching layer
│   ├── constants.js           # Configuration constants
│   └── dom.js                 # DOM helpers
└── assets/                    # Extension icons
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test on both `www.roblox.com` and `web.roblox.com`
5. Submit a pull request

## Credits

Built by **0xmortuex**

## License

MIT
