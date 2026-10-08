'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const { modelDisplayName, sessionCost, costForUsage } = require('./pricing');

async function summarizeSessionFile(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;

  let stat;
  try {
    stat = fs.statSync(transcriptPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const maxBytes = toPositiveInt(process.env.CODEX_USAGE_MONITOR_MAX_BYTES, 50 * 1024 * 1024);
  if (stat.size > maxBytes) return null;

  const summary = emptySummary(transcriptPath);
  const models = Object.create(null);
  let currentModel = null;
  let currentEffort = null;
  let currentTurnId = null;
  const accounting = { high: zeroUsage(), turns: new Set() };

  await new Promise((resolve) => {
    const stream = fs.createReadStream(transcriptPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const finish = () => resolve();
    rl.on('line', (line) => {
      if (!line) return;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        summary.parseFailures++;
        return;
      }
      consumeRecord(record, summary, models, {
        accounting,
        get currentModel() { return currentModel; },
        set currentModel(value) { currentModel = value; },
        get currentEffort() { return currentEffort; },
        set currentEffort(value) { currentEffort = value; },
        get currentTurnId() { return currentTurnId; },
        set currentTurnId(value) { currentTurnId = value; },
      });
    });
    rl.on('close', finish);
    rl.on('error', finish);
    stream.on('error', finish);
  });

  if (!summary.sessionId && summary.turnCount === 0) return null;

  summary.totalUsage.cacheHitPercent = cacheHitPercent(summary.totalUsage);
  summary.latestUsage.cacheHitPercent = cacheHitPercent(summary.latestUsage);
  summary.contextUsedPercent = computeContextUsedPercent(summary);
  summary.modelName = modelDisplayName(summary.model) || summary.model || 'unknown';
  summary.cost = sessionCost(models);
  if (summary.accountingIncomplete && summary.cost) {
    summary.cost.complete = false;
    summary.cost.usd = null;
  }
  summary.models = models;

  return summary;
}

function consumeRecord(record, summary, models, state) {
  const timestamp = parseTimestamp(record.timestamp);
  if (timestamp) {
    summary.latestAt = timestamp;
    if (!summary.startedAt || timestamp < summary.startedAt) summary.startedAt = timestamp;
  }

  const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};

  if (record.type === 'session_meta') {
    summary.sessionId = stringValue(payload.session_id) || stringValue(payload.id) || summary.sessionId;
    summary.cwd = stringValue(payload.cwd) || summary.cwd;
    summary.cliVersion = stringValue(payload.cli_version) || summary.cliVersion;
    summary.source = stringValue(payload.source) || summary.source;
    summary.originator = stringValue(payload.originator) || summary.originator;
    return;
  }

  if (record.type === 'turn_context') {
    state.currentTurnId = stringValue(payload.turn_id) || state.currentTurnId;
    state.currentModel = stringValue(payload.model)
      || stringValue(payload.collaboration_mode && payload.collaboration_mode.settings && payload.collaboration_mode.settings.model)
      || state.currentModel;
    state.currentEffort = stringValue(payload.effort)
      || stringValue(payload.collaboration_mode && payload.collaboration_mode.settings && payload.collaboration_mode.settings.reasoning_effort)
      || state.currentEffort;
    summary.model = state.currentModel || summary.model;
    summary.reasoningEffort = state.currentEffort || summary.reasoningEffort;
    summary.contextWindow = toNum(payload.model_context_window) || summary.contextWindow;
    summary.cwd = stringValue(payload.cwd) || summary.cwd;
    return;
  }

  if (record.type !== 'event_msg') return;

  if (payload.type === 'task_started') {
    state.currentTurnId = stringValue(payload.turn_id) || state.currentTurnId;
    summary.contextWindow = toNum(payload.model_context_window) || summary.contextWindow;
    const startedAt = epochSecondsToDate(payload.started_at);
    if (startedAt && (!summary.startedAt || startedAt < summary.startedAt)) summary.startedAt = startedAt;
    return;
  }

  if (payload.type !== 'token_count') return;

  const info = payload.info && typeof payload.info === 'object' ? payload.info : {};
  if (payload.rate_limits) {
    summary.rateLimits = normalizeRateLimits(payload.rate_limits);
    summary.planType = stringValue(payload.rate_limits.plan_type) || summary.planType;
  }
  summary.contextWindow = toNum(info.model_context_window) || summary.contextWindow;
  if (!info.total_token_usage) {
    if (info.last_token_usage) summary.accountingIncomplete = true;
    return; // Quota-only events must never reset usage or charge again.
  }
  const totalUsage = normalizeUsage(info.total_token_usage);
  const latestUsage = normalizeUsage(info.last_token_usage);
  const high = state.accounting.high;
  const keys = Object.keys(zeroUsage());
  // Cumulative high-water marks reject duplicated and stale snapshots, even
  // across model switches. A rollback cannot be safely priced as a new request.
  if (keys.some(key => totalUsage[key] < high[key])) {
    summary.accountingIncomplete = true;
    return;
  }
  const delta = Object.fromEntries(keys.map(key => [key, totalUsage[key] - high[key]]));
  if (!keys.some(key => delta[key] > 0)) return;
  state.accounting.high = totalUsage;
  summary.totalUsage = totalUsage;
  summary.latestUsage = latestUsage;
  summary.model = state.currentModel || summary.model || 'unknown';
  summary.reasoningEffort = state.currentEffort || summary.reasoningEffort;
  state.accounting.turns.add(state.currentTurnId || String(summary.requestCount));
  summary.turnCount = state.accounting.turns.size;
  summary.requestCount++;

  const bucket = models[summary.model] || (models[summary.model] = zeroUsage());
  addUsage(bucket, delta);
  // Missing snapshots can span requests/models and pricing tiers. Keep token
  // totals but do not invent an API price for such gaps.
  const exactRequest = info.last_token_usage && keys.every(key => delta[key] === latestUsage[key]);
  const usd = exactRequest ? costForUsage(summary.model, delta) : null;
  if (usd == null) bucket.unpriced = true;
  bucket.estimatedUsd = (bucket.estimatedUsd || 0) + (usd || 0);

}

function emptySummary(transcriptPath) {
  return {
    sessionId: null,
    transcriptPath,
    cwd: null,
    cliVersion: null,
    source: null,
    originator: null,
    model: null,
    modelName: null,
    reasoningEffort: null,
    planType: null,
    startedAt: null,
    latestAt: null,
    turnCount: 0,
    requestCount: 0,
    accountingIncomplete: false,
    parseFailures: 0,
    contextWindow: null,
    contextUsedPercent: null,
    latestUsage: zeroUsage(),
    totalUsage: zeroUsage(),
    rateLimits: { primary: null, secondary: null },
    cost: null,
    models: Object.create(null),
  };
}

function normalizeUsage(raw) {
  const usage = raw && typeof raw === 'object' ? raw : {};
  return {
    inputTokens: toNum(usage.input_tokens),
    cachedInputTokens: toNum(usage.cached_input_tokens),
    cacheWriteInputTokens: toNum(usage.cache_write_input_tokens),
    outputTokens: toNum(usage.output_tokens),
    reasoningOutputTokens: toNum(usage.reasoning_output_tokens),
    totalTokens: toNum(usage.total_tokens),
  };
}

function normalizeRateLimits(raw) {
  if (!raw || typeof raw !== 'object') return { primary: null, secondary: null };
  return {
    primary: normalizeLimit(raw.primary),
    secondary: normalizeLimit(raw.secondary),
  };
}

function normalizeLimit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const minutes = toNum(raw.window_minutes);
  return {
    label: labelForWindow(minutes),
    usedPercent: roundPercent(raw.used_percent),
    windowMinutes: minutes || null,
    resetsAt: toNum(raw.resets_at) || null,
  };
}

