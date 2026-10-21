'use strict';

/**
 * OpenAI API-equivalent pricing in USD per million tokens.
 *
 * Snapshot: OpenAI API pricing page, checked 2026-10-21. Codex subscriptions
 * are not billed per token in the CLI, so all costs shown by this project are
 * estimates of what the same usage would cost on the pay-as-you-go API.
 */

// Verified 2026-10-21: https://developers.openai.com/api/docs/pricing
// And /api/docs/models/{model-id}. Standard API-equivalent token rates,
// excluding tools, regional premiums and Fast mode. Exact IDs only.
const MODELS = [
  { key: 'gpt-6-astra', name: 'GPT-6 Astra', input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50, long: true },
  { key: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10, long: true },
  { key: 'gpt-6-sol', name: 'GPT-6 Sol', input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 10, long: true },
  { key: 'gpt-6-luna', name: 'GPT-6 Luna', input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5, long: true },
  { key: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20, long: true },
  { key: 'gpt-5.5', name: 'GPT-5.5', input: 5, cachedInput: 0.5, output: 30, sessionLong: true },
  { key: 'gpt-5.4', name: 'GPT-5.4', input: 2.5, cachedInput: 0.25, output: 15, sessionLong: true },
  { key: 'gpt-5.4-mini', name: 'GPT-5.4 mini', input: 0.75, cachedInput: 0.075, output: 4.5 },
  { key: 'gpt-5.4-nano', name: 'GPT-5.4 nano', input: 0.2, cachedInput: 0.02, output: 1.25 },
  { key: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', input: 1.75, cachedInput: 0.175, output: 14 },
];

function normalizeModelId(modelId) {
  return typeof modelId === 'string' ? modelId.trim() || null : null;
}

function modelInfo(modelId) {
  const id = normalizeModelId(modelId);
  const model = MODELS.find(model => model.key === id);
  return model ? { ...model } : null;
}

function modelDisplayName(modelId) {
  const info = modelInfo(modelId);
  if (info) return info.name;
  if (typeof modelId !== 'string' || !modelId.trim()) return null;
  return modelId.trim();
}

function costForUsage(modelId, usage) {
  return costBreakdownForUsage(modelId, usage)?.total ?? null;
}

function costBreakdownForUsage(modelId, usage) {
  const info = modelInfo(modelId);
  if (!info || !usage || typeof usage !== 'object') return null;

  const input = toNum(usage.inputTokens);
  const cached = Math.min(input, Math.max(0, toNum(usage.cachedInputTokens)));
  const writes = Math.min(input - cached, Math.max(0, toNum(usage.cacheWriteInputTokens)));
  if (writes && info.cacheWrite == null) return null;
  // Session-wide long-context repricing cannot be reconstructed reliably here.
  if (info.sessionLong && input > 272000) return null;
  const inputMultiplier = info.long && input > 272000 ? 2 : 1;
  const outputMultiplier = info.long && input > 272000 ? 1.5 : 1;
  const uncached = Math.max(0, input - cached - writes);
  const cachedRate = info.cachedInput == null ? info.input : info.cachedInput;
  const breakdown = {
    input: uncached * info.input * inputMultiplier / 1_000_000,
    cachedInput: cached * cachedRate * inputMultiplier / 1_000_000,
    cacheWrite: writes * (info.cacheWrite || 0) * inputMultiplier / 1_000_000,
    output: toNum(usage.outputTokens) * info.output * outputMultiplier / 1_000_000,
    cacheSavings: cached * (info.input - cachedRate) * inputMultiplier / 1_000_000,
  };
  breakdown.total = breakdown.input + breakdown.cachedInput + breakdown.cacheWrite + breakdown.output;
  return Number.isFinite(breakdown.total) ? breakdown : null;
}

function sessionCost(models) {
  if (!models || typeof models !== 'object') return null;

  let usd = 0;
  let complete = true;
  let any = false;
  const perModel = [];
  const unknownModels = [];
  const breakdown = { input: 0, cachedInput: 0, cacheWrite: 0, output: 0, cacheSavings: 0 };

  for (const [modelId, usage] of Object.entries(models)) {
    if (!hasUsage(usage)) continue;
    any = true;

    const cost = usage.unpriced ? null : (usage.estimatedUsd ?? costForUsage(modelId, usage));
    const knownCost = usage.estimatedUsd ?? cost ?? 0;
    const parts = usage.estimatedBreakdown || (cost != null ? costBreakdownForUsage(modelId, usage) : null);
    if (parts) for (const key of Object.keys(breakdown)) breakdown[key] += parts[key] || 0;
    if (cost == null) {
      complete = false;
      unknownModels.push(modelId);
      usd += knownCost;
      if (knownCost) perModel.push({ modelId, name: modelDisplayName(modelId), usd: null, knownUsd: knownCost });
      continue;
    }

    usd += cost;
    perModel.push({ modelId, name: modelDisplayName(modelId), usd: cost });
  }

  if (!any) return null;
  perModel.sort((a, b) => b.usd - a.usd);
  return { usd: complete ? usd : null, knownUsd: usd, complete, perModel, unknownModels, breakdown,
    basis: 'Standard API token equivalent; excludes tools, Fast mode and regional premiums',
    verifiedAt: '2026-10-21' };
}

function hasUsage(usage) {
  return toNum(usage && usage.inputTokens) > 0
    || toNum(usage && usage.cachedInputTokens) > 0
    || toNum(usage && usage.outputTokens) > 0
    || toNum(usage && usage.reasoningOutputTokens) > 0
    || toNum(usage && usage.totalTokens) > 0;
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

module.exports = {
  MODELS,
  costForUsage,
  costBreakdownForUsage,
  modelDisplayName,
  modelInfo,
  normalizeModelId,
  sessionCost,
};
