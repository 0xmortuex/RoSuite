# RoSuite — Free Roblox Enhancement Suite

A free, open-source Chrome/Brave extension that enhances Roblox with a server browser, player info, profile upgrades, trade calculator, and game statistics. The open-source alternative to RoPro.

## Features

### Server Browser
Enhanced server list on game pages with sorting (player count, server age), filtering (player range, hide full/empty), player name search, and a **Join Server** button to connect directly to specific servers.

### Player Info
Detailed player information in server lists including avatar thumbnails, display names, account age badges, online status, and friend highlighting.

### Profile Enhancements
Adds account value (RAP), account age, online activity status, mutual friends, and quick actions (copy profile link, copy user ID, view inventory) to user profile pages.

### Trade Calculator
Value calculator on the trades page showing RAP for each side, fairness indicators (fair/slight win/big loss), and detailed item breakdowns.

### Game Stats
Enhanced statistics panel on game pages with live player/server counts, approval rating bar, server fill distribution chart, and detailed game info cards.

## Installation

1. Clone or download this repository
2. Open Chrome/Brave and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the `rosuite` folder
5. Visit any Roblox page — RoSuite will activate automatically

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
