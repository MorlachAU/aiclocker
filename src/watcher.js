const fs = require('fs');
const { ingestAll, discoverJsonlFiles } = require('./ingest');
const { resolveSessions } = require('./session-resolver');
const { getAllProviders } = require('./providers');

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

let lastActivityTime = 0;
let isActive = false;
let watchers = [];
let pollTimer = null;
let onChange = null;

function getLatestMtime() {
  const files = discoverJsonlFiles();
  let latest = 0;
  for (const f of files) {
    try {
      const stat = fs.statSync(f.path);
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    } catch (e) { /* file may have been deleted */ }
  }
  return latest;
}

async function handleChange() {
  try {
    await ingestAll();
    resolveSessions();
  } catch (e) {
    console.error('Ingest error:', e.message);
  }

  lastActivityTime = Date.now();
  isActive = true;

  if (onChange) onChange();
}

function checkIdle() {
  if (lastActivityTime > 0 && Date.now() - lastActivityTime > IDLE_THRESHOLD_MS) {
    if (isActive) {
      isActive = false;
      if (onChange) onChange();
    }
  }
}

function start(onChangeCallback) {
  onChange = onChangeCallback;

  // Set initial activity from file mtimes
  lastActivityTime = getLatestMtime();
  isActive = (Date.now() - lastActivityTime) < IDLE_THRESHOLD_MS;

  // Collect watch paths from all registered providers
  const watchDirs = [];
  for (const provider of getAllProviders()) {
    for (const dir of provider.getWatchPaths()) {
      if (dir && !watchDirs.includes(dir)) watchDirs.push(dir);
    }
  }

  for (const dir of watchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          // Debounce: wait a bit for writes to complete
          setTimeout(() => handleChange(), 2000);
        }
      });
      watchers.push(watcher);
    } catch (e) {
      console.error('fs.watch failed, relying on polling:', e.message);
    }
  }

  // Polling fallback
  let lastPollMtime = lastActivityTime;
  pollTimer = setInterval(async () => {
    checkIdle();

    const currentMtime = getLatestMtime();
    if (currentMtime > lastPollMtime) {
      lastPollMtime = currentMtime;
      await handleChange();
    }
  }, POLL_INTERVAL_MS);
}

function stop() {
  for (const w of watchers) {
    try { w.close(); } catch (e) {}
  }
  watchers = [];
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function getIsActive() {
  return isActive;
}

function getLastActivity() {
  return lastActivityTime;
}

module.exports = { start, stop, getIsActive, getLastActivity };
