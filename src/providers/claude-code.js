/**
 * Claude Code provider.
 *
 * Tracks Anthropic's Claude Code extension. JSONL conversation logs are
 * written to ~/.claude/projects/<project-dir>/*.jsonl with matching subagent
 * logs under <project-dir>/<session-id>/subagents/*.jsonl.
 *
 * Session metadata comes from two extra sources:
 *   1. Process registry at ~/.claude/sessions/*.json (maps PID to session)
 *   2. Desktop app snapshots at %APPDATA%/Claude/claude-code-sessions/**\/local_*.json
 */
const fs = require('fs');
const path = require('path');
const Provider = require('./provider-base');

const HOME = process.env.USERPROFILE || process.env.HOME;
const APPDATA = process.env.APPDATA;

class ClaudeCodeProvider extends Provider {
  constructor() {
    super();
    this.name = 'claude-code';
    this.displayName = 'Claude Code';
    this.icon = '🧑‍💻';

    this.projectsDir = path.join(HOME, '.claude', 'projects');
    this.processRegistryDir = path.join(HOME, '.claude', 'sessions');
    this.desktopSessionsDir = path.join(APPDATA || '', 'Claude', 'claude-code-sessions');
  }

  discoverFiles() {
    const files = [];
    if (!fs.existsSync(this.projectsDir)) return files;

    const projectDirs = fs.readdirSync(this.projectsDir);
    for (const projDir of projectDirs) {
      const projPath = path.join(this.projectsDir, projDir);
      try {
        if (!fs.statSync(projPath).isDirectory()) continue;
      } catch (e) { continue; }

      const entries = fs.readdirSync(projPath);

      // Main conversation JSONL files
      for (const entry of entries) {
        if (entry.endsWith('.jsonl')) {
          files.push({ path: path.join(projPath, entry), isSubagent: false });
        }
      }

      // Subagent JSONL files in session subdirectories
      for (const entry of entries) {
        const subPath = path.join(projPath, entry, 'subagents');
        if (fs.existsSync(subPath)) {
          try {
            if (!fs.statSync(subPath).isDirectory()) continue;
            for (const agentFile of fs.readdirSync(subPath)) {
              if (agentFile.endsWith('.jsonl')) {
                files.push({ path: path.join(subPath, agentFile), isSubagent: true });
              }
            }
          } catch (e) { /* skip */ }
        }
      }
    }

    return files;
  }

  normalizeRecord(record) {
    // Claude Code uses camelCase natively, so the default implementation works.
    return super.normalizeRecord(record);
  }

  discoverSessions() {
    const sessions = [];

    // Source 1: Process registry (~/.claude/sessions/*.json)
    if (fs.existsSync(this.processRegistryDir)) {
      for (const file of fs.readdirSync(this.processRegistryDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.processRegistryDir, file), 'utf8'));
          sessions.push({
            sessionId: data.sessionId,
            cwd: data.cwd,
            createdAt: data.startedAt,
            lastActivityAt: data.startedAt,
            entrypoint: data.entrypoint || 'unknown',
          });
        } catch (e) { /* skip corrupt */ }
      }
    }

    // Source 2: Desktop app session snapshots
    if (APPDATA && fs.existsSync(this.desktopSessionsDir)) {
      const walkDir = (dir) => {
        try {
          for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              walkDir(fullPath);
            } else if (entry.startsWith('local_') && entry.endsWith('.json')) {
              try {
                const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                sessions.push({
                  sessionId: data.cliSessionId || data.sessionId,
                  title: data.title,
                  cwd: data.cwd,
                  model: data.model,
                  createdAt: data.createdAt,
                  lastActivityAt: data.lastActivityAt,
                  effort: data.effort,
                });
              } catch (e) { /* skip */ }
            }
          }
        } catch (e) { /* skip inaccessible */ }
      };
      walkDir(this.desktopSessionsDir);
    }

    return sessions;
  }

  getWatchPaths() {
    return [this.projectsDir];
  }
}

module.exports = ClaudeCodeProvider;
