let currentRange = 'today';
let dailyCostChart, modelChart, tokenChart, toolsChart;

const COLORS = {
  opus: '#6e40c9',
  sonnet: '#2ea043',
  haiku: '#1f6feb',
  synthetic: '#484f58',
  input: '#6e40c9',
  output: '#2ea043',
  cacheWrite: '#d29922',
  cacheRead: '#1f6feb',
  bar: '#6e40c9',
};

const MODEL_COLORS = {
  Opus: COLORS.opus,
  Sonnet: COLORS.sonnet,
  Haiku: COLORS.haiku,
};

function formatTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Chart.js global config
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
Chart.defaults.font.size = 11;

async function refreshAll() {
  const [rangeStats, activeTime, models, daily, sessions, tools, tokenTypes] = await Promise.all([
    electronAPI.getStats(currentRange),
    electronAPI.getActiveTime(currentRange),
    electronAPI.getModelBreakdown(currentRange),
    electronAPI.getDailyBreakdown(currentRange === 'all' ? 90 : 30),
    electronAPI.getSessionList(50, 0),
    electronAPI.getTopTools(currentRange, 10),
    electronAPI.getTokenTypeBreakdown(currentRange),
  ]);

  // Update cards
  document.getElementById('totalCost').textContent = '$' + rangeStats.totalCost.toFixed(2);
  document.getElementById('totalTokens').textContent = formatTokens(rangeStats.totalTokens);
  document.getElementById('activeTime').textContent = formatDuration(activeTime);
  document.getElementById('sessionCount').textContent = rangeStats.sessionCount;
  document.getElementById('messageCount').textContent = rangeStats.messageCount.toLocaleString();

  // Daily cost chart
  updateDailyCostChart(daily);

  // Model breakdown
  updateModelChart(models);

  // Token type breakdown
  updateTokenChart(tokenTypes);

  // Top tools
  updateToolsChart(tools);

  // Sessions table
  updateSessionsTable(sessions);
}

function updateDailyCostChart(daily) {
  const labels = daily.map(d => d.day);
  const data = daily.map(d => d.cost);

  if (dailyCostChart) dailyCostChart.destroy();
  dailyCostChart = new Chart(document.getElementById('dailyCostChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'API Equivalent ($)',
        data,
        backgroundColor: COLORS.bar + 'cc',
        borderRadius: 4,
        barPercentage: 0.7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => '$' + ctx.parsed.y.toFixed(2) } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => '$' + v },
          grid: { color: '#21262d' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function updateModelChart(models) {
  const labels = models.filter(m => m.totalCost > 0).map(m => m.displayName);
  const data = models.filter(m => m.totalCost > 0).map(m => m.totalCost);
  const colors = labels.map(l => MODEL_COLORS[l] || COLORS.synthetic);

  if (modelChart) modelChart.destroy();
  modelChart = new Chart(document.getElementById('modelChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: $${ctx.parsed.toFixed(2)}` } },
      },
    },
  });
}

function updateTokenChart(tokenTypes) {
  const labels = tokenTypes.map(d => d.day);

  if (tokenChart) tokenChart.destroy();
  tokenChart = new Chart(document.getElementById('tokenChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Input', data: tokenTypes.map(d => d.input_tokens), backgroundColor: COLORS.input + 'cc' },
        { label: 'Output', data: tokenTypes.map(d => d.output_tokens), backgroundColor: COLORS.output + 'cc' },
        { label: 'Cache Write', data: tokenTypes.map(d => d.cache_creation_tokens), backgroundColor: COLORS.cacheWrite + 'cc' },
        { label: 'Cache Read', data: tokenTypes.map(d => d.cache_read_tokens), backgroundColor: COLORS.cacheRead + 'cc' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatTokens(ctx.parsed.y)}` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: (v) => formatTokens(v) },
          grid: { color: '#21262d' },
        },
      },
    },
  });
}

function updateToolsChart(tools) {
  if (!tools || tools.length === 0) {
    if (toolsChart) toolsChart.destroy();
    return;
  }

  const labels = tools.map(t => t.name);
  const data = tools.map(t => t.count);

  if (toolsChart) toolsChart.destroy();
  toolsChart = new Chart(document.getElementById('toolsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: COLORS.sonnet + 'cc',
        borderRadius: 3,
        barPercentage: 0.6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: '#21262d' } },
        y: { grid: { display: false } },
      },
    },
  });
}

function updateSessionsTable(sessions) {
  const tbody = document.getElementById('sessionsBody');
  tbody.innerHTML = '';

  for (const s of sessions) {
    if (!s.message_count) continue;
    const dur = s.last_message && s.first_message
      ? s.last_message - s.first_message
      : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.title || '(untitled)'}</td>
      <td>${formatDate(s.first_message || s.created_at)}</td>
      <td>${formatDuration(dur)}</td>
      <td>${s.message_count}</td>
      <td>${formatTokens(s.total_tokens)}</td>
      <td>$${s.total_cost.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// Range picker
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.range-btn.active').classList.remove('active');
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    refreshAll();
  });
});

// About section — external links and clipboard
document.querySelectorAll('[data-url]').forEach(el => {
  el.addEventListener('click', () => {
    const url = el.dataset.url;
    if (url) electronAPI.openExternal(url);
  });
});

const copyBtn = document.getElementById('copyFeedbackBtn');
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    await electronAPI.copyToClipboard('feedback@mousewheeldigital.com');
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1500);
  });
}

// Display the real app version in the About section
(async () => {
  if (electronAPI.getAppVersion) {
    try {
      const v = await electronAPI.getAppVersion();
      const el = document.getElementById('aboutVersion');
      if (el && v) el.textContent = 'Version ' + v;
    } catch (e) { /* non-fatal */ }
  }
})();

// Initial load
refreshAll();

// Auto-refresh when window gets focus
window.addEventListener('focus', refreshAll);
