# Architecture

How AIClocker works under the hood. Written for someone who wants to understand or modify the code.

As of **v1.1.0**, AIClocker uses a plugin architecture. Individual AI tools are encapsulated as providers in `src/providers/`, and the core ingestion/stats/UI code is provider-agnostic. See [PROVIDERS.md](PROVIDERS.md) for how to add a new tool.

**v1.2.0** added a Help menu on the dashboard window, a standalone About dialog (`dashboard/about.html`) with its own preload (`src/preload-about.js`), new IPC endpoints for opening external links and the system clipboard, a signed NSIS installer + portable build, an auto-updater wired to GitHub Releases, a self-signed code-signing cert generated via PowerShell, and a post-commit hook that auto-syncs the `aiclocker/` subtree to the public mirror at https://github.com/MorlachAU/aiclocker.

---

## High-level flow

```
┌─────────────────────┐
│ Claude Code writes  │
│   JSONL files       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐      ┌─────────────────────┐
│  watcher.js         │─────▶│  ingest.js          │
│  (fs.watch + poll)  │      │  (incremental)      │
└─────────────────────┘      └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │  parser.js          │
                             │  (JSONL → objects)  │
                             └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │  pricing.js         │
                             │  (token → cost)     │
                             └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │  db.js (SQLite)     │
                             │  messages table     │
                             └──────────┬──────────┘
                                        │
                          ┌─────────────┴──────────────┐
                          ▼                            ▼
                 ┌────────────────┐           ┌────────────────┐
                 │  stats.js      │           │  stats.js      │
                 │  (SQL queries) │           │  (SQL queries) │
                 └───────┬────────┘           └────────┬───────┘
                         │                             │
                         ▼                             ▼
                 ┌────────────────┐           ┌────────────────┐
                 │  tray.js       │           │  dashboard.js  │
                 │  (context menu)│           │  (charts)      │
                 └────────────────┘           └────────────────┘
```

---

## JSONL format (input)

Every line in a Claude Code JSONL log is a JSON object with a `type` field. Only `assistant` records carry token usage data — user messages, queue operations, system events, and progress records are skipped.

### Assistant record structure (Claude Code)

```json
{
  "type": "assistant",
  "uuid": "e3c7ec2b-ef55-4a94-8584-55f48b262e58",
  "sessionId": "02c52d78-d2be-42ab-896e-ec39294fb93c",
  "timestamp": "2026-03-31T08:53:57.782Z",
  "cwd": "E:\\Dev",
  "entrypoint": "claude-desktop",
  "message": {
    "model": "claude-opus-4-6",
    "content": [
      { "type": "tool_use", "name": "Bash", "input": { ... } }
    ],
    "usage": {
      "input_tokens": 3,
      "output_tokens": 83,
      "cache_creation_input_tokens": 42707,
      "cache_read_input_tokens": 7863
    }
  }
}
```

### Assistant record structure (Co-Work audit)

Co-Work's `audit.jsonl` uses different field names:

```json
{
  "type": "assistant",
  "uuid": "...",
  "session_id": "...",          // snake_case instead of sessionId
  "_audit_timestamp": "...",    // instead of timestamp
  "message": { ... same ... }
}
```

The parser (`src/parser.js`) handles both naming conventions.

---

## Database schema

Three tables in `data/usage.db`:

### `messages`
One row per assistant message with token usage.

| Column | Type | Description |
|---|---|---|
| `uuid` | TEXT PK | Unique message ID |
| `session_id` | TEXT | Links to `sessions.session_id` |
| `timestamp` | TEXT | ISO 8601 timestamp |
| `timestamp_ms` | INTEGER | Epoch millis (for range queries) |
| `model` | TEXT | e.g., `claude-opus-4-6` |
| `input_tokens` | INTEGER | Regular input tokens |
| `output_tokens` | INTEGER | Output tokens |
| `cache_creation_tokens` | INTEGER | Tokens used writing to cache |
| `cache_read_tokens` | INTEGER | Tokens read from cache (cheap) |
| `cost_usd` | REAL | API-equivalent cost, computed at ingest |
| `cwd` | TEXT | Working directory |
| `is_subagent` | INTEGER | 0 or 1 |
| `source_file` | TEXT | Full path to originating JSONL |
| `tools_used` | TEXT | Comma-separated tool names |

