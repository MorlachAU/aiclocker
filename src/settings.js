/**
 * User preferences persistence.
 *
 * Reads and writes a tiny JSON file in the app's data directory. Kept simple
 * intentionally — Electron Store or similar is overkill for a handful of bools.
 */
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./db');

const DEFAULTS = {
  startWithWindows: false,
  // Future settings go here.
};

function getSettingsPath() {
  return path.join(getDataDir(), 'settings.json');
}

function load() {
  const file = getSettingsPath();
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch (e) { /* fall through to defaults */ }
  return { ...DEFAULTS };
}

function save(settings) {
  const file = getSettingsPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  const current = load();
  current[key] = value;
  save(current);
  return current;
}

module.exports = { load, save, get, set };
