const { getDb } = require('./db');
const { getAllProviders } = require('./providers');

/**
 * Resolve session metadata by merging two layers:
 *   1. Messages already ingested (provides timestamps, model, cwd, provider)
 *   2. Provider-specific session sources via provider.discoverSessions()
 *      (e.g., process registries, desktop snapshots)
 *
 * Later layer overrides earlier for overlapping truthy fields.
 * Writes the merged result into the sessions table.
 */
function resolveSessions() {
  const db = getDb();

  // Layer 1: Base session records from ingested messages
  const msgSessions = db.prepare(`
    SELECT
      session_id,
      MIN(timestamp_ms) as first_msg,
      MAX(timestamp_ms) as last_msg,
      model,
      cwd,
      provider
    FROM messages
    GROUP BY session_id
  `).all();

  const sessionMap = new Map();

  for (const s of msgSessions) {
    sessionMap.set(s.session_id, {
      sessionId: s.session_id,
      title: null,
      cwd: s.cwd,
      model: s.model,
      createdAt: s.first_msg,
      lastActivityAt: s.last_msg,
      entrypoint: null,
      effort: null,
      provider: s.provider || 'claude-code',
    });
  }

  // Layer 2: Ask each provider for extra metadata
  for (const provider of getAllProviders()) {
    const providerSessions = provider.discoverSessions();
    for (const s of providerSessions) {
      if (!s.sessionId) continue;

      const existing = sessionMap.get(s.sessionId);
      if (existing) {
        if (s.title) existing.title = s.title;
        if (s.model) existing.model = s.model;
        if (s.cwd && !existing.cwd) existing.cwd = s.cwd;
        if (s.entrypoint) existing.entrypoint = s.entrypoint;
        if (s.effort) existing.effort = s.effort;
        if (s.createdAt && (!existing.createdAt || s.createdAt < existing.createdAt)) {
          existing.createdAt = s.createdAt;
        }
        if (s.lastActivityAt && s.lastActivityAt > existing.lastActivityAt) {
          existing.lastActivityAt = s.lastActivityAt;
        }
      } else {
        sessionMap.set(s.sessionId, {
          sessionId: s.sessionId,
          title: s.title || null,
          cwd: s.cwd || null,
          model: s.model || null,
          createdAt: s.createdAt || null,
          lastActivityAt: s.lastActivityAt || s.createdAt || null,
          entrypoint: s.entrypoint || null,
          effort: s.effort || null,
          provider: provider.name,
        });
      }
    }
  }

  // Write to DB
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO sessions
    (session_id, title, cwd, model, created_at, last_activity_at, entrypoint, effort, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of sessionMap.values()) {
    upsert.run(
      s.sessionId, s.title, s.cwd, s.model,
      s.createdAt, s.lastActivityAt, s.entrypoint, s.effort, s.provider
    );
  }

  return sessionMap.size;
}

module.exports = { resolveSessions };
