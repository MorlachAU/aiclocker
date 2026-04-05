/**
 * Provider registry.
 *
 * Instantiates all enabled providers. To add a new provider:
 *   1. Create src/providers/your-provider.js extending Provider
 *   2. Import it here
 *   3. Add an instance to the providers array
 *
 * Order doesn't matter — the registry is consumed in full by the ingester,
 * watcher, and session resolver.
 */
const ClaudeCodeProvider = require('./claude-code');
const CoWorkProvider = require('./cowork');

let providersInstance = null;

function getAllProviders() {
  if (providersInstance) return providersInstance;

  providersInstance = [
    new ClaudeCodeProvider(),
    new CoWorkProvider(),
    // Add new providers here:
    // new CursorProvider(),
    // new CopilotProvider(),
  ];

  return providersInstance;
}

function getProviderByName(name) {
  return getAllProviders().find(p => p.name === name) || null;
}

module.exports = { getAllProviders, getProviderByName };