Indexes on `session_id`, `timestamp_ms`, and `model`.

### `sessions`
One row per session, populated by `session-resolver.js`.

| Column | Type |
|---|---|
| `session_id` | TEXT PK |
| `title` | TEXT |
| `cwd` | TEXT |
| `model` | TEXT |
| `created_at` | INTEGER |
| `last_activity_at` | INTEGER |
| `entrypoint` | TEXT |
| `effort` | TEXT |

### `ingest_state`
Tracks byte offsets for incremental parsing.

| Column | Type |
|---|---|
| `file_path` | TEXT PK |
| `file_size` | INTEGER |
| `last_modified` | INTEGER |
| `bytes_read` | INTEGER |

---

## Incremental ingestion

Re-parsing 540 MB of JSONL on every app launch would be slow. Instead, `ingest.js` tracks how many bytes it has already read from each file. On each ingest:

1. `fs.statSync(filePath)` — get current file size and mtime
2. Compare against `ingest_state` row for this file
3. If size and mtime unchanged → skip entirely
4. If file grew → `fs.createReadStream(filePath, { start: bytes_read })` to read only new bytes
5. Parse new lines, insert into `messages`, update `ingest_state.bytes_read` to the new file size

Initial parse (cold start): ~10-15 seconds
Subsequent launches: <1 second
During active use: instant (watcher triggers incremental parse on every file change)

### Edge case: partial first line

When resuming from an offset, the first "line" read might be a partial JSON line (cut mid-byte). The parser wraps `JSON.parse` in try/catch and returns `null` for invalid lines, which skips them silently. Since JSONL lines are append-only, the next full line starts at the next newline.

---

## Cost calculation (pricing.js)

Rates are stored as `$ per 1M tokens`:

```js
const PRICING = {
  'claude-opus-4-6':   { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-6': { input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
};
```

Per-message cost is computed at ingest time and stored in `messages.cost_usd`. This means aggregate queries are a simple `SUM(cost_usd)` — no per-query recalculation.

**Important:** These are API rates. On a Max plan, actual cost is flat ($200/month). The tracker labels everything as "API Equivalent" to make this clear.

### Unknown models

If a message has a model string that doesn't match any known pricing (e.g., `<synthetic>` for internal system messages), `calculateCost` returns 0.

### Pricing updates

If Anthropic changes rates, edit `src/pricing.js` and re-run ingestion. Existing rows in the database retain their old cost values — to recalculate, you'd need to delete `data/usage.db` and re-ingest from scratch.

---

## Session resolution (session-resolver.js)

Session metadata is scattered across three sources. The resolver merges them in priority order:

1. **Messages in the database** (base layer) — provides `session_id`, earliest/latest timestamps, `cwd`, model used
2. **Process registry** (`~/.claude/sessions/*.json`) — adds `entrypoint` field
3. **Desktop session snapshots** (`%APPDATA%/Claude/claude-code-sessions/**/local_*.json`) — adds `title`, `effort`, and authoritative `createdAt`/`lastActivityAt`

Later sources override earlier ones for overlapping fields.

---

## File watching (watcher.js)

Two mechanisms run in parallel for reliability:

### fs.watch
- Recursive watch on `~/.claude/projects/` and `%APPDATA%/Claude/local-agent-mode-sessions/`
- Triggers on any `.jsonl` file modification
- 2-second debounce before triggering ingest (lets Claude finish writing)

### Polling fallback
- `setInterval` every 30 seconds
- Calls `fs.statSync()` on every tracked file, checks if mtime increased
- Catches events that `fs.watch` misses on Windows

### Idle detection
- Tracks the most recent mtime across all tracked files
- If no file has been modified in 5 minutes → mark session idle
- Tray tooltip and menu refresh to show Idle status

---

## Active time estimation (stats.js)

"Active time" is not tracked directly — it's estimated from message timestamps:

```
for each pair of consecutive messages in range:
  gap = next_timestamp - prev_timestamp
  if gap <= 5 minutes:
    active_time += gap  (treat gap as continuous work)
  else:
    active_time += 1 minute  (just count the message itself)
active_time += 1 minute (for the last message)
```

