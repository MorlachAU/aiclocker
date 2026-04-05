const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getDb } = require('./db');
const { parseLine } = require('./parser');
const { getAllProviders } = require('./providers');

/**
 * Discover all JSONL files across all registered providers.
 * Returns an array of { path, isSubagent, provider } objects.
 */
function discoverJsonlFiles() {
  const files = [];
  for (const provider of getAllProviders()) {
    const providerFiles = provider.discoverFiles();
    for (const f of providerFiles) {
      files.push({ ...f, provider });
    }
  }
  return files;
}

async function ingestFile(filePath, isSubagent, provider) {
  const db = getDb();
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const lastModified = stat.mtimeMs;

  // Check ingest state
  const state = db.prepare('SELECT * FROM ingest_state WHERE file_path = ?').get(filePath);

  if (state && state.file_size === fileSize && state.last_modified === Math.floor(lastModified)) {
    return { skipped: true, newRecords: 0 };
  }

  const startOffset = (state && state.bytes_read && state.bytes_read < fileSize) ? state.bytes_read : 0;

  const stream = fs.createReadStream(filePath, {
    start: startOffset,
    encoding: 'utf8',
  });

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO messages
    (uuid, session_id, timestamp, timestamp_ms, model, input_tokens, output_tokens,
     cache_creation_tokens, cache_read_tokens, cost_usd, cwd, is_subagent, source_file, tools_used, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let newRecords = 0;

  // If we're starting from an offset, the first "line" might be a partial line
  let isFirstLine = startOffset > 0;

  for await (const line of rl) {
    // Skip partial first line when resuming from offset — parseLine's
    // try/catch around JSON.parse will just return null if it's malformed
    if (isFirstLine) {
      isFirstLine = false;
    }

    const parsed = parseLine(line, filePath, isSubagent, provider);
    if (parsed) {
      insertStmt.run(
        parsed.uuid, parsed.sessionId, parsed.timestamp, parsed.timestampMs,
        parsed.model, parsed.inputTokens, parsed.outputTokens,
        parsed.cacheCreationTokens, parsed.cacheReadTokens, parsed.costUsd,
        parsed.cwd, parsed.isSubagent, parsed.sourceFile, parsed.toolsUsed,
        parsed.provider
      );
      newRecords++;
    }
  }

  // Update ingest state
  db.prepare(`
    INSERT OR REPLACE INTO ingest_state (file_path, file_size, last_modified, bytes_read)
    VALUES (?, ?, ?, ?)
  `).run(filePath, fileSize, Math.floor(lastModified), fileSize);

  return { skipped: false, newRecords };
}

async function ingestAll(onProgress) {
  const files = discoverJsonlFiles();
  let totalNew = 0;
  let totalSkipped = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) onProgress(i + 1, files.length, path.basename(file.path));

    try {
      const result = await ingestFile(file.path, file.isSubagent, file.provider);
      if (result.skipped) {
        totalSkipped++;
      } else {
        totalNew += result.newRecords;
      }
    } catch (err) {
      console.error(`Error ingesting ${file.path}: ${err.message}`);
    }
  }

  return { totalFiles: files.length, totalNew, totalSkipped };
}

module.exports = { ingestAll, ingestFile, discoverJsonlFiles };
