# AIClocker

<p align="center">
  <img src="../dashboard/assets/mousewheel_logo.png" alt="MouseWheel Digital" width="140">
</p>

<p align="center">
  <a href="https://www.mousewheeldigital.com/"><img src="https://img.shields.io/badge/MouseWheel_Digital-Product-00c8a0?style=flat-square" alt="MouseWheel Digital"></a>
  <a href="https://buymeacoffee.com/mousewheeldigital"><img src="https://img.shields.io/badge/Buy_Me_A_Coffee-Support-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee"></a>
  <a href="https://github.com/MorlachAU/aiclocker/releases"><img src="https://img.shields.io/github/v/release/MorlachAU/aiclocker?style=flat-square&color=6e40c9" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

A Windows system tray app that tracks your AI coding tool usage — tokens, API-equivalent cost, time, and model breakdown. Ships with built-in support for **Claude Code** and **Claude Co-Work**, and has a plugin architecture for adding more tools.

> **Before you install:** AIClocker tracks **Claude Code** (the VS Code extension / CLI) and **Claude Co-Work**. It does **not** track chat usage on claude.ai or in the Claude Desktop app — that data lives server-side and Anthropic doesn't expose it. See [What it does NOT track](#what-it-does-not-track) for the full explanation.

**Current version:** 1.2.0
**Platform:** Windows 11 (Electron 35)
**Author:** Ben Kirtland — *A MouseWheel Digital product*

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

> ⚠️ **Heads-up for most users:** AIClocker only tracks **Claude Code** and **Claude Co-Work**. If you only use Claude through the web app or the desktop app for regular chat, **this tool will show you nothing** — and there's nothing anyone can do about it without Anthropic shipping a usage API.

- **Claude Chat in a browser** (claude.ai) — The chat data lives inside your browser's sandboxed IndexedDB and isn't exposed to outside apps. Even if we could read it, the data itself doesn't contain token counts — Anthropic doesn't send per-message usage numbers to the browser. A browser extension could count *messages* but not tokens or cost.
- **Claude Chat in the Desktop app** — The desktop app is an Electron wrapper around claude.ai. Same story: conversations live server-side, the local cache (`%APPDATA%/Claude/`) only stores UI state and cached account metadata, not usage metrics. Verified by poking at its IndexedDB.
- **Claude Pro / Max plan usage totals** — There's no public API for subscribers to query their own usage. The only official usage API Anthropic offers is on `console.anthropic.com` for **developer API keys**, not for Pro/Max chat accounts.
- **GitHub Copilot, Cursor, Windsurf, Aider, Continue.dev, Cody, ChatGPT Desktop** — Investigated. None store trackable local usage data with token counts on the machine I tested. If any of these ever expose local JSONL-style logs, the plugin architecture (see [PROVIDERS.md](PROVIDERS.md)) lets you add a new provider in a single file.
- **Microsoft Copilot** — Stores data in encrypted Helium DB format. Not parseable.
- **Passive app-open time** — AIClocker measures *active* engagement based on message timestamp gaps. If you open Claude Code and walk away, that idle time is deliberately excluded.

### Why Claude Code works but chat doesn't

Claude Code is an IDE extension that writes full conversation JSONL logs to your local disk (`~/.claude/projects/`) with token counts, model info, timestamps, and tool-call details on every assistant message. AIClocker reads those files directly.

Claude chat (web or desktop) doesn't do this — conversations live on Anthropic's servers and are only streamed to the client as display text, without the underlying usage metrics. No amount of local file parsing can recover data that was never sent to your machine in the first place.

**If Anthropic ever adds a subscriber usage API, adding support would be a small patch to AIClocker.** Until then, chat usage is untrackable by any third-party tool, and anyone claiming otherwise is either using an MITM proxy (fragile, against ToS) or guessing.

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
├── main.js                 # Electron entry point — window lifecycle, menu, IPC handlers
├── LICENSE                 # MIT
├── icon.png, icon.ico      # App icons (multi-resolution)
├── package.json            # Includes electron-builder + publish config
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
│   ├── preload-about.js    # About-dialog IPC bridge (narrow surface)
│   └── providers/
│       ├── provider-base.js  # Abstract Provider class
│       ├── index.js          # Provider registry
│       ├── claude-code.js    # Claude Code provider
│       ├── cowork.js         # Claude Co-Work provider
│       └── _template.js      # Template for adding new providers
├── dashboard/
│   ├── index.html          # Dashboard UI (charts + session table)
│   ├── about.html          # About dialog (MouseWheel branding + BMAC)
│   ├── style.css
│   ├── dashboard.js        # Frontend logic
│   ├── chart.min.js        # Chart.js (vendored)
│   └── assets/
│       └── mousewheel_logo.png  # Brand logo used in About dialog
├── scripts/
│   ├── make-icon.js        # Generate clock icon PNG + ICO
│   ├── make-cert.js        # Generate self-signed code-signing cert
│   ├── sync-public.js      # Extract + push aiclocker/ subtree to public repo
│   └── preview-server.js   # Local static server w/ stubbed electronAPI
├── certs/                  # (gitignored) signing cert + password
├── data/                   # (gitignored) dev DB
├── release/                # (gitignored) electron-builder output (.exe + latest.yml)
└── docs/
    ├── README.md           # This file
    ├── CHANGELOG.md        # Version history
    ├── ARCHITECTURE.md     # Technical deep-dive
    ├── INSTALL.md          # End-user install guide (installer + portable)
    └── PROVIDERS.md        # How to add a new provider
```

---

## Public mirror & automated sync

AIClocker lives as a subdirectory in a larger private monorepo during development, but it's also mirrored to a standalone public repo at **https://github.com/MorlachAU/aiclocker**.

Every commit to the parent repo that touches `aiclocker/` is automatically synced to the public repo via a local `post-commit` git hook that runs `scripts/sync-public.js`. The sync uses `git subtree split` so the public repo contains only the aiclocker history, not the rest of the monorepo.

Manual sync is also available:
```bash
cd aiclocker
npm run sync           # push latest to public repo
npm run sync:dry       # dry-run (no push)
```

The hook lives at `.git/hooks/post-commit` in the parent repo. Since hooks are not tracked, re-installing AIClocker on a fresh machine requires copying the hook back into place.

---

## Known limitations

1. **No Claude Chat tracking** — Anthropic doesn't expose chat token data to subscribers
2. **Active time is estimated** — based on message-timestamp gaps, not actual focus
3. **Pricing must be updated manually** — edit `src/pricing.js` when rates change
4. **Self-signed cert triggers SmartScreen** — expected for any non-commercial cert
5. **First cold launch is ~10-15s** — 500+ MB of JSONL to parse. Subsequent launches are sub-second via byte-offset incremental ingest.

---

## Support the project

AIClocker is free and open source. If it saves you time and you want to buy the author a coffee:

<p align="center">
  <a href="https://buymeacoffee.com/mousewheeldigital">
    <img src="https://img.shields.io/badge/Buy_Me_A_Coffee-Support-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee">
  </a>
</p>

Feedback is also very welcome at **feedback@mousewheeldigital.com**.

---

<p align="center">
  <img src="../dashboard/assets/mousewheel_logo.png" alt="MouseWheel Digital" width="80">
</p>

<p align="center">
  <strong>A <a href="https://www.mousewheeldigital.com/">MouseWheel Digital</a> product</strong>
</p>

<p align="center">
  <em>Digital products. Built with purpose.</em>
</p>

<p align="center">
  Copyright © 2026 Ben Kirtland — Built with the assistance of <a href="https://claude.com/claude-code">Claude Code</a> by Anthropic.
</p>
