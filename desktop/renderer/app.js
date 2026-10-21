'use strict';

const bridge = window.codexUsageMonitor;
const { translator, resolveLocale } = window.codexUsageI18n;
let locale = 'en';
let t = translator(locale);
const title = document.getElementById('title');
const reasoning = document.getElementById('reasoning');
const metrics = document.getElementById('metrics');
const rows = document.getElementById('rows');
const details = document.getElementById('details');
const expand = document.getElementById('expand');
const dock = document.getElementById('dock');
const panel = document.getElementById('panel');
const strip = document.getElementById('strip');
const restore = document.getElementById('restore');
let folded = false;
let signature = '';
let latestModel = null;
let detailsSignature = '';

document.getElementById('refresh').addEventListener('click', () => bridge.refresh().then(render).catch(renderError));
document.getElementById('fold').addEventListener('click', () => bridge.setFolded(true).then(applyWindowState).catch(renderError));
restore.addEventListener('click', () => bridge.setFolded(false).then(applyWindowState).catch(renderError));
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
  const nextLocale = resolveLocale(theme.locale);
  if (nextLocale !== locale) {
    locale = nextLocale;
    t = translator(locale);
    root.lang = locale;
    for (const [id, key] of [['refresh', 'refresh'], ['fold', 'foldStrip'], ['restore', 'expandStrip']]) {
      const element = document.getElementById(id);
      element.title = t(key);
      element.setAttribute('aria-label', t(key));
    }
    details.setAttribute('aria-label', t('detailsLabel'));
    strip.setAttribute('aria-label', t('stripLabel'));
    dock.setAttribute('aria-label', t('dockTitlebar'));
    document.getElementById('modelGroup').title = t('dragStrip');
    if (!latestModel) title.textContent = t('waiting');
    applyWindowState({ docked: dock.getAttribute('aria-pressed') === 'true', expanded: !details.hidden });
    if (latestModel && !folded) renderStrip(latestModel);
  }
  root.style.colorScheme = theme.mode;
  const properties = { surfaceFill: '--surface-fill', text: '--text', muted: '--muted', line: '--line',
    accent: '--accent', accentText: '--accent-text', accentSoft: '--accent-soft', hover: '--hover', grip: '--grip', danger: '--danger' };
  for (const [key, property] of Object.entries(properties)) root.style.setProperty(property, theme.colors[key]);
}

function applyWindowState(state) {
  if (!state) return;
  if (typeof state.folded === 'boolean') {
    const wasFolded = folded;
    folded = state.folded;
    panel.dataset.folded = String(folded);
    strip.hidden = folded;
    restore.hidden = !folded;
    if (folded) {
      details.hidden = true;
      expand.setAttribute('aria-expanded', 'false');
    } else if (wasFolded && latestModel) renderStrip(latestModel);
  }
  if (typeof state.docked === 'boolean') {
    dock.setAttribute('aria-pressed', String(state.docked));
    dock.title = t(state.docked ? 'detach' : 'dockTitlebar');
  }
  if (typeof state.expanded === 'boolean') {
    const expanded = state.expanded && !folded;
    details.hidden = !expanded;
    expand.setAttribute('aria-expanded', String(expanded));
    expand.setAttribute('aria-label', t(expanded ? 'collapseDetails' : 'expandDetails'));
    expand.title = t(expanded ? 'collapseDetails' : 'expandDetails');
    if (expanded && latestModel) renderDetails(latestModel);
  }
  if (typeof state.detailsBelow === 'boolean') panel.dataset.detailsBelow = String(state.detailsBelow);
}

function render(model) {
  if (!model) return;
  const next = JSON.stringify([model.status, model.title, model.subtitle, model.conversationTitle, model.metrics, model.rows, model.cost, model.footer]);
  if (next === signature) return;
  signature = next;
  latestModel = model;
  if (folded) return;
  renderStrip(model);
  if (!details.hidden) renderDetails(model);
}

function renderStrip(model) {
  title.textContent = model.title || t('waiting');
  title.title = [model.title, model.subtitle].filter(Boolean).join(' · ');
  const effort = model.subtitle || '';
  const effortName = effort === 'xhigh' ? 'XHigh' : effort.charAt(0).toUpperCase() + effort.slice(1);
  reasoning.textContent = effortName;
  reasoning.hidden = !effort;
  reasoning.title = effort ? t('reasoning', { effort: effortName }) : '';
  const status = document.getElementById('status');
  status.className = 'status-dot ' + (model.status === 'ready' ? '' : model.status);
  status.title = model.trackingLabel || t('readingUsage');
  metrics.replaceChildren(...(model.metrics || []).map(renderMetric));
}

function renderDetails(model) {
  const next = JSON.stringify([model.conversationTitle, model.rows, model.cost, model.footer]);
  if (next === detailsSignature) return;
  detailsSignature = next;
  document.getElementById('conversation').textContent = model.conversationTitle || t('currentConversation');
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
  render({ status: 'error', title: t('readFailed'), rows: [{ label: t('status'), value: error?.message || t('unavailable') }] });
}
