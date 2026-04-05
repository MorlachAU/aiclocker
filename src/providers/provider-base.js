/**
 * Provider base class — all AI tool providers extend this.
 *
 * A provider encapsulates everything AIClocker needs to know about a specific
 * AI coding tool: where it stores its JSONL logs, how to read field names
 * out of records, and any extra session metadata sources.
 *
 * Adding a new provider = creating a new file in src/providers/ that extends
 * this class and overrides the relevant methods, then registering it in
 * src/providers/index.js.
 */
class Provider {
  constructor() {
    // Override in subclass:
    this.name = 'unnamed';        // unique id, e.g. 'claude-code'
    this.displayName = 'Unnamed'; // user-facing label, e.g. 'Claude Code'
    this.icon = '';               // emoji or short label for UI
  }

  /**
   * Discover all JSONL files that this provider should parse.
   * Returns an array of { path, isSubagent } objects.
   * Override in subclass.
   */
  discoverFiles() {
    return [];
  }

  /**
   * Normalize a raw JSONL record into the canonical shape the parser expects.
   *
   * Canonical fields:
   *   - type: 'assistant' | 'user' | 'system' | etc.
   *   - uuid: unique message id
   *   - sessionId: session id (normalized from session_id etc.)
   *   - timestamp: ISO 8601 string (normalized from _audit_timestamp etc.)
   *   - cwd: working directory (optional)
   *   - message: { model, content, usage } — passed through as-is
   *
   * The default implementation assumes Claude Code camelCase field names.
   * Override in subclass for other naming conventions.
   */
  normalizeRecord(record) {
    return {
      type: record.type,
      uuid: record.uuid,
      sessionId: record.sessionId || record.session_id,
      timestamp: record.timestamp || record._audit_timestamp,
      cwd: record.cwd || null,
      message: record.message,
    };
  }

  /**
   * Discover additional session metadata from non-JSONL sources
   * (e.g. process registries, desktop app snapshots).
   *
   * Returns an array of session objects:
   *   { sessionId, title?, cwd?, model?, createdAt?, lastActivityAt?, entrypoint?, effort? }
   *
   * Override in subclass if the provider has such sources.
   * Default returns empty array (no extra sources).
   */
  discoverSessions() {
    return [];
  }

  /**
   * Return the directories that should be watched for file changes.
   * The watcher uses these to know when to trigger re-ingestion.
   *
   * Returns an array of absolute directory paths.
   * Override in subclass.
   */
  getWatchPaths() {
    return [];
  }
}

module.exports = Provider;
