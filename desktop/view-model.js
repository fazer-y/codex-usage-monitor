'use strict';

const { formatTokens, formatUsd, formatCost } = require('../lib/format');

function snapshotToViewModel(snapshot) {
  if (!snapshot || snapshot.status !== 'ready' || !snapshot.summary) {
    return {
      status: snapshot ? snapshot.status : 'waiting',
      title: 'Waiting for Codex usage',
      subtitle: snapshot && snapshot.message ? snapshot.message : 'No local session data yet.',
      metrics: [],
      rows: [],
      cost: '',
      footer: `Local files only. No network or model calls. ${snapshot && snapshot.codexHome ? snapshot.codexHome : ''}`.trim(),
      generatedAt: snapshot && snapshot.generatedAt,
    };
  }

  const summary = snapshot.summary;
  const primary = summary.rateLimits && summary.rateLimits.primary;
  const secondary = summary.rateLimits && summary.rateLimits.secondary;

  return {
    status: 'ready',
    title: summary.modelName || summary.model || 'unknown model',
    subtitle: [summary.reasoningEffort ? `think ${summary.reasoningEffort}` : '', summary.planType || ''].filter(Boolean).join(' · '),
    metrics: [
      metric('Context', summary.contextUsedPercent),
      metric(primary ? primary.label : '5h', primary && primary.usedPercent),
      metric(secondary ? secondary.label : '7d', secondary && secondary.usedPercent),
      metric('Cache', summary.totalUsage && summary.totalUsage.cacheHitPercent),
    ].filter((item) => item.percent != null),
    rows: [
      row('This turn', turnText(summary.latestUsage)),
      row('Session', `${formatTokens(summary.totalUsage.inputTokens)} in · ${formatTokens(summary.totalUsage.outputTokens)} out · ${summary.turnCount} turns`),
      row('Models', modelText(summary.cost)),
      row('Source', snapshot.transcriptPath || 'unknown'),
    ].filter((item) => item.value),
    cost: costText(summary.cost),
    footer: 'Local files only. No network or model calls.',
    generatedAt: snapshot.generatedAt,
  };
}

function metric(label, percent) {
  if (percent == null) return { label, value: '', percent: null };
  return { label, value: `${trimFixed(percent, 1)}%`, percent };
}

function row(label, value) {
  return { label, value };
}

function turnText(usage) {
  if (!usage) return '';
  const parts = [`${formatTokens(usage.inputTokens)} in`, `${formatTokens(usage.outputTokens)} out`];
  if (usage.reasoningOutputTokens) parts.push(`${formatTokens(usage.reasoningOutputTokens)} reason`);
  return parts.join(' · ');
}

function costText(cost) {
  return formatCost(cost);
}

function modelText(cost) {
  if (!cost || !Array.isArray(cost.perModel) || cost.perModel.length === 0) return '';
  return cost.perModel.map((item) => `${item.name || item.modelId} ${formatUsd(item.usd)}`).join(' · ');
}

function trimFixed(value, digits) {
  return Number(value).toFixed(digits).replace(/\.0$/, '');
}

module.exports = {
  snapshotToViewModel,
};
