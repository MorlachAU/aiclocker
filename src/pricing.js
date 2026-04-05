// Anthropic pricing per 1M tokens (as of April 2026)
// https://docs.anthropic.com/en/docs/about-claude/models
const PRICING = {
  'claude-opus-4-6': {
    input: 15.00,
    output: 75.00,
    cacheWrite: 18.75,
    cacheRead: 1.50,
  },
  'claude-sonnet-4-6': {
    input: 3.00,
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30,
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4.00,
    cacheWrite: 1.00,
    cacheRead: 0.08,
  },
};

// Aliases — model strings may appear with suffixes
const ALIASES = {
  'claude-opus-4-6[1m]': 'claude-opus-4-6',
  'claude-sonnet-4-6[1m]': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
};

function resolveModel(model) {
  if (PRICING[model]) return model;
  if (ALIASES[model]) return ALIASES[model];

  // Fuzzy match: if the model string contains a known key
  for (const key of Object.keys(PRICING)) {
    if (model.includes(key)) return key;
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (model.includes(alias)) return key;
  }

  return null;
}

function calculateCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
  const resolved = resolveModel(model);
  if (!resolved) return 0; // Unknown model (e.g., <synthetic>)

  const p = PRICING[resolved];
  const cost =
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output +
    (cacheCreationTokens / 1_000_000) * p.cacheWrite +
    (cacheReadTokens / 1_000_000) * p.cacheRead;

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

function getModelDisplayName(model) {
  const resolved = resolveModel(model);
  if (!resolved) return model;
  if (resolved.includes('opus')) return 'Opus';
  if (resolved.includes('sonnet')) return 'Sonnet';
  if (resolved.includes('haiku')) return 'Haiku';
  return resolved;
}

module.exports = { calculateCost, resolveModel, getModelDisplayName, PRICING };
