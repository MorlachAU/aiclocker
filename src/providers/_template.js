/**
 * Provider template — copy this file and rename it to add a new AI tool.
 *
 * Steps to add a new provider:
 *   1. Copy this file to src/providers/your-tool.js
 *   2. Rename the class (e.g. CursorProvider)
 *   3. Fill in name, displayName, icon
 *   4. Implement discoverFiles(), normalizeRecord(), discoverSessions(), getWatchPaths()
 *   5. Register in src/providers/index.js
 *   6. Add pricing entries to src/pricing.js for any new models
 *
 * Only implement what the tool actually stores locally. If the tool has no
 * extra session metadata beyond the JSONL records, leave discoverSessions()
 * returning an empty array.
 */
const fs = require('fs');
const path = require('path');
const Provider = require('./provider-base');

class TemplateProvider extends Provider {
  constructor() {
    super();
    this.name = 'template';           // unique id, lowercase-hyphenated
    this.displayName = 'Template';    // user-facing label
    this.icon = '📝';                  // emoji for the UI
  }

  /**
   * Return all JSONL files this provider should parse.
   * Each file: { path: <absolute>, isSubagent: false }
   */
  discoverFiles() {
    const files = [];
    // Example: scan a directory for .jsonl files
    // const dir = path.join(process.env.APPDATA, 'YourTool', 'logs');
    // if (fs.existsSync(dir)) {
    //   for (const f of fs.readdirSync(dir)) {
    //     if (f.endsWith('.jsonl')) {
    //       files.push({ path: path.join(dir, f), isSubagent: false });
    //     }
    //   }
    // }
    return files;
  }

  /**
   * Transform a raw JSONL record into the canonical shape the parser expects:
   *   { type, uuid, sessionId, timestamp, cwd, message: { model, content, usage } }
   *
   * The `usage` object inside `message` must have these keys for token tracking:
   *   input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens
   */
  normalizeRecord(record) {
    // Example: if your tool uses different field names, map them here
    return {
      type: record.role === 'assistant' ? 'assistant' : record.type,
      uuid: record.id || record.uuid,
      sessionId: record.conversation_id || record.sessionId,
      timestamp: record.created_at || record.timestamp,
      cwd: record.working_directory || null,
      message: {
        model: record.model,
        content: record.content,
        usage: record.usage,
      },
    };
  }

  /**
   * Optional: provide extra session metadata from sources beyond the JSONL files.
   * Useful if your tool stores session titles, user preferences, etc. in separate files.
   */
  discoverSessions() {
    return [];
  }

  /**
   * Return the directories to watch for changes.
   * The watcher will trigger re-ingestion when any .jsonl file in these
   * directories (or subdirectories) is modified.
   */
  getWatchPaths() {
    return [];
  }
}

module.exports = TemplateProvider;