This gives a reasonable approximation: rapid back-and-forth counts as continuous activity, long pauses don't.

**What this misses:** time spent reading Claude's response, thinking, looking at tool output. The real "wall clock" engagement is probably somewhat higher than this metric.

**What this excludes (correctly):** app open but idle, stepped away, overnight left running.

---

## IPC bridges

Every renderer window runs sandboxed (`contextIsolation: true`, `nodeIntegration: false`) and cannot touch Node APIs, SQLite, or the filesystem directly. Two preload scripts expose narrow, explicit APIs via `contextBridge.exposeInMainWorld`:

### `src/preload.js` — dashboard window

Exposes the stats/query functions plus a small set of utilities:

```js
contextBridge.exposeInMainWorld('electronAPI', {
  // Stats queries (answered by stats.js)
  getStats: (range) => ipcRenderer.invoke('get-stats', range),
  getModelBreakdown: (range) => ipcRenderer.invoke('get-model-breakdown', range),
  getDailyBreakdown: (days) => ipcRenderer.invoke('get-daily-breakdown', days),
  getTokenTypeBreakdown: (range) => ipcRenderer.invoke('get-token-type-breakdown', range),
  getSessionList: (limit, offset) => ipcRenderer.invoke('get-session-list', limit, offset),
  getTopTools: (range, limit) => ipcRenderer.invoke('get-top-tools', range, limit),
  getActiveTime: (range) => ipcRenderer.invoke('get-active-time', range),
  getOverallStats: () => ipcRenderer.invoke('get-overall-stats'),
  // Utilities (added in v1.2.0)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
```

### `src/preload-about.js` — About dialog window

Minimal bridge with just what the About dialog needs:

```js
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  closeAboutDialog: () => ipcRenderer.send('close-about-dialog'),
});
```

### Main-process handlers

`main.js` registers matching `ipcMain.handle` / `ipcMain.on` handlers. Three principles govern them:

1. **Explicit allowlist for opening URLs.** `open-external` only permits `http:`, `https:`, and `mailto:` protocols. Anything else returns `{ ok: false, error: 'protocol not allowed' }`. This prevents a compromised renderer from launching arbitrary local programs via custom protocol handlers.
2. **No arbitrary SQL or file access.** The dashboard can only call the specific stat helpers we expose — not run queries or read files.
3. **Two preloads, not one shared.** The About window has its own minimal preload so the dashboard-specific stats APIs aren't exposed to a window that doesn't need them.

---

## Help menu and About dialog (v1.2.0)

### Dashboard window menu bar

`main.js` calls `dashboardWindow.setMenu(buildDashboardMenu())` to install a standard Windows menu bar. The menu has three top-level items:

```
File                 View                Help
├ Close Window       ├ Reload            ├ View on GitHub
└ Quit AIClocker     ├ Fullscreen        ├ Report an Issue
                     └ DevTools          ├ ─────────────
                                         ├ MouseWheel Digital
                                         ├ Buy Me a Coffee
                                         ├ ─────────────
                                         └ About AIClocker
```

Menu items that open external URLs call `shell.openExternal()` directly from the main process (no IPC round-trip needed since they originate in main).

### About dialog window

