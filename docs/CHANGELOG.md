# Changelog

All notable changes to AIClocker (previously Claude Usage Tracker) will be documented here.

Versioning follows [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH
- MAJOR — breaking changes
- MINOR — new features, backward compatible
- PATCH — bug fixes

---

## [1.1.0] — 2026-04-06

Major release: renamed to **AIClocker**, refactored into a plugin architecture, and shipped as an installable Windows app.

### Added
- **Rebrand to AIClocker**
  - New name throughout (package, window title, tray tooltip, dashboard header, log messages)
  - Placeholder clock icon generated programmatically by `scripts/make-icon.js` (PNG + multi-resolution ICO with sizes 16/32/48/64/128/256)
  - All references updated from "Claude Usage Tracker" to "AIClocker"
- **Provider plugin architecture** (`src/providers/`)
  - New abstract `Provider` base class with four methods: `discoverFiles`, `normalizeRecord`, `discoverSessions`, `getWatchPaths`
  - Claude Code logic extracted into `providers/claude-code.js`
  - Co-Work logic extracted into `providers/cowork.js` (keeps snake_case field normalization)
  - Registry at `providers/index.js`
  - Documented template at `providers/_template.js` for adding new providers with copy/paste + four method overrides
  - `ingest.js`, `watcher.js`, `session-resolver.js`, and `parser.js` now delegate to the registry — zero Claude-specific logic remains in core
  - Database schema: added `provider` column to `messages` and `sessions` tables with non-breaking migration (existing rows default to `'claude-code'`, Co-Work rows backfilled by `source_file` pattern)
  - `stats.js` query helpers accept optional `providerFilter` parameter (defaults to null = all providers)
  - New `getProviderBreakdown()` query for aggregate stats by provider
  - Tray menu shows provider breakdown when more than one has activity
- **Windows installer** via electron-builder + NSIS
  - Full-polish installer: user chooses install path (per-user or Program Files), creates Start Menu shortcut, desktop shortcut, proper uninstaller
  - `build:dir`, `build`, `build:publish` npm scripts
  - Output: `release/AIClocker-Setup-1.1.0.exe` (~88 MB)
  - Configured via `"build"` field in `package.json`
- **Self-signed code-signing certificate**
  - `scripts/make-cert.js` generates a 5-year RSA 2048 SHA-256 code-signing cert via PowerShell's `New-SelfSignedCertificate`
  - Certificate exports as both PKCS#12 (`certs/aiclocker.pfx`) for signing and X.509 (`certs/aiclocker.cer`) for users to import into Trusted Root
  - Auto-generated password stored in `certs/password.txt`
  - Entire `certs/` directory is gitignored
  - Installer + inner executables + uninstaller all signed via signtool.exe during build
  - Users can eliminate SmartScreen warnings by importing the `.cer` file (instructions in `certs/README.md` and `docs/INSTALL.md`)
- **Auto-updater** via electron-updater
  - Wired into `main.js` with 6-hour check interval
  - Publishes to GitHub Releases (`MorlachAU/aiclocker-releases`) via `npm run build:publish`
  - Runs only in packaged builds — gracefully no-ops when running from source
  - Auto-download + install-on-quit behavior
  - Errors logged as warnings (won't crash the app if GitHub is unreachable or release doesn't exist)
- **Start with Windows toggle**
  - New `src/settings.js` module for persisted preferences stored at `<dataDir>/settings.json`
  - Tray menu includes checkbox item that toggles Electron's `app.setLoginItemSettings({ openAtLogin, openAsHidden })`
  - Uses `--hidden` arg on autostart so the tray-only mode persists
- **Data migration on first install**
  - New `resolveDataDirAndMigrate()` in `main.js`
  - On packaged launch, switches data directory to `%APPDATA%/AIClocker/data/`
  - If no DB exists there, copies from legacy locations (`E:/Dev/aiclocker/data/` or `E:/Dev/claude-usage-tracker/data/`) including WAL and SHM files
  - Dev mode (`npm start`) continues using project-local `data/` for convenience
  - `db.js` exposes `setDataDir()` to let main process override the default

### Changed
- `package.json`: version bumped to 1.1.0, name to `aiclocker`, productName set, new description, new scripts, build configuration
- `src/db.js`: data directory is now configurable via `setDataDir()`; schema creation split from migrations so index creation can happen after column addition
- `src/parser.js`: parse signature changed — now takes `(line, sourceFile, isSubagent, provider)` and uses the provider to normalize field names before extracting token data
- `src/ingest.js`: file discovery delegates to `getAllProviders()`; each file is parsed with its originating provider
- `src/watcher.js`: watch paths collected from `provider.getWatchPaths()` instead of hardcoded directories
- `src/session-resolver.js`: session metadata sources iterate over providers via `provider.discoverSessions()`
- `src/stats.js`: all range query helpers accept an optional `providerFilter` parameter
- `.gitignore`: added `certs/`, `dist/`, `build-output/`, `release/`
- `src/tray.js`: accepts three callbacks (`onOpenDashboard`, `onToggleStartup`, `onQuit`); bundles them into a `callbacks` object for easier future extension

### Fixed
- Co-Work audit JSONL files now parse cleanly through the provider normalization (previously required conditional `sessionId || session_id` logic in the parser; now handled by `CoWorkProvider.normalizeRecord`)

### Investigated but not shipped
- **Other AI tools** (Cursor, GitHub Copilot, Windsurf, Aider, Continue.dev, Cody, ChatGPT Desktop) — none are installed on this machine. Microsoft Copilot stores data in encrypted Helium DB format (not parseable). Architecture is future-ready via the plugin system.
- **Real EV code-signing certificate** — $200-500/year commercial cost not justified for personal distribution. Self-signed is fine for internal use.
- **Provider filter UI in dashboard** — schema is ready (`providerFilter` param supported in all queries), UI deferred to a future version.

### Known issues
- **Stuck `dist/` directory from earlier build attempts** — Windows Defender or similar holds a file lock on `app.asar` after running the packaged exe. Workaround: the build output directory was changed from `dist` to `release`. The stuck dir can be cleaned up after a reboot.

---

## [1.0.0] — 2026-04-05

Initial release. Built in a single session with Claude Code.

### Added
- **Data layer**
  - SQLite database (`data/usage.db`) with `messages`, `sessions`, and `ingest_state` tables
  - JSONL parser that extracts assistant messages with token usage data
  - Incremental ingestion using byte offsets — only new bytes are parsed on re-launch
  - Anthropic pricing table for Opus / Sonnet / Haiku with input, output, cache write, and cache read rates
  - Cost calculator that computes API-equivalent dollars per message at ingest time
- **Session resolution**
  - Cross-references three sources: process registry, Desktop session snapshots, and ingested messages
  - Populates session titles, models, effort levels, and entrypoints
- **Stats queries**
  - Today / This Week / This Month / All Time range helpers
  - Overall totals, model breakdown, daily breakdown, token type breakdown
  - Session list with per-session aggregation
  - Active time estimation based on message timestamp gaps (5-minute idle threshold)
  - Top tools usage
- **System tray app (Electron)**
  - Purple circle tray icon
  - Context menu with live stats: current session, today/week totals, model breakdown
  - Auto-refresh every 60 seconds
  - Tooltip shows today's API-equivalent total and active/idle status
- **File watcher**
  - `fs.watch` on JSONL directories plus 30-second polling fallback
  - Idle detection: marks session idle if no file changes in 5 minutes
  - Triggers incremental ingest on every file change
- **Dashboard**
  - Opens in a BrowserWindow from the tray
  - Summary cards: cost, tokens, active time, sessions, messages
  - Daily API-equivalent bar chart
  - Model usage doughnut chart
  - Token type stacked bar (input/output/cache write/cache read)
  - Top tools horizontal bar chart
  - Sessions table with sortable columns
  - Date range picker (Today / Week / Month / All Time)
- **Co-Work support**
  - Added `%APPDATA%/Claude/local-agent-mode-sessions/` to file discovery
  - Watches the Co-Work directory for changes
  - Parser supports both Claude Code field naming (`sessionId`, `timestamp`) and Co-Work audit file naming (`session_id`, `_audit_timestamp`)

### Clarifications
- Cost labels throughout the UI say **"API Equivalent"** rather than "Cost" to make it clear these are not actual charges on a Max plan — they represent what the usage would cost at Anthropic's per-token API rates.

### Not included (investigated and rejected)
- **Claude Chat tracking** — investigated the Desktop app's IndexedDB, blob storage, and network cache. Chat conversations live server-side. Anthropic does not expose per-message token counts locally or via any API accessible to Max plan users. No reliable path exists without an official usage API from Anthropic.
- **Manual chat session logging** — was briefly prototyped (tray quick-entry popup with form for date, time, duration, model, description). Reverted because manual logging is tedious and unlikely to be used consistently.

---

## Build notes (internal, 2026-04-05)

Built in the following phases:

1. **Exploration** — cataloged all Claude data sources on the machine. Found ~22,000 JSONL records across 542 MB of logs in `~/.claude/projects/E--Dev/`.
2. **Data layer** — db, parser, pricing, ingest modules. Tested via CLI (`src/test-ingest.js`) before adding any UI.
3. **Stats + session resolver** — SQL queries and cross-source metadata resolution.
4. **Tray app** — Electron main process, tray icon, context menu, file watcher.
5. **Dashboard** — HTML/CSS/JS with Chart.js, IPC bridge via preload script.
6. **Co-Work support** — added second data source path and walker.
7. **Parser hardening** — handled snake_case field names in Co-Work audit files.
8. **Label clarification** — renamed "Cost" to "API Equivalent" throughout.

Native modules: `better-sqlite3` was installed as a fallback but `node:sqlite` worked natively in Electron 35 with an experimental warning. The fallback code path in `src/db.js` remains for portability.

Electron rebuild was run once after installing `better-sqlite3` to compile the native binary against Electron's Node ABI.

---

## Versioning policy going forward

- **Patch versions** (1.0.1, 1.0.2, ...) — bug fixes, parser tweaks, pricing updates
- **Minor versions** (1.1.0, 1.2.0, ...) — new tracking sources, new dashboard features, new stats
- **Major versions** (2.0.0, ...) — architectural changes, schema migrations, breaking config changes

Each change should be committed to git with a message that matches a CHANGELOG entry.
