# Adding a new AI tool to AIClocker

AIClocker uses a plugin architecture. Each tracked AI tool is a single file in `src/providers/` that extends the `Provider` base class. To add a new tool, you only touch **two files** in total:

1. Create `src/providers/your-tool.js`
2. Register it in `src/providers/index.js`

That's it. No changes to ingestion, stats, database schema, tray menu, or dashboard.

---

## The Provider interface

A provider extends `src/providers/provider-base.js` and overrides four methods:

```js
class Provider {
  constructor() {
    this.name = 'unnamed';        // unique id, e.g. 'cursor'
    this.displayName = 'Unnamed'; // user-facing label
    this.icon = '';               // emoji or short label
  }

  discoverFiles() { /* returns [{ path, isSubagent }] */ }
  normalizeRecord(record) { /* unifies field names */ }
  discoverSessions() { /* returns metadata rows */ }
  getWatchPaths() { /* directories to watch */ }
}
```

### `discoverFiles()`

Return an array of `{ path, isSubagent }` objects for every JSONL file this provider should parse. AIClocker iterates these and streams each file line-by-line into the parser.

```js
discoverFiles() {
  const files = [];
  const dir = path.join(process.env.APPDATA, 'YourTool', 'logs');
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.endsWith('.jsonl')) {
        files.push({ path: path.join(dir, entry), isSubagent: false });
      }
    }
  }
  return files;
}
```

### `normalizeRecord(record)`

Transform a raw JSONL record into AIClocker's canonical shape:

```js
{
  type: 'assistant' | 'user' | 'system' | ...,  // 'assistant' is the one with token data
  uuid: 'unique-message-id',
  sessionId: 'unique-session-id',
  timestamp: '2026-04-06T01:23:45.000Z',        // ISO 8601
  cwd: 'C:\\path\\to\\project' | null,
  message: {
    model: 'model-name',
    content: [ /* response blocks */ ],
    usage: {
      input_tokens: 123,
      output_tokens: 456,
      cache_creation_input_tokens: 789,
      cache_read_input_tokens: 101,
    },
  },
}
```

If your tool's JSONL already uses these exact field names, the default implementation from the base class works unchanged. If it uses different names (like Co-Work's `session_id` and `_audit_timestamp`), override to remap them:

```js
normalizeRecord(record) {
  return {
    type: record.role === 'assistant' ? 'assistant' : record.type,
    uuid: record.id || record.uuid,
    sessionId: record.conversation_id,
    timestamp: record.created_at,
    cwd: record.working_directory || null,
    message: {
      model: record.model,
      content: record.content,
      usage: record.usage,
    },
  };
}
```

### `discoverSessions()`

Return extra session metadata from sources beyond the JSONL files (e.g., a separate sessions.json with human-readable titles). Return an empty array if your tool has no such sources.

```js
discoverSessions() {
  const sessions = [];
  // Example: read titles from a separate metadata file
  const metadataPath = path.join(this.dir, 'sessions.json');
  if (fs.existsSync(metadataPath)) {
    const data = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    for (const s of data.sessions) {
      sessions.push({
        sessionId: s.id,
        title: s.title,
        createdAt: s.created,
        lastActivityAt: s.last_activity,
      });
    }
  }
  return sessions;
}
```

### `getWatchPaths()`

Return directories to watch for changes. The watcher uses `fs.watch(recursive: true)` plus 30-second polling on these paths. When any `.jsonl` file inside changes, AIClocker re-runs ingestion.

```js
getWatchPaths() {
  return [
    path.join(process.env.APPDATA, 'YourTool', 'logs'),
  ];
}
```

---

## Step-by-step walkthrough

Let's say you want to add Cursor support.

### 1. Copy the template

```bash
cp src/providers/_template.js src/providers/cursor.js
```

### 2. Fill in identity

```js
class CursorProvider extends Provider {
  constructor() {
    super();
    this.name = 'cursor';
    this.displayName = 'Cursor';
    this.icon = '⚡';

    this.logsDir = path.join(process.env.APPDATA, 'Cursor', 'logs');
  }
  ...
}
```

### 3. Implement discovery

```js
discoverFiles() {
  const files = [];
  if (!fs.existsSync(this.logsDir)) return files;
  for (const f of fs.readdirSync(this.logsDir)) {
    if (f.endsWith('.jsonl')) {
      files.push({ path: path.join(this.logsDir, f), isSubagent: false });
    }
  }
  return files;
}

getWatchPaths() {
  return [this.logsDir];
}
```

### 4. Normalize records (if needed)

Check what format Cursor's JSONL uses. If the field names don't match AIClocker's canonical shape, override `normalizeRecord`.

### 5. Register

```js
// src/providers/index.js
const ClaudeCodeProvider = require('./claude-code');
const CoWorkProvider = require('./cowork');
const CursorProvider = require('./cursor');  // ← add

function getAllProviders() {
  if (providersInstance) return providersInstance;
  providersInstance = [
    new ClaudeCodeProvider(),
    new CoWorkProvider(),
    new CursorProvider(),  // ← add
  ];
  return providersInstance;
}
```

### 6. Add pricing if new models appear

If Cursor uses GPT-4 or other non-Claude models, add entries to `src/pricing.js`:

```js
const PRICING = {
  'claude-opus-4-6': { ... },
  // add:
  'gpt-4-turbo': { input: 10.00, output: 30.00, cacheWrite: 0, cacheRead: 0 },
};
```

### 7. Test

```bash
npm start
```

The tray menu will automatically show the new provider in the "Today by tool" breakdown (if it has activity) and all queries will include Cursor data.

---

## What gets stored in the DB

Every message ingested by any provider goes into the same `messages` table with a `provider` column identifying where it came from:

```sql
SELECT provider, COUNT(*) FROM messages GROUP BY provider;
-- claude-code:  12965
-- cowork:       24
-- cursor:       478  (after your new provider runs)
```

Queries in `stats.js` take an optional `providerFilter` parameter to scope stats to a single provider:

```js
stats.getRangeStats(startMs, endMs, 'cursor');  // only Cursor data
stats.getRangeStats(startMs, endMs);             // all providers
```

---

## Tips

- **Start simple.** Don't try to handle every edge case on the first pass. Parse the most obvious JSONL files and verify they show up, then expand.
- **Use the template.** `src/providers/_template.js` has commented-out skeleton code for every method. Copy it rather than writing from scratch.
- **Check the two existing providers** (`claude-code.js`, `cowork.js`) for real-world examples of simple and slightly-more-complex discovery logic.
- **Test with `node src/test-ingest.js`.** This runs the full pipeline from the command line and prints per-provider stats.
- **Don't modify core files.** If you find yourself editing `ingest.js`, `parser.js`, or `watcher.js` to support your provider, step back — the provider interface probably has a method that fits.

---

## When a tool can't be supported

Some AI tools don't store local usage data at all:
- **Claude Chat in Desktop app / claude.ai** — server-side only
- **GitHub Copilot** — telemetry is encrypted, no local usage logs
- **Microsoft Copilot** — Helium DB, encrypted
- **ChatGPT Desktop** — server-side only

For these, the only option would be proxying network traffic, which is fragile, breaks with every update, and often violates the tool's Terms of Service. We don't attempt it.
