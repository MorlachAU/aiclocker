// Minimal static server for previewing dashboard/ during development.
// Stubs window.electronAPI so Chart.js renders with fake data.
// Usage: node scripts/preview-server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dashboard');
const port = 3900;

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Injected before dashboard.js loads — gives it fake data so charts render.
const stub = `<script>
window.electronAPI = {
  getStats: async () => ({
    messageCount: 12981, totalInput: 5000000, totalOutput: 2000000,
    totalCacheWrite: 400000000, totalCacheRead: 900000000,
    totalTokens: 1400000000, totalCost: 1498.91, sessionCount: 8,
  }),
  getActiveTime: async () => 47 * 60 * 1000,
  getModelBreakdown: async () => [
    { model: 'claude-opus-4-6', displayName: 'Opus', messageCount: 3167, totalTokens: 677824565, totalCost: 1220.06 },
    { model: 'claude-sonnet-4-6', displayName: 'Sonnet', messageCount: 8737, totalTokens: 791968667, totalCost: 347.63 },
    { model: 'claude-haiku-4-5-20251001', displayName: 'Haiku', messageCount: 1202, totalTokens: 67293820, totalCost: 14.33 },
  ],
  getDailyBreakdown: async () => [
    { day: '2026-03-28', tokens: 42000000, cache_tokens: 150000000, cost: 42.87, messages: 1030, sessions: 1 },
    { day: '2026-03-29', tokens: 105000000, cache_tokens: 300000000, cost: 103.50, messages: 2697, sessions: 1 },
    { day: '2026-03-30', tokens: 12000000, cache_tokens: 50000000, cost: 13.82, messages: 423, sessions: 1 },
    { day: '2026-03-31', tokens: 65000000, cache_tokens: 200000000, cost: 71.48, messages: 2046, sessions: 2 },
    { day: '2026-04-01', tokens: 18000000, cache_tokens: 70000000, cost: 18.44, messages: 407, sessions: 1 },
    { day: '2026-04-02', tokens: 320000000, cache_tokens: 500000000, cost: 344.40, messages: 1915, sessions: 2 },
    { day: '2026-04-03', tokens: 110000000, cache_tokens: 400000000, cost: 129.66, messages: 2026, sessions: 3 },
    { day: '2026-04-04', tokens: 550000000, cache_tokens: 800000000, cost: 602.87, messages: 1798, sessions: 4 },
    { day: '2026-04-05', tokens: 200000000, cache_tokens: 600000000, cost: 254.25, messages: 757, sessions: 2 },
  ],
  getTokenTypeBreakdown: async () => [
    { day: '2026-03-28', input_tokens: 500000, output_tokens: 200000, cache_creation_tokens: 20000000, cache_read_tokens: 130000000 },
    { day: '2026-03-29', input_tokens: 1200000, output_tokens: 500000, cache_creation_tokens: 50000000, cache_read_tokens: 250000000 },
    { day: '2026-03-30', input_tokens: 200000, output_tokens: 100000, cache_creation_tokens: 10000000, cache_read_tokens: 40000000 },
    { day: '2026-03-31', input_tokens: 800000, output_tokens: 300000, cache_creation_tokens: 30000000, cache_read_tokens: 170000000 },
    { day: '2026-04-01', input_tokens: 300000, output_tokens: 100000, cache_creation_tokens: 15000000, cache_read_tokens: 55000000 },
    { day: '2026-04-02', input_tokens: 3000000, output_tokens: 1500000, cache_creation_tokens: 100000000, cache_read_tokens: 400000000 },
    { day: '2026-04-03', input_tokens: 1500000, output_tokens: 600000, cache_creation_tokens: 80000000, cache_read_tokens: 320000000 },
    { day: '2026-04-04', input_tokens: 4000000, output_tokens: 2000000, cache_creation_tokens: 200000000, cache_read_tokens: 600000000 },
    { day: '2026-04-05', input_tokens: 2000000, output_tokens: 800000, cache_creation_tokens: 120000000, cache_read_tokens: 480000000 },
  ],
  getSessionList: async () => [
    { session_id: '1', title: 'YSS Dev 2 Development Session', cwd: 'E:/Dev/yss', model: 'claude-opus-4-6', effort: 'high', provider: 'claude-code', created_at: 1775600000000, last_activity_at: 1775620000000, entrypoint: 'claude-desktop', message_count: 987, total_tokens: 120000000, total_cost: 365.94, first_message: 1775600000000, last_message: 1775620000000 },
    { session_id: '2', title: 'YSS Development Work', cwd: 'E:/Dev/yss', model: 'claude-opus-4-6', effort: 'high', provider: 'claude-code', created_at: 1775550000000, last_activity_at: 1775580000000, entrypoint: 'claude-desktop', message_count: 914, total_tokens: 100000000, total_cost: 255.87, first_message: 1775550000000, last_message: 1775580000000 },
    { session_id: '3', title: 'Display Manager Project Setup', cwd: 'E:/Dev/display', model: 'claude-opus-4-6', effort: 'medium', provider: 'claude-code', created_at: 1775400000000, last_activity_at: 1775460000000, entrypoint: 'claude-desktop', message_count: 1034, total_tokens: 150000000, total_cost: 362.30, first_message: 1775400000000, last_message: 1775460000000 },
    { session_id: '4', title: 'WithWhat Dev', cwd: 'E:/Dev/withwhat', model: 'claude-sonnet-4-6', effort: 'medium', provider: 'claude-code', created_at: 1775000000000, last_activity_at: 1775600000000, entrypoint: 'claude-desktop', message_count: 9334, total_tokens: 800000000, total_cost: 355.24, first_message: 1775000000000, last_message: 1775600000000 },
  ],
  getTopTools: async () => [
    { name: 'Bash', count: 234 },
    { name: 'Edit', count: 189 },
    { name: 'Read', count: 156 },
    { name: 'Write', count: 98 },
    { name: 'Grep', count: 87 },
    { name: 'Glob', count: 62 },
    { name: 'TodoWrite', count: 45 },
    { name: 'Task', count: 32 },
  ],
  getOverallStats: async () => ({ total_messages: 12981, total_sessions: 8, total_tokens: 1485657368, total_cost: 1498.91 }),
};
</script>`;

http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(root, url);

  // Security: no path traversal
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });

    // Inject the electronAPI stub into index.html before dashboard.js loads
    if (ext === '.html') {
      const html = data.toString().replace('<script src="chart.min.js"></script>', stub + '\n  <script src="chart.min.js"></script>');
      res.end(html);
    } else {
      res.end(data);
    }
  });
}).listen(port, () => {
  console.log(`[preview] dashboard serving at http://localhost:${port}/`);
});
