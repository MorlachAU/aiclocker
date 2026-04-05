const pricing = require('./pricing');

/**
 * Parse a single JSONL line using the supplied provider for normalization.
 * Returns a message object if the record is an assistant record with usage
 * data, or null for everything else.
 *
 * The provider normalizes field names to canonical shape, so downstream code
 * only needs to handle one set of keys: type, uuid, sessionId, timestamp,
 * cwd, message.
 */
function parseLine(line, sourceFile, isSubagent, provider) {
  let rawRecord;
  try {
    rawRecord = JSON.parse(line);
  } catch (e) {
    return null;
  }

  const record = provider.normalizeRecord(rawRecord);

  // Only assistant records carry token usage
  if (record.type !== 'assistant') return null;

  const msg = record.message;
  if (!msg || !msg.usage) return null;

  const usage = msg.usage;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const model = msg.model || rawRecord.model || 'unknown';

  // Extract tool names used in this response
  const toolsUsed = [];
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'tool_use' && block.name) {
        toolsUsed.push(block.name);
      }
    }
  }

  const cost = pricing.calculateCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);

  const timestamp = record.timestamp || new Date().toISOString();
  const timestampMs = new Date(timestamp).getTime();
  const sessionId = record.sessionId;
  const uuid = record.uuid;

  // Skip records missing required fields (e.g., malformed or partial)
  if (!uuid || !sessionId || isNaN(timestampMs)) return null;

  return {
    uuid,
    sessionId,
    timestamp,
    timestampMs,
    model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    costUsd: cost,
    cwd: record.cwd || null,
    isSubagent: isSubagent ? 1 : 0,
    sourceFile,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed.join(',') : null,
    provider: provider.name,
  };
}

module.exports = { parseLine };
