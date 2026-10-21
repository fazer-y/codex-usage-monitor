'use strict';

const { formatTokens, formatUsd } = require('../lib/format');
const { modelInfo } = require('../lib/pricing');

function snapshotToViewModel(snapshot, now = Date.now()) {
  const trackingLabel = snapshot?.selection?.mode === 'desktop' ? '跟随 Codex 当前会话' : '最近活动会话';
  if (!snapshot || snapshot.status !== 'ready' || !snapshot.summary) {
    return {
      status: snapshot?.status || 'waiting', title: '等待会话', subtitle: '', conversationTitle: snapshot?.conversationTitle || '',
      metrics: [], rows: snapshot?.message ? [{ label: '状态', value: snapshot.message }] : [], cost: '',
      footer: '读取本地会话统计', trackingLabel, generatedAt: snapshot?.generatedAt,
    };
  }

  const summary = snapshot.summary;
  const turn = summary.currentTurn;
  const elapsed = turnDuration(turn, now);
  const total = summary.totalUsage;
  const cost = summary.cost;
  const amount = cost?.usd ?? (cost?.knownUsd > 0 ? cost.knownUsd : null);
  const price = amount != null ? (cost.complete ? '' : '≥') + formatUsd(amount) : '—';
  const info = modelInfo(summary.model);
  const multiplier = info?.long && summary.latestUsage.inputTokens > 272000 ? 2 : 1;
  const outputMultiplier = multiplier === 2 ? 1.5 : 1;
  const outputSpeed = turn?.generation?.outputTokens > 0 && turn.generation.durationMs > 0
    ? turn.generation.outputTokens / (turn.generation.durationMs / 1000) : null;
  const speed = outputSpeed == null ? '—' : outputSpeed.toFixed(1) + ' token/s';
  const speedDescription = '按模型请求区间估算，剔除工具等待；Token 包含思考，耗时包含网络、排队和预填充';
  const rows = [
    { label: '模型', value: [summary.modelName, summary.reasoningEffort, summary.planType].filter(Boolean).join(' · ') },
    { label: '本轮', value: (turn?.steps ?? 0) + ' 步 · ' + (turn?.toolCalls ?? 0) + ' 次工具调用 · ' + formatDuration(elapsed) },
    { label: '本轮 Token', value: formatTokens(turn?.usage?.inputTokens || 0) + ' 输入 · ' + formatTokens(turn?.usage?.outputTokens || 0) + ' 输出' },
    { label: '会话 Token', value: formatTokens(total.inputTokens) + ' 输入 · ' + formatTokens(total.outputTokens) + ' 输出 · ' + summary.turnCount + ' 轮' },
    { label: '缓存读取', value: formatTokens(total.cachedInputTokens) + ' Token · 命中率 ' + percent(total.cacheHitPercent) },
    { label: '请求 / 工具', value: summary.requestCount + ' 次请求 · ' + (summary.toolCallCount || 0) + ' 次工具调用' },
  ];
  if (turn?.timeToFirstTokenMs != null) rows.push({ label: '首响应', value: formatDuration(turn.timeToFirstTokenMs) });
  if (outputSpeed != null) {
    rows.push({ label: '吞吐', value: speed + ' · ' + turn.generation.requestCount + ' 次模型请求' });
    rows.push({ label: '计时口径', value: speedDescription });
  }
  if (turn?.toolCalls) rows.push({ label: '工具累计耗时', value: formatDuration(turn.toolDurationMs) });
  if (info) rows.push({ label: '本次请求单价', value: '输入 $' + info.input * multiplier + ' · 缓存读取 $' + info.cachedInput * multiplier
    + ' · 输出 $' + info.output * outputMultiplier + ' / 百万 Token' });
  if (cost?.breakdown && amount != null) {
    const parts = cost.breakdown;
    rows.push({ label: '费用明细', value: '输入 ' + formatUsd(parts.input) + ' · 缓存读取 ' + formatUsd(parts.cachedInput)
      + ' · 缓存写入 ' + formatUsd(parts.cacheWrite) + ' · 输出 ' + formatUsd(parts.output) });
    rows.push({ label: '缓存节省', value: formatUsd(parts.cacheSavings) });
  }
  const limits = [summary.rateLimits?.primary, summary.rateLimits?.secondary].filter(Boolean);
  if (limits.length) rows.push({ label: '额度已用', value: limits.map(limit => limit.label + ' ' + percent(limit.usedPercent)).join(' · ') });

  return {
    status: 'ready', title: summary.modelName || summary.model || 'Codex', subtitle: summary.reasoningEffort || '',
    conversationTitle: snapshot.conversationTitle || '当前会话', trackingLabel,
    metrics: [
      metric('speed', '吞吐', speed, null, speedDescription),
      metric('cache', '缓存', percent(total.cacheHitPercent), total.cacheHitPercent, '会话缓存读取 Token / 会话输入 Token'),
      metric('context', '上下文', percent(summary.contextUsedPercent), summary.contextUsedPercent, '最近一次请求输入 / 模型上下文窗口'),
      metric('tokens', 'Token', formatTokens(total.totalTokens), null, '会话累计输入和输出 Token'),
      metric('steps', '', '第' + (turn?.steps ?? 0) + '步', null, '当前轮模型请求次数'),
      metric('turns', '', '第' + summary.turnCount + '轮', null, '会话累计轮数'),
      metric('tools', '工具', String(turn?.toolCalls ?? 0) + '次', null, '当前轮工具调用次数'),
      metric('elapsed', '耗时', formatDuration(elapsed), null, '当前轮总耗时'),
      ...(turn?.timeToFirstTokenMs != null ? [metric('ttft', '首响应', formatDuration(turn.timeToFirstTokenMs), null, '日志记录的首个 Token 延迟')] : []),
      metric('output', '本轮输出', formatTokens(turn?.usage?.outputTokens || 0), null, '当前轮累计输出 Token'),
      metric('cost', 'API≈', price, null, '按公开 API Standard Token 价目表估算'),
    ],
    rows, cost: 'API 等价估算 ' + price,
    footer: trackingLabel + ' · API Standard · 价目表 ' + (cost?.verifiedAt || '2026-10-21'),
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
