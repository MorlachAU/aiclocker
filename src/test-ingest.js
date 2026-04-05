// Quick test: run data ingestion and print stats
// Usage: node src/test-ingest.js

const { getDb, closeDb } = require('./db');
const { ingestAll } = require('./ingest');
const { resolveSessions } = require('./session-resolver');
const stats = require('./stats');

async function main() {
  console.log('Initializing database...');
  getDb();

  console.log('Ingesting JSONL files...');
  const result = await ingestAll((i, total, name) => {
    process.stdout.write(`  [${i}/${total}] ${name}\r`);
  });
  console.log(`\nIngestion complete: ${result.totalNew} new records from ${result.totalFiles} files (${result.totalSkipped} skipped)`);

  console.log('\nResolving sessions...');
  const sessionCount = resolveSessions();
  console.log(`Resolved ${sessionCount} sessions`);

  console.log('\n=== OVERALL ===');
  const overall = stats.getOverallStats();
  console.log(`  Messages: ${overall.total_messages}`);
  console.log(`  Sessions: ${overall.total_sessions}`);
  console.log(`  Tokens: ${overall.total_tokens.toLocaleString()}`);
  console.log(`  Cost: $${overall.total_cost.toFixed(2)}`);
  if (overall.first_ever) {
    console.log(`  First: ${new Date(overall.first_ever).toLocaleDateString()}`);
    console.log(`  Last: ${new Date(overall.last_ever).toLocaleDateString()}`);
  }

  console.log('\n=== TODAY ===');
  const { startMs, endMs } = stats.getTodayRange();
  const today = stats.getRangeStats(startMs, endMs);
  console.log(`  Messages: ${today.messageCount}`);
  console.log(`  Tokens: ${today.totalTokens.toLocaleString()}`);
  console.log(`  Cost: $${today.totalCost.toFixed(2)}`);

  const activeMs = stats.getActiveTimeEstimate(startMs, endMs);
  const activeMin = Math.round(activeMs / 60000);
  console.log(`  Active time: ${Math.floor(activeMin / 60)}h ${activeMin % 60}m`);

  console.log('\n=== MODEL BREAKDOWN (ALL TIME) ===');
  const models = stats.getModelBreakdown(0, Date.now());
  for (const m of models) {
    console.log(`  ${m.displayName}: ${m.messageCount} msgs, ${m.totalTokens.toLocaleString()} tokens, $${m.totalCost.toFixed(2)}`);
  }

  console.log('\n=== SESSIONS ===');
  const sessions = stats.getSessionList(10, 0);
  for (const s of sessions) {
    const title = s.title || '(untitled)';
    const dur = s.last_message && s.first_message
      ? Math.round((s.last_message - s.first_message) / 60000)
      : 0;
    console.log(`  ${title} | ${s.message_count} msgs | $${s.total_cost.toFixed(2)} | ${Math.floor(dur/60)}h ${dur%60}m`);
  }

  console.log('\n=== DAILY BREAKDOWN (LAST 14 DAYS) ===');
  const daily = stats.getDailyBreakdown(14);
  for (const d of daily) {
    console.log(`  ${d.day}: ${d.messages} msgs, $${d.cost.toFixed(2)}, ${d.sessions} sessions`);
  }

  closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
