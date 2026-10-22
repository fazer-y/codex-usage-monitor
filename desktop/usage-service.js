'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defaultCodexHome, findLatestSessionFile } = require('../lib/session');
const { SessionReader } = require('./session-reader');
const { SessionCatalog } = require('./session-catalog');
const { CodexSelection } = require('./codex-selection');
const { ServiceTierReader } = require('./service-tier-reader');

function createUsageService(options = {}) {
  const codexHome = options.codexHome || defaultCodexHome();
  const reader = options.reader || new SessionReader({ cacheDirectory: options.cacheDirectory });
  const catalog = options.catalog || new SessionCatalog(codexHome);
  const selection = options.selection || new CodexSelection();
  const serviceTiers = options.serviceTiers || new ServiceTierReader(codexHome);
  const intervalSeconds = secondsFromEnv(options.env || process.env, 'CODEX_USAGE_MONITOR_DESKTOP_INTERVAL_SECONDS', 15);
  let fallback = null;
  let nextFallback = 0;
  let activeFile = null;
  let notify = null;
  let timeout = null;
  let scheduledAt = 0;
  let timer = null;
  const watchers = [];

  function schedule(delayMs = 75) {
    if (!notify) return;
    const target = Date.now() + delayMs;
    if (timeout && scheduledAt <= target) return;
    clearTimeout(timeout);
    scheduledAt = target;
    timeout = setTimeout(() => { timeout = null; notify?.(); }, delayMs);
  }

  return {
    codexHome,
    intervalSeconds,
    reader,
    setHostPid(pid) { selection.setHostPid?.(pid); schedule(); },
    async getSnapshot() {
      const selected = await selection.poll();
      let entry = selected ? catalog.find(selected.id) : null;
      if (!selected && (Date.now() >= nextFallback || !fallback)) {
        fallback = findLatestSessionFile(codexHome);
        nextFallback = Date.now() + 1500;
      }
      const transcriptPath = entry?.file || (!selected ? fallback : null);
      activeFile = transcriptPath;
      const base = {
        codexHome, transcriptPath, generatedAt: new Date().toISOString(),
        selection: selected ? { id: selected.id, mode: 'desktop', viewedAt: selected.time } : { id: null, mode: 'activity' },
        conversationTitle: entry?.title || '',
      };
      if (!transcriptPath) return { ...base, status: 'waiting', summary: null, reason: selected ? 'selectedLogMissing' : 'noSessions',
        message: selected ? 'Waiting for the selected conversation log.' : 'No Codex session JSONL files found.' };
      try {
        let summary = await reader.read(transcriptPath);
        if (!summary || (selected && summary.sessionId !== selected.id)) {
          return { ...base, status: 'waiting', summary: null, reason: 'noUsage', message: 'Waiting for usage in the selected conversation.' };
        }
        const tier = serviceTiers.read(summary.sessionId);
        if (tier && tier.recordedAt >= (Date.parse(summary.serviceTierUpdatedAt) || 0)) {
          summary = { ...summary, serviceTier: tier.tier };
        }
        return { ...base, status: 'ready', summary, message: 'Local usage updated.' };
      } catch (error) {
        return { ...base, status: 'error', summary: null, message: error.message };
      }
    },
    start(listener) {
      notify = listener;
      for (const root of new Set([codexHome, ...(selection.logsRoots || [selection.logsRoot])].filter(Boolean))) {
        try {
          const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
            const file = filename?.toString() || '';
            if (root === codexHome) {
              if (file.endsWith('.jsonl') && (!activeFile || path.resolve(root, file) === activeFile)) schedule();
              else if (/^logs_\d+\.sqlite(?:-wal)?$/.test(file)) schedule(1000);
            } else if (file.endsWith('.log') && file.includes('-' + selection.pid + '-t0-')) schedule();
          });
          watcher.on('error', () => schedule());
          watchers.push(watcher);
        } catch { /* The heartbeat also detects writes when directory notifications are unavailable. */ }
      }
      timer = setInterval(schedule, intervalSeconds * 1000);
      schedule();
    },
    close() {
      notify = null;
      clearInterval(timer);
      clearTimeout(timeout);
      for (const watcher of watchers) watcher.close();
      catalog.close();
      serviceTiers.close();
      return reader.flush?.();
    },
  };
}

function secondsFromEnv(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

module.exports = { createUsageService, secondsFromEnv };
