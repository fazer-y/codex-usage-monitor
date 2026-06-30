'use strict';

const { defaultCodexHome, findLatestSessionFile, summarizeSessionFile } = require('../lib/session');

const DEFAULT_INTERVAL_SECONDS = 5;

function createUsageService(options = {}) {
  const codexHome = options.codexHome || defaultCodexHome();

  return {
    codexHome,
    intervalSeconds: secondsFromEnv(
      options.env || process.env,
      'CODEX_USAGE_MONITOR_DESKTOP_INTERVAL_SECONDS',
      DEFAULT_INTERVAL_SECONDS,
    ),
    async getSnapshot() {
      return latestSnapshot({ codexHome });
    },
  };
}

async function latestSnapshot(options = {}) {
  const codexHome = options.codexHome || defaultCodexHome();
  const transcriptPath = findLatestSessionFile(codexHome);
  if (!transcriptPath) {
    return {
      status: 'waiting',
      codexHome,
      transcriptPath: null,
      summary: null,
      message: `No Codex session JSONL files found under ${codexHome}.`,
      generatedAt: new Date().toISOString(),
    };
  }

  const summary = await summarizeSessionFile(transcriptPath);
  if (!summary) {
    return {
      status: 'error',
      codexHome,
      transcriptPath,
      summary: null,
      message: `Unable to summarize ${transcriptPath}.`,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    status: 'ready',
    codexHome,
    transcriptPath,
    summary,
    message: 'Usage loaded from local Codex session files.',
    generatedAt: new Date().toISOString(),
  };
}

function secondsFromEnv(env, key, fallback) {
  const n = Number(env && env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = {
  createUsageService,
  latestSnapshot,
  secondsFromEnv,
};
