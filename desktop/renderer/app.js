'use strict';

const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');
const metrics = document.getElementById('metrics');
const rows = document.getElementById('rows');
const cost = document.getElementById('cost');
const footer = document.getElementById('footer');
const refresh = document.getElementById('refresh');

refresh.addEventListener('click', () => {
  window.codexUsageMonitor.refresh().then(render).catch(renderError);
});

window.codexUsageMonitor.getSnapshot().then(render).catch(renderError);
window.codexUsageMonitor.onSnapshot(render);

function render(model) {
  if (!model) return;
  title.textContent = model.title || 'Waiting for Codex usage';
  subtitle.textContent = model.subtitle || '';
  cost.textContent = model.cost || '';
  footer.textContent = model.footer || 'Local files only. No network or model calls.';

  metrics.replaceChildren(...(model.metrics || []).map(renderMetric));
  rows.replaceChildren(...(model.rows || []).map(renderRow));
}

function renderMetric(metric) {
  const item = document.createElement('article');
  const label = document.createElement('div');
  const value = document.createElement('div');
  const bar = document.createElement('div');
  const fill = document.createElement('div');

  item.className = 'metric';
  label.className = 'metric-label';
  value.className = 'metric-value';
  bar.className = 'bar';
  fill.className = `bar-fill ${barTone(metric.percent)}`.trim();

  label.textContent = metric.label || '';
  value.textContent = metric.value || '';
  fill.style.width = `${Math.max(0, Math.min(100, metric.percent || 0))}%`;

  bar.append(fill);
  item.append(label, value, bar);
  return item;
}

function renderRow(row) {
  const item = document.createElement('div');
  const label = document.createElement('div');
  const value = document.createElement('div');

  item.className = 'row';
  label.className = 'row-label';
  value.className = 'row-value';
  label.textContent = row.label || '';
  value.textContent = row.value || '';

  item.append(label, value);
  return item;
}

function barTone(percent) {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warn';
  return '';
}

function renderError(error) {
  render({
    title: 'Monitor error',
    subtitle: error && error.message ? error.message : 'Unable to load usage.',
    metrics: [],
    rows: [],
    cost: '',
    footer: 'Local files only. No network or model calls.',
  });
}
