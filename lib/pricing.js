'use strict';

const BUILTIN_BOOK = require('./prices.json');
const LONG_CONTEXT_THRESHOLD = 272000;
const SOURCE = 'https://developers.openai.com/api/docs/pricing';
const RATE_KEYS = ['input', 'cachedInput', 'cacheWrite', 'output'];
const PART_KEYS = ['input', 'cachedInput', 'cacheWrite', 'output', 'cacheSavings'];
let book = BUILTIN_BOOK;
let models = new Map(book.models.map(model => [model.key, model]));
let revision = 0;

function validatePriceBook(value) {
  if (value?.version !== 1 || value.source !== SOURCE || value.currency !== 'USD'
      || value.unit !== 1000000 || !Number.isFinite(Date.parse(value.checkedAt))
      || !Array.isArray(value.models) || !value.models.length) throw new Error('Invalid price book.');
  const ids = new Set();
  const entries = value.models.map(model => {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(model.key || '') || ids.has(model.key)
        || typeof model.name !== 'string' || !model.name.trim()) throw new Error('Invalid priced model.');
    ids.add(model.key);
    function rates(raw) {
      const result = {};
      for (const key of RATE_KEYS) {
        const rate = raw[key];
        if (rate == null && ['cachedInput', 'cacheWrite'].includes(key)) result[key] = null;
        else if (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0) result[key] = rate;
        else throw new Error('Invalid model rate.');
      }
      return result;
    }
    return { key: model.key, name: model.name, ...rates(model), ...(model.tiered ? { tiered: true } : {}),
      ...(model.longRates ? { longRates: rates(model.longRates) } : {}) };
  });
  return { version: 1, source: SOURCE, currency: 'USD', unit: 1000000,
    checkedAt: new Date(value.checkedAt).toISOString(), models: entries };
}

function applyPriceBook(value) {
  const next = validatePriceBook(value);
  if (JSON.stringify(next) === JSON.stringify(book)) return false;
  book = next;
  models = new Map(book.models.map(model => [model.key, model]));
  revision++;
  return true;
}

function pricingMetadata() { return { source: SOURCE, verifiedAt: book.checkedAt.slice(0, 10) }; }
function pricingRevision() { return revision; }

function modelInfo(modelId) {
  const model = models.get(typeof modelId === 'string' ? modelId.trim() : '');
  return model ? { ...model, ...(model.longRates ? { longRates: { ...model.longRates } } : {}) } : null;
}

function modelDisplayName(modelId) {
  return modelInfo(modelId)?.name || (typeof modelId === 'string' ? modelId.trim() || null : null);
}

function ratesForModel(modelId, inputTokens, longContext = inputTokens > LONG_CONTEXT_THRESHOLD) {
  const info = modelInfo(modelId);
  return info && (longContext && info.tiered ? info.longRates || null : info);
}

function costForUsage(modelId, usage) {
  return costBreakdownForUsage(modelId, usage)?.total ?? null;
}

function costBreakdownForUsage(modelId, usage, longContext) {
  if (!usage || typeof usage !== 'object') return null;
  const input = toNum(usage.inputTokens);
  const rates = ratesForModel(modelId, input, longContext);
  if (!rates) return null;
  const cached = Math.min(input, toNum(usage.cachedInputTokens));
  const writes = Math.min(input - cached, toNum(usage.cacheWriteInputTokens));
  if ((cached && rates.cachedInput == null) || (writes && rates.cacheWrite == null)) return null;
  const breakdown = {
    input: (input - cached - writes) * rates.input / 1000000,
    cachedInput: cached * (rates.cachedInput || 0) / 1000000,
    cacheWrite: writes * (rates.cacheWrite || 0) / 1000000,
    output: toNum(usage.outputTokens) * rates.output / 1000000,
    cacheSavings: cached * (rates.input - (rates.cachedInput ?? rates.input)) / 1000000,
  };
  breakdown.total = breakdown.input + breakdown.cachedInput + breakdown.cacheWrite + breakdown.output;
  return Number.isFinite(breakdown.total) ? breakdown : null;
}

function sessionCost(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object') return null;
  let usd = 0;
  let complete = true;
  let any = false;
  const perModel = [];
  const unknownModels = [];
  const breakdown = Object.fromEntries(PART_KEYS.map(key => [key, 0]));
  for (const [modelId, usage] of Object.entries(modelUsage)) {
    if (!hasUsage(usage)) continue;
    any = true;
    const requests = usage.pricingUsage
      ? Object.entries(usage.pricingUsage).filter(([, tokens]) => hasUsage(tokens))
      : [[null, usage]];
    let knownUsd = 0;
    let priced = !usage.unpriced;
    for (const [tier, tokens] of requests) {
      const parts = costBreakdownForUsage(modelId, tokens, tier == null ? undefined : tier === 'long');
      if (!parts) { priced = false; continue; }
      knownUsd += parts.total;
      for (const key of PART_KEYS) breakdown[key] += parts[key];
    }
    if (!priced) { complete = false; unknownModels.push(modelId); }
    usd += knownUsd;
    if (priced || knownUsd > 0) perModel.push({ modelId, name: modelDisplayName(modelId),
      usd: priced ? knownUsd : null, knownUsd });
  }
  if (!any) return null;
  perModel.sort((a, b) => b.knownUsd - a.knownUsd);
  return { usd: complete ? usd : null, knownUsd: usd, complete, perModel, unknownModels, breakdown,
    basis: 'Standard API token equivalent; excludes tools, Fast mode and regional premiums', ...pricingMetadata() };
}

function hasUsage(usage) {
  return ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'totalTokens']
    .some(key => toNum(usage?.[key]) > 0);
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

module.exports = { LONG_CONTEXT_THRESHOLD, SOURCE, BUILTIN_BOOK, validatePriceBook, applyPriceBook,
  pricingMetadata, pricingRevision, costForUsage, costBreakdownForUsage, modelDisplayName, modelInfo,
  ratesForModel, sessionCost };
