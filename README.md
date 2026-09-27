# RoSuite — Free Roblox Enhancement Suite

A free, open-source Chrome/Brave extension that enhances Roblox with a server browser, player info, profile upgrades, trade calculator, and game statistics. The open-source alternative to RoPro.

## Features

### Server Browser
Enhanced server list on game pages with sorting (busiest or emptiest first, best connection), filtering (player range, hide full/empty), player name search, and a **Join Server** button to connect directly to specific servers.

### Player Info
Detailed player information in server lists including avatar thumbnails, display names, account age badges, online status, and friend highlighting.

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
