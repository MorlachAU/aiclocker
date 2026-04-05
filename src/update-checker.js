/**
 * Lightweight update checker for AIClocker.
 *
 * Hits GitHub's releases API for the latest tag, compares it to the running
 * app's version, and — if newer — shows a native notification that opens the
 * release page in the user's browser when clicked.
 *
 * Deliberately does NOT download or install anything. Electron-updater's
 * strict signature-chain verification doesn't play nice with self-signed
 * certs, so we punt to the user: download and run the new installer
 * yourself. This is the same pattern DisplayPal (the sister project) uses.
 *
 * Runs once on launch, then every 6 hours while the app is open.
 * Network errors fail silently — never crashes the app.
 */
const { app, Notification, shell } = require('electron');
const https = require('https');

const GITHUB_REPO = 'MorlachAU/aiclocker';
const API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function parseVersion(versionStr) {
  if (!versionStr) return [0];
  const clean = String(versionStr).trim().replace(/^v/i, '');
  return clean.split('.').map(n => parseInt(n, 10) || 0);
}

function compareVersions(a, b) {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'AIClocker-UpdateCheck',
        'Accept': 'application/vnd.github+json',
      },
      timeout: 10000,
    }, (res) => {
      // Follow GitHub redirects once if needed
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function checkOnce() {
  try {
    const data = await fetchJson(API_URL);
    const latestTag = data.tag_name || '';
    const current = parseVersion(app.getVersion());
    const latest = parseVersion(latestTag);

    if (compareVersions(latest, current) > 0) {
      const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
      console.log(`[update-check] new version available: ${latestTag} (current: ${app.getVersion()})`);
      showUpdateNotification(latestTag, releaseUrl);
    } else {
      console.log(`[update-check] no update available (latest: ${latestTag || 'unknown'}, current: ${app.getVersion()})`);
    }
  } catch (err) {
    // Network error, no internet, GitHub down, rate-limited — fail silently
    console.warn('[update-check] check failed:', err.message);
  }
}

function showUpdateNotification(version, releaseUrl) {
  if (!Notification.isSupported()) return;

  const n = new Notification({
    title: 'AIClocker update available',
    body: `Version ${version} is ready to download. Click to open the release page.`,
    silent: false,
  });

  n.on('click', () => {
    shell.openExternal(releaseUrl);
  });

  n.show();
}

function start() {
  if (!app.isPackaged) return; // Dev mode — skip
  checkOnce();
  setInterval(checkOnce, CHECK_INTERVAL_MS);
}

module.exports = { start, checkOnce };
