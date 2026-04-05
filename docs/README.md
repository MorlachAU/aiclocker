# AIClocker

A Windows system tray app that tracks your AI coding tool usage — tokens, API-equivalent cost, time, and model breakdown. Ships with built-in support for **Claude Code** and **Claude Co-Work**, and has a plugin architecture for adding more tools.

**Current version:** 1.1.1
**Platform:** Windows 11 (Electron 35)
**Author:** Ben Kirtland

---

## What it does

Parses the JSONL conversation logs that Claude Code and Co-Work write locally, stores them in SQLite, and shows real-time stats in a system tray icon plus a detailed dashboard.

### What it tracks
- **Every message** sent/received in supported tools
- **Token counts:** input, output, cache write, cache read
- **API-equivalent cost** (what the usage *would* cost at Anthropic's API rates)
- **Model breakdown** (Opus / Sonnet / Haiku)
- **Provider breakdown** (Claude Code vs Co-Work vs future tools)
- **Active vs idle time** (messages within 5 minutes of each other = active)
- **Per-session breakdown** with titles, duration, cost
- **Tool usage frequency**

### What it does NOT track
- **Claude Chat** in the Desktop app or on claude.ai — Anthropic doesn't expose that data locally
- **GitHub Copilot, Cursor, Windsurf, Aider, etc.** — investigated, none store trackable local usage data on this machine
- **Passive app-open time** — idle time is excluded by design

---

## Important: "API Equivalent" is not real cost

The costs shown are labeled **API Equivalent**, meaning what the usage *would* cost if billed per-token at Anthropic's public API rates. **This is not what you actually pay.**

On a Claude Max plan ($200/month), real cost is flat. The API-equivalent number measures the *value* you're getting from your plan — e.g., seeing $1,300 of API-equivalent usage in a week shows your Max plan is paying for itself many times over.

---

## Install

### Option A — run from source (dev)
```
cd E:\Dev\aiclocker
npm install
npm start
```

### Option B — build and install (recommended)
```
cd E:\Dev\aiclocker
node scripts/make-cert.js                # one-time: generate self-signed cert
node scripts/make-icon.js                # one-time: generate clock icon
set CSC_LINK=certs\aiclocker.pfx
set CSC_KEY_PASSWORD=<contents of certs\password.txt>
npm run build
```

Each build produces **two** signed artifacts in the output directory:

| File | Type | Use when |
|---|---|---|
| `AIClocker-Setup-1.1.0.exe` | NSIS installer | You want a proper install with Start Menu shortcut, auto-updates, uninstaller |
| `AIClocker-Portable-1.1.0.exe` | Portable exe | You want a single exe with zero footprint — stores data in a folder next to itself, no registry writes, no `%APPDATA%` leftovers |

Double-click either to run. Because the cert is self-signed, Windows SmartScreen will show "Unknown publisher" on first run — click "More info → Run anyway", or import `certs/aiclocker.cer` into Trusted Root Certification Authorities to eliminate the warning.

See [INSTALL.md](INSTALL.md) for more detail on both flavors.

---

## Tray menu

A purple clock icon appears in the system tray. Right-click to see:

- Current session title and model
- Active/Idle status
- Today's API-equivalent cost, tokens, and active time
- This week's cost, tokens, and active time
- Breakdown by model (Opus / Sonnet / Haiku)
- Breakdown by tool/provider (when more than one has activity)
- **Open Dashboard** — launches the full charts view
- **Start with Windows** — checkbox toggle (persists across restarts)
- **Quit**

---

## Dashboard

Opens in a BrowserWindow when you click "Open Dashboard":

- **Summary cards** — cost, tokens, active time, session count, message count
- **Daily API-equivalent bar chart**
- **Model usage doughnut** — Opus vs Sonnet vs Haiku
- **Token type stacked bar** — input / output / cache write / cache read per day
- **Top tools** — horizontal bar chart of most-used tools (Bash, Edit, Read, etc.)
- **Session table** — title, date, duration, messages, tokens, cost
- **Date range picker** — Today / Week / Month / All Time

---

## Where data lives

- **Dev mode (npm start):** `<projectRoot>/data/usage.db`
- **Installed app:** `%APPDATA%\AIClocker\data\usage.db`

On first launch of the installed app, AIClocker migrates any existing database from the old dev location automatically.

### Data sources

| Source | Path | Provider |
|---|---|---|
| Claude Code conversations | `%USERPROFILE%\.claude\projects\*\*.jsonl` | `claude-code` |
| Claude Code subagents | `%USERPROFILE%\.claude\projects\*\*\subagents\*.jsonl` | `claude-code` |
| Claude Code process registry | `%USERPROFILE%\.claude\sessions\*.json` | `claude-code` |
| Claude Code desktop snapshots | `%APPDATA%\Claude\claude-code-sessions\**\*.json` | `claude-code` |
| Co-Work conversations | `%APPDATA%\Claude\local-agent-mode-sessions\**\*.jsonl` | `cowork` |

---

## Adding a new AI tool

See [PROVIDERS.md](PROVIDERS.md). Short version:

1. Copy `src/providers/_template.js` to `src/providers/your-tool.js`
2. Fill in the methods (`discoverFiles`, `normalizeRecord`, `discoverSessions`, `getWatchPaths`)
3. Register in `src/providers/index.js`
4. Add pricing for any new models in `src/pricing.js`

That's it — no changes to ingest, stats, tray, dashboard, or database schema needed.

---

## Project structure

```
E:\Dev\aiclocker\
├── main.js                 # Electron entry point
├── icon.png, icon.ico      # App icons
├── package.json            # Includes electron-builder config
├── src/
│   ├── db.js               # SQLite + schema migrations + data dir resolution
│   ├── parser.js           # JSONL line parser (provider-normalized)
│   ├── pricing.js          # Model pricing + cost calculation
│   ├── ingest.js           # Incremental file ingestion
│   ├── session-resolver.js # Cross-references session metadata from providers
│   ├── stats.js            # SQL query helpers with optional provider filter
│   ├── watcher.js          # File monitoring + idle detection
│   ├── tray.js             # Tray icon + context menu
│   ├── settings.js         # User preferences (JSON)
│   ├── preload.js          # Dashboard IPC bridge
│   └── providers/
│       ├── provider-base.js  # Abstract Provider class
│       ├── index.js          # Provider registry
│       ├── claude-code.js    # Claude Code provider
│       ├── cowork.js         # Claude Co-Work provider
│       └── _template.js      # Template for adding new providers
├── dashboard/
│   ├── index.html          # Dashboard UI
│   ├── style.css
│   ├── dashboard.js        # Frontend logic
│   └── chart.min.js        # Chart.js (vendored)
├── scripts/
│   ├── make-icon.js        # Generate clock icon PNG + ICO
│   └── make-cert.js        # Generate self-signed code-signing cert
├── certs/                  # (gitignored) signing cert + password
├── data/                   # (gitignored) dev DB
├── release/                # (gitignored) electron-builder output
└── docs/
    ├── README.md           # This file
    ├── CHANGELOG.md        # Version history
    ├── ARCHITECTURE.md     # Technical deep-dive
    ├── INSTALL.md          # End-user install guide
    └── PROVIDERS.md        # How to add a new provider
```

---

## Known limitations

1. **No Claude Chat tracking** — Anthropic doesn't expose chat token data to subscribers
2. **Active time is estimated** — based on message-timestamp gaps, not actual focus
3. **Pricing must be updated manually** — edit `src/pricing.js` when rates change
4. **Self-signed cert triggers SmartScreen** — expected for any non-commercial cert
5. **First cold launch is ~10-15s** — 500+ MB of JSONL to parse. Subsequent launches are sub-second via byte-offset incremental ingest.