function labelForWindow(minutes) {
  if (minutes === 300) return '5h';
  if (minutes === 10080) return '7d';
  if (!minutes) return 'limit';
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function addUsage(target, usage) {
  target.inputTokens += usage.inputTokens;
  target.cachedInputTokens += usage.cachedInputTokens;
  target.cacheWriteInputTokens += usage.cacheWriteInputTokens;
  target.outputTokens += usage.outputTokens;
  target.reasoningOutputTokens += usage.reasoningOutputTokens;
  target.totalTokens += usage.totalTokens;
}

function zeroUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function cacheHitPercent(usage) {
  if (!usage || usage.inputTokens <= 0) return null;
  return roundPercent((usage.cachedInputTokens / usage.inputTokens) * 100);
}

function computeContextUsedPercent(summary) {
  if (!summary.contextWindow || summary.contextWindow <= 0) return null;
  return roundPercent((summary.latestUsage.inputTokens / summary.contextWindow) * 100);
}

function findLatestSessionFile(codexHome = defaultCodexHome()) {
  const sessionsRoot = path.join(codexHome, 'sessions');
  const archivedRoot = path.join(codexHome, 'archived_sessions');
  const roots = [sessionsRoot, archivedRoot].filter((root) => {
    try { return fs.statSync(root).isDirectory(); } catch { return false; }
  });

  let latest = null;
  for (const root of roots) {
    for (const file of walkJsonl(root)) {
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      if (!stat.isFile()) continue;
      if (!latest || stat.mtimeMs > latest.mtimeMs) latest = { file, mtimeMs: stat.mtimeMs };
    }
  }
  return latest ? latest.file : null;
}

function walkJsonl(root) {
  const result = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) result.push(fullPath);
    }
  }
  return result;
}

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function epochSecondsToDate(value) {
  const seconds = toNum(value);
  return seconds ? new Date(seconds * 1000) : null;
}

function stringValue(value) {
  return typeof value === 'string' && value ? value : null;
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function roundPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

module.exports = {
  cacheHitPercent,
  defaultCodexHome,
  findLatestSessionFile,
  summarizeSessionFile,
};
