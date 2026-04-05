const { getDb } = require('./db');
const pricing = require('./pricing');

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { startMs: start.getTime(), endMs: now.getTime() };
}

function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return { startMs: monday.getTime(), endMs: now.getTime() };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startMs: start.getTime(), endMs: now.getTime() };
}

// Helper to build a WHERE clause with optional provider filter.
function buildWhere(startMs, endMs, providerFilter) {
  const parts = ['timestamp_ms >= ?', 'timestamp_ms <= ?'];
  const params = [startMs, endMs];
  if (providerFilter) {
    parts.push('provider = ?');
    params.push(providerFilter);
  }
  return { sql: 'WHERE ' + parts.join(' AND '), params };
}

function getRangeStats(startMs, endMs, providerFilter = null) {
  const db = getDb();
  const { sql, params } = buildWhere(startMs, endMs, providerFilter);
  const row = db.prepare(`
    SELECT
      COUNT(*) as message_count,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(cache_creation_tokens), 0) as total_cache_write,
      COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(DISTINCT session_id) as session_count
    FROM messages
    ${sql}
  `).get(...params);

  return {
    messageCount: row.message_count,
    totalInput: row.total_input,
    totalOutput: row.total_output,
    totalCacheWrite: row.total_cache_write,
    totalCacheRead: row.total_cache_read,
    totalTokens: row.total_input + row.total_output + row.total_cache_write + row.total_cache_read,
    totalCost: row.total_cost,
    sessionCount: row.session_count,
  };
}

function getModelBreakdown(startMs, endMs, providerFilter = null) {
  const db = getDb();
  const { sql, params } = buildWhere(startMs, endMs, providerFilter);
  const rows = db.prepare(`
    SELECT
      model,
      COUNT(*) as message_count,
      COALESCE(SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost
    FROM messages
    ${sql}
    GROUP BY model
    ORDER BY total_cost DESC
  `).all(...params);

  return rows.map(r => ({
    model: r.model,
    displayName: pricing.getModelDisplayName(r.model),
    messageCount: r.message_count,
    totalTokens: r.total_tokens,
    totalCost: r.total_cost,
  }));
}

function getProviderBreakdown(startMs, endMs) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      provider,
      COUNT(*) as message_count,
      COALESCE(SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(DISTINCT session_id) as session_count
    FROM messages
    WHERE timestamp_ms >= ? AND timestamp_ms <= ?
    GROUP BY provider
    ORDER BY total_cost DESC
  `).all(startMs, endMs);

  return rows;
}

function getDailyBreakdown(days, providerFilter = null) {
  const db = getDb();
  const endMs = Date.now();
  const startMs = endMs - (days * 24 * 60 * 60 * 1000);
  const { sql, params } = buildWhere(startMs, endMs, providerFilter);

  const rows = db.prepare(`
    SELECT
      date(datetime(timestamp_ms / 1000, 'unixepoch', 'localtime')) as day,
      COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
      COALESCE(SUM(cache_creation_tokens + cache_read_tokens), 0) as cache_tokens,
      COALESCE(SUM(cost_usd), 0) as cost,
      COUNT(*) as messages,
      COUNT(DISTINCT session_id) as sessions
    FROM messages
    ${sql}
    GROUP BY day
    ORDER BY day ASC
  `).all(...params);

  return rows;
}

function getTokenTypeBreakdown(startMs, endMs, providerFilter = null) {
  const db = getDb();
  const { sql, params } = buildWhere(startMs, endMs, providerFilter);
  const rows = db.prepare(`
    SELECT
      date(datetime(timestamp_ms / 1000, 'unixepoch', 'localtime')) as day,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens
    FROM messages
    ${sql}
    GROUP BY day
    ORDER BY day ASC
  `).all(...params);

  return rows;
}

function getSessionList(limit, offset, providerFilter = null) {
  const db = getDb();
  const whereClause = providerFilter ? 'WHERE s.provider = ?' : '';
  const params = [];
  if (providerFilter) params.push(providerFilter);
  params.push(limit || 50, offset || 0);

  const rows = db.prepare(`
    SELECT
      s.session_id, s.title, s.cwd, s.model, s.effort, s.provider,
      s.created_at, s.last_activity_at, s.entrypoint,
      COALESCE(m.message_count, 0) as message_count,
      COALESCE(m.total_tokens, 0) as total_tokens,
      COALESCE(m.total_cost, 0) as total_cost,
      COALESCE(m.first_msg, s.created_at) as first_message,
      COALESCE(m.last_msg, s.last_activity_at) as last_message
    FROM sessions s
    LEFT JOIN (
      SELECT
        session_id,
        COUNT(*) as message_count,
        SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) as total_tokens,
        SUM(cost_usd) as total_cost,
        MIN(timestamp_ms) as first_msg,
        MAX(timestamp_ms) as last_msg
      FROM messages
      GROUP BY session_id
    ) m ON s.session_id = m.session_id
    ${whereClause}
    ORDER BY COALESCE(m.last_msg, s.last_activity_at) DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  return rows;
}

function getSessionStats(sessionId) {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) as message_count,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(cache_creation_tokens), 0) as total_cache_write,
      COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      MIN(timestamp_ms) as first_msg,
      MAX(timestamp_ms) as last_msg
    FROM messages
    WHERE session_id = ?
  `).get(sessionId);
}

function getActiveTimeEstimate(startMs, endMs, providerFilter = null) {
  const db = getDb();
  const { sql, params } = buildWhere(startMs, endMs, providerFilter);
  const rows = db.prepare(`
    SELECT timestamp_ms FROM messages
    ${sql}
    ORDER BY timestamp_ms ASC
  `).all(...params);

  if (rows.length < 2) return rows.length > 0 ? 60000 : 0;

  const IDLE_THRESHOLD = 5 * 60 * 1000;
  let activeMs = 0;

  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].timestamp_ms - rows[i - 1].timestamp_ms;
    if (gap <= IDLE_THRESHOLD) {
      activeMs += gap;
    } else {
      activeMs += 60000;
    }
  }
  activeMs += 60000;

  return activeMs;
}

function getOverallStats() {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) as total_messages,
      COUNT(DISTINCT session_id) as total_sessions,
      COALESCE(SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      MIN(timestamp_ms) as first_ever,
      MAX(timestamp_ms) as last_ever
    FROM messages
  `).get();
}

function getTopTools(startMs, endMs, limit, providerFilter = null) {
  const db = getDb();
  const { sql, params } = buildWhere(startMs, endMs, providerFilter);
  const rows = db.prepare(`
    SELECT tools_used FROM messages
    ${sql} AND tools_used IS NOT NULL
  `).all(...params);

  const toolCounts = {};
  for (const row of rows) {
    for (const tool of row.tools_used.split(',')) {
      const t = tool.trim();
      if (t) toolCounts[t] = (toolCounts[t] || 0) + 1;
    }
  }

  return Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 10)
    .map(([name, count]) => ({ name, count }));
}

module.exports = {
  getTodayRange, getWeekRange, getMonthRange,
  getRangeStats, getModelBreakdown, getProviderBreakdown, getDailyBreakdown,
  getTokenTypeBreakdown, getSessionList, getSessionStats,
  getActiveTimeEstimate, getOverallStats, getTopTools,
};
