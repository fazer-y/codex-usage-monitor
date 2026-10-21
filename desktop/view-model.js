'use strict';

const { formatTokens, formatUsd } = require('../lib/format');
const { ratesForModel, pricingMetadata } = require('../lib/pricing');
const { translator, resolveLocale } = require('./i18n');

function snapshotToViewModel(snapshot, now = Date.now(), locale = 'en') {
  locale = resolveLocale(locale);
  const t = translator(locale);
  const trackingLabel = t(snapshot?.selection?.mode === 'desktop' ? 'followCurrent' : 'recentActivity');
  if (!snapshot || snapshot.status !== 'ready' || !snapshot.summary) {
    return {
      locale, status: snapshot?.status || 'waiting', title: t('waiting'), subtitle: '', conversationTitle: snapshot?.conversationTitle || '',
      metrics: [], rows: snapshot?.message ? [{ label: t('status'), value: snapshot.reason ? t(snapshot.reason) : snapshot.message }] : [], cost: '',
      footer: t('readLocal'), trackingLabel, generatedAt: snapshot?.generatedAt,
    };
  }

  const summary = snapshot.summary;
  const turn = summary.currentTurn;
  const elapsed = turnDuration(turn, now);
  const total = summary.totalUsage;
  const cost = summary.cost;
  const amount = cost?.usd ?? (cost?.knownUsd > 0 ? cost.knownUsd : null);
  const price = amount != null ? (cost.complete ? '' : '≥') + formatUsd(amount) : '—';
  const rates = ratesForModel(summary.model, summary.latestUsage.inputTokens);
  const outputSpeed = turn?.generation?.outputTokens > 0 && turn.generation.durationMs > 0
    ? turn.generation.outputTokens / (turn.generation.durationMs / 1000) : null;
  const speed = outputSpeed == null ? '—' : outputSpeed.toFixed(1) + ' token/s';
  const speedDescription = t('speedDescription');
  const rows = [
    { label: t('model'), value: [summary.modelName, summary.reasoningEffort, summary.planType].filter(Boolean).join(' · ') },
    { label: t('currentTurn'), value: t('turnSummary', { steps: turn?.steps ?? 0, tools: turn?.toolCalls ?? 0, elapsed: formatDuration(elapsed) }) },
    { label: t('turnTokens'), value: t('tokenPair', { input: formatTokens(turn?.usage?.inputTokens || 0), output: formatTokens(turn?.usage?.outputTokens || 0) }) },
    { label: t('sessionTokens'), value: t('sessionTokenPair', { input: formatTokens(total.inputTokens), output: formatTokens(total.outputTokens), turns: summary.turnCount }) },
    { label: t('cacheRead'), value: t('cacheSummary', { tokens: formatTokens(total.cachedInputTokens), percent: percent(total.cacheHitPercent) }) },
    { label: t('requestsTools'), value: t('requestSummary', { requests: summary.requestCount, tools: summary.toolCallCount || 0 }) },
  ];
  if (turn?.timeToFirstTokenMs != null) rows.push({ label: t('firstResponse'), value: formatDuration(turn.timeToFirstTokenMs) });
  if (outputSpeed != null) {
    rows.push({ label: t('speed'), value: t('speedRequests', { speed, requests: turn.generation.requestCount }) });
    rows.push({ label: t('timingBasis'), value: speedDescription });
  }
  if (turn?.toolCalls) rows.push({ label: t('toolDuration'), value: formatDuration(turn.toolDurationMs) });
  if (rates) rows.push({ label: t('requestRates'), value: t('rateSummary', {
    input: rates.input, cached: rates.cachedInput == null ? '—' : '$' + rates.cachedInput, output: rates.output }) });
  if (cost?.breakdown && amount != null) {
    const parts = cost.breakdown;
    rows.push({ label: t('costBreakdown'), value: t('costSummary', { input: formatUsd(parts.input), cached: formatUsd(parts.cachedInput),
      writes: formatUsd(parts.cacheWrite), output: formatUsd(parts.output) }) });
    rows.push({ label: t('cacheSavings'), value: formatUsd(parts.cacheSavings) });
  }
  const limits = [summary.rateLimits?.primary, summary.rateLimits?.secondary].filter(Boolean);
  if (limits.length) rows.push({ label: t('quotaUsed'), value: limits.map(limit => limit.label + ' ' + percent(limit.usedPercent)).join(' · ') });

  return {
    locale, status: 'ready', title: summary.modelName || summary.model || 'Codex', subtitle: summary.reasoningEffort || '',
    conversationTitle: snapshot.conversationTitle || t('currentConversation'), trackingLabel,
    metrics: [
      metric('speed', t('speed'), speed, null, speedDescription),
      metric('cache', t('cache'), percent(total.cacheHitPercent), total.cacheHitPercent, t('cacheDescription')),
      metric('context', t('context'), percent(summary.contextUsedPercent), summary.contextUsedPercent, t('contextDescription')),
      metric('tokens', 'Token', formatTokens(total.totalTokens), null, t('tokensDescription')),
      metric('steps', '', t('stepNumber', { value: turn?.steps ?? 0 }), null, t('stepsDescription')),
      metric('turns', '', t('turnNumber', { value: summary.turnCount }), null, t('turnsDescription')),
      metric('tools', t('tools'), t('toolCount', { value: turn?.toolCalls ?? 0 }), null, t('toolsDescription')),
      metric('elapsed', t('elapsed'), formatDuration(elapsed), null, t('elapsedDescription')),
      ...(turn?.timeToFirstTokenMs != null ? [metric('ttft', t('firstResponse'), formatDuration(turn.timeToFirstTokenMs), null, t('firstResponseDescription'))] : []),
      metric('output', t('turnOutput'), formatTokens(turn?.usage?.outputTokens || 0), null, t('outputDescription')),
      metric('cost', 'API', price, null, t('costDescription')),
    ],
    rows, cost: t('costEstimate', { price }),
    footer: trackingLabel + ' · API Standard · ' + t('priceTable') + ' ' + (cost?.verifiedAt || pricingMetadata().verifiedAt),
    generatedAt: snapshot.generatedAt,
  };
}

function metric(kind, label, value, percent, description) { return { kind, label, value, percent, description }; }
function percent(value) { return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, '') + '%' : '—'; }

function turnDuration(turn, now) {
  if (!turn) return null;
  if (Number.isFinite(turn.durationMs)) return turn.durationMs;
  if (!turn.startedAt) return null;
  const end = turn.completedAt ? Date.parse(turn.completedAt) : now;
  const elapsed = end - Date.parse(turn.startedAt);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : null;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return Math.round(ms) + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's';
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? minutes + 'm' + String(seconds % 60).padStart(2, '0') + 's'
    : Math.floor(minutes / 60) + 'h' + String(minutes % 60).padStart(2, '0') + 'm';
}

module.exports = { snapshotToViewModel, formatDuration, turnDuration };
