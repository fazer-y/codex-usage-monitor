'use strict';

const bridge = window.codexUsageMonitor;
const title = document.getElementById('title');
const reasoning = document.getElementById('reasoning');
const metrics = document.getElementById('metrics');
const rows = document.getElementById('rows');
const details = document.getElementById('details');
const expand = document.getElementById('expand');
const dock = document.getElementById('dock');
const panel = document.getElementById('panel');
let signature = '';
let latestModel = null;
let detailsSignature = '';

document.getElementById('refresh').addEventListener('click', () => bridge.refresh().then(render).catch(renderError));
document.getElementById('hide').addEventListener('click', () => bridge.hide());
expand.addEventListener('click', async () => {
  const expanded = details.hidden;
  const state = await bridge.setExpanded(expanded);
  applyWindowState(state || { expanded });
});
dock.addEventListener('click', () => bridge.setDocked(dock.getAttribute('aria-pressed') !== 'true'));
bridge.onWindowState(applyWindowState);
bridge.getWindowState().then(applyWindowState).catch(renderError);
bridge.getSnapshot().then(render).catch(renderError);
bridge.onSnapshot(render);
bridge.onTheme(applyTheme);
bridge.getTheme().then(applyTheme).catch(renderError);

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  root.style.colorScheme = theme.mode;
  const properties = { surface: '--surface', surfaceFill: '--surface-fill', text: '--text', muted: '--muted', line: '--line',
    accent: '--accent', accentText: '--accent-text', accentSoft: '--accent-soft', hover: '--hover', grip: '--grip', danger: '--danger' };
  for (const [key, property] of Object.entries(properties)) root.style.setProperty(property, theme.colors[key]);
}

function applyWindowState(state) {
  if (!state) return;
  if (typeof state.docked === 'boolean') {
    dock.setAttribute('aria-pressed', String(state.docked));
    dock.title = state.docked ? '解除吸附' : '居中吸附到 Codex 标题栏';
  }
  if (typeof state.expanded === 'boolean') {
    details.hidden = !state.expanded;
    expand.setAttribute('aria-expanded', String(state.expanded));
    expand.setAttribute('aria-label', state.expanded ? '收起用量详情' : '展开用量详情');
    expand.title = state.expanded ? '收起详情' : '展开详情';
    if (state.expanded && latestModel) renderDetails(latestModel);
  }
  if (typeof state.detailsBelow === 'boolean') panel.dataset.detailsBelow = String(state.detailsBelow);
}

function render(model) {
  if (!model) return;
  const next = JSON.stringify([model.status, model.title, model.subtitle, model.conversationTitle, model.metrics, model.rows, model.cost, model.footer]);
  if (next === signature) return;
  signature = next;
  latestModel = model;
  title.textContent = model.title || '等待会话';
  title.title = [model.title, model.subtitle].filter(Boolean).join(' · ');
  const effort = model.subtitle || '';
  const effortName = effort === 'xhigh' ? 'XHigh' : effort.charAt(0).toUpperCase() + effort.slice(1);
  reasoning.textContent = effortName;
  reasoning.hidden = !effort;
  reasoning.title = effort ? '思考强度：' + effortName : '';
  const status = document.getElementById('status');
  status.className = 'status-dot ' + (model.status === 'ready' ? '' : model.status);
  status.title = model.trackingLabel || '正在读取本地用量';
  metrics.replaceChildren(...(model.metrics || []).map(renderMetric));
  if (!details.hidden) renderDetails(model);
}

function renderDetails(model) {
  const next = JSON.stringify([model.conversationTitle, model.rows, model.cost, model.footer]);
  if (next === detailsSignature) return;
  detailsSignature = next;
  document.getElementById('conversation').textContent = model.conversationTitle || '当前会话';
  rows.replaceChildren(...(model.rows || []).map(renderRow));
  document.getElementById('cost').textContent = model.cost || '';
  document.getElementById('footer').textContent = model.footer || '';
}

function renderMetric(metric) {
  const item = document.createElement('span');
  item.className = 'metric';
  item.dataset.kind = metric.kind || '';
  item.dataset.tone = metric.kind === 'context' && metric.percent >= 90 ? 'danger' : '';
  item.title = metric.description || '';
  const label = document.createElement('span');
  const value = document.createElement('span');
  label.className = 'metric-label';
  value.className = 'metric-value';
  label.textContent = metric.label;
  value.textContent = metric.value;
  if (metric.label) item.append(label, value);
  else item.append(value);
  return item;
}

function renderRow(row) {
  const item = document.createElement('div');
  const label = document.createElement('span');
  const value = document.createElement('span');
  item.className = 'row';
  label.className = 'row-label';
  value.className = 'row-value';
  label.textContent = row.label;
  value.textContent = row.value;
  item.append(label, value);
  return item;
}

function renderError(error) {
  render({ status: 'error', title: '读取失败', rows: [{ label: '状态', value: error?.message || '暂时无法读取统计' }] });
}
