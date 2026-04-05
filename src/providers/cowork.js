/**
 * Claude Co-Work provider.
 *
 * Tracks Anthropic's Claude Co-Work feature in the Claude Desktop app.
 * Logs are written to %APPDATA%/Claude/local-agent-mode-sessions/**\/*.jsonl
 *
 * Notable quirk: Co-Work's audit.jsonl files use snake_case field names
 * (session_id, _audit_timestamp) instead of Claude Code's camelCase
 * (sessionId, timestamp). normalizeRecord handles both.
 */
const fs = require('fs');
const path = require('path');
const Provider = require('./provider-base');

const APPDATA = process.env.APPDATA;

class CoWorkProvider extends Provider {
  constructor() {
    super();
    this.name = 'cowork';
    this.displayName = 'Claude Co-Work';
    this.icon = '🤝';

    this.sessionsDir = APPDATA
      ? path.join(APPDATA, 'Claude', 'local-agent-mode-sessions')
      : null;
  }

  discoverFiles() {
    const files = [];
    if (!this.sessionsDir || !fs.existsSync(this.sessionsDir)) return files;

    const walk = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, entry);
          let stat;
          try { stat = fs.statSync(fullPath); } catch (e) { continue; }
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (entry.endsWith('.jsonl')) {
            files.push({ path: fullPath, isSubagent: false });
          }
        }
      } catch (e) { /* skip inaccessible */ }
    };

    walk(this.sessionsDir);
    return files;
  }

  normalizeRecord(record) {
    // Co-Work audit.jsonl uses snake_case. Handle both naming conventions.
    return {
      type: record.type,
      uuid: record.uuid,
      sessionId: record.sessionId || record.session_id,
      timestamp: record.timestamp || record._audit_timestamp,
      cwd: record.cwd || null,
      message: record.message,
    };
  }

  discoverSessions() {
    // Co-Work has no external metadata sources — all session info is
    // derived from the JSONL records themselves.
    return [];
  }

  getWatchPaths() {
    return this.sessionsDir ? [this.sessionsDir] : [];
  }
}

module.exports = CoWorkProvider;
