'use strict';

const { fields, text, span, packedIndices } = require('./protobuf');

function readUsage(bytes) {
  const usage = { uncached: 0, cached: 0, written: 0, output: 0, reasoning: 0, response: null, responseId: '' };
  let reported = false;
  for (const { number, wire, value } of fields(bytes)) {
    if (number === 11 && wire === 2 && value.length <= 256) usage.responseId = text(value);
    if (wire !== 0 || !Number.isSafeInteger(value)) continue;
    switch (number) {
      case 2: usage.uncached = value; break;
      case 3: usage.output = value; break;
      case 4: usage.written = value; break;
      case 5: usage.cached = value; break;
      case 9: usage.reasoning = value; break;
      case 10: usage.response = value; break;
      default: continue;
    }
    reported = true;
  }
  if (usage.output === 0) usage.output = usage.reasoning + (usage.response ?? 0);
  usage.prompt = usage.uncached + usage.cached + usage.written;
  return reported ? usage : null;
}

function readChatModel(bytes) {
  const model = { name: '', configId: '', modelEnum: '', firstTokenSeconds: null, streamingSeconds: null, usage: null };
  for (const { number, wire, value } of fields(bytes)) {
    if (wire !== 2) continue;
    switch (number) {
      case 4: model.usage = readUsage(value); break;
      case 11: model.firstTokenSeconds = span(value); break;
      case 12: model.streamingSeconds = span(value); break;
      case 19: if (value.length <= 256) model.configId = text(value); break;
      case 20: {
        // The model enum is useful for records that predate the display name.
        let key = '';
        let entry = '';
        for (const part of fields(value)) {
          if (part.wire === 2 && part.value.length <= 256) {
            if (part.number === 1) key = text(part.value);
            if (part.number === 2) entry = text(part.value);
          }
        }
        if (key === 'model_enum') model.modelEnum = entry;
        break;
      }
      case 21: if (value.length <= 256) model.name = text(value); break;
    }
  }
  model.name ||= model.configId || model.modelEnum.replace(/^MODEL_/, '');
  const effort = model.name.match(/ \((low|medium|high|xhigh|max|minimal|thinking)\)$/i);
  model.effort = effort?.[1] ?? '';
  if (effort) model.name = model.name.slice(0, -effort[0].length);
  return model;
}

function decodeGeneration(bytes) {
  let model = null;
  let id = '';
  let lastStepIndex = -1;
  for (const { number, wire, value } of fields(bytes)) {
    if (number === 1 && wire === 2) model = readChatModel(value);
    if (number === 2 && wire === 2) {
      for (const index of packedIndices(value)) lastStepIndex = Math.max(lastStepIndex, index);
    }
    if (number === 2 && wire === 0) lastStepIndex = Math.max(lastStepIndex, value);
    if (number === 4 && wire === 2 && value.length <= 256) id = text(value);
  }
  return model && { ...model, id: model.usage?.responseId || id, lastStepIndex };
}

function summarizeGenerations(generations, lastTurnIndex) {
  const seen = new Set();
  const result = { model: '', effort: '', steps: 0, measuredCalls: 0, promptTokens: 0, cachedTokens: 0,
    writtenTokens: 0, outputTokens: 0, reasoningTokens: 0, lastPromptTokens: null, turnOutputTokens: null,
    hitRate: null, tokensPerSecond: null, firstTokenSeconds: null, streamingSeconds: null };
  let lastTimedCall = null;
  for (const call of generations) {
    if (call.id && seen.has(call.id)) continue;
    if (call.id) seen.add(call.id);
    result.steps++;
    if (call.name) { result.model = call.name; result.effort = call.effort; }
    if (!call.usage) continue;
    const usage = call.usage;
    result.measuredCalls++;
    result.promptTokens += usage.prompt;
    result.cachedTokens += usage.cached;
    result.writtenTokens += usage.written;
    result.outputTokens += usage.output;
    result.reasoningTokens += usage.reasoning;
    result.lastPromptTokens = usage.prompt;
    if (lastTurnIndex !== null && call.lastStepIndex >= lastTurnIndex) {
      result.turnOutputTokens = (result.turnOutputTokens ?? 0) + usage.output;
    }
    lastTimedCall = call;
  }
  if (result.promptTokens > 0) result.hitRate = result.cachedTokens / result.promptTokens;
  if (lastTimedCall) {
    const { usage, firstTokenSeconds, streamingSeconds } = lastTimedCall;
    result.firstTokenSeconds = firstTokenSeconds;
    result.streamingSeconds = streamingSeconds;
    if (usage.output > 1 && streamingSeconds >= 0.05) result.tokensPerSecond = usage.output / streamingSeconds;
  }
  return result;
}

module.exports = { decodeGeneration, summarizeGenerations };