`Help → About AIClocker` (and the tray menu's "About AIClocker..." entry) calls `openAbout(parentWindow)`, which creates a 440×620 non-resizable `BrowserWindow` loading `dashboard/about.html`:

- **Modal** when opened from the Help menu (parent = dashboardWindow)
- **Non-modal standalone** when opened from the tray (parent = null)
- Own preload script (`src/preload-about.js`)
- Menu bar hidden via `autoHideMenuBar: true` + `setMenu(null)`
- Closes on the Close button, Escape key, or the window X

### about.html content

Mirrors the Display Manager / MouseWheel Digital branding template:
- 96px `mousewheel_logo.png`
- App title + dynamic version (fetched via `getAppVersion()` IPC on load)
- "A **MouseWheel Digital** product" with `#00c8a0` teal accent
- Italic tagline
- Three vertically-stacked buttons (website, BMAC, GitHub)
- Feedback email with Copy-to-clipboard button
- Claude Code credit

---

## Public repo sync automation

`aiclocker/` lives as a subdirectory in the private `E:\Dev` monorepo but is mirrored to the public [github.com/MorlachAU/aiclocker](https://github.com/MorlachAU/aiclocker). Two pieces make this automatic:

### `scripts/sync-public.js`

Standalone Node script. Operates on the parent git repo (`E:\Dev`) regardless of where it's invoked from. Flow:

1. Sanity check: `git rev-parse --git-dir` and verify `aiclocker/` exists in `HEAD`
2. Ensure the `aiclocker` remote is registered (idempotent — adds it if missing)
3. Delete any leftover `aiclocker-public` branch from a previous run
4. `git subtree split --prefix=aiclocker -b aiclocker-public` — extracts history
5. `git push aiclocker aiclocker-public:main`
6. Delete the local split branch regardless of push outcome

Supports `--dry` (prints plan without pushing) and `--quiet` (suppresses non-error output, used by the hook).

### `.git/hooks/post-commit`

Local shell script (not tracked, lives in `E:\Dev\.git\hooks\`). Fires after every commit. Behavior:

1. Check if the commit touched `aiclocker/` — skip if not (fast path for unrelated monorepo commits)
2. Check the `AICLOCKER_SYNC_IN_PROGRESS` env var to prevent recursion
3. Run `node aiclocker/scripts/sync-public.js --quiet`
4. Print success or warning line — **never fails the commit** even if the push errors out

This means every `git commit` in `E:\Dev` that touches `aiclocker/` automatically mirrors to the public repo. Failures are non-fatal and get logged; manual retry is `cd aiclocker && npm run sync`.

---

## Electron process model

- **Main process** (`main.js`) — owns the database, tray, file watcher, IPC handlers, menu construction, and window lifecycles
- **Dashboard renderer** — sandboxed, uses `src/preload.js`, lives while the dashboard window is open
- **About dialog renderer** — sandboxed, uses `src/preload-about.js`, modal or non-modal depending on how it was opened

The app starts with no windows visible (`window-all-closed` is prevented so closing the last window doesn't quit the app). All windows are created on demand and destroyed on close.

---

## Why these design choices

### Why Electron?
Pure Node.js has no cross-platform system tray API. Native C++ tray modules (`node-systray`, `windows-trayicon`) are unmaintained and fail on modern Node versions. Electron's Tray API is the only reliable option, and the bundled BrowserWindow gives us the dashboard for free.

Trade-off: ~120 MB disk footprint, ~60-80 MB RAM when idle. Acceptable for a tray app.

### Why SQLite instead of re-parsing JSONL?
540 MB of JSONL takes 10-15 seconds to fully parse. SQLite queries are <10 ms. The byte-offset incremental ingest gives us both: instant launches after the first, and instant stats queries.

### Why `node:sqlite` with `better-sqlite3` fallback?
`node:sqlite` ships with Node 24+ and Electron 35's bundled Node. Zero dependencies. But if a future Electron version strips it (or we want to backport to older Node), `better-sqlite3` ships prebuilt Electron binaries and swaps in with a one-line require change.

### Why no frontend framework?
The dashboard is simple enough that vanilla HTML/CSS/JS is faster to write and easier to maintain than a React/Vue/Svelte setup. Chart.js is the only frontend dependency, vendored locally to avoid CDN calls.

### Why vendor Chart.js locally?
- No network dependency when offline
- Faster load (no CDN round-trip)
- Works in Electron's file:// context without CSP headaches
- One less point of failure

---

## Future extension points

If we ever add new features, these are the natural spots:

- **New data source** — add a discovery function to `ingest.js`, add to `watcher.js` watch list
- **New model pricing** — add to `PRICING` object in `pricing.js`
- **New stat query** — add a function to `stats.js`, expose via IPC in `main.js`, call from `dashboard.js`
- **New dashboard chart** — add canvas to `dashboard/index.html`, add update function to `dashboard.js`
- **New tray menu item** — add to `buildContextMenu` in `tray.js`
- **Schema migration** — bump schema version in `db.js`, add migration logic to `initSchema`
