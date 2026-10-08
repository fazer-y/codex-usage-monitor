#!/usr/bin/env node
'use strict';

const { formatStatusLine, formatStopBox, formatMonitor } = require('../lib/format');
const { defaultCodexHome, findLatestSessionFile, summarizeSessionFile } = require('../lib/session');

const { STYLES, settings, saveConfig, readConfig, configPath } = require('../lib/config');

main().catch((error) => {
  process.stderr.write(`codex-usage-monitor: ${error.message}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command || 'summary';

  if (command === 'help' || args.flags.help) {
    process.stdout.write(helpText());
    return;
  }

  if (command === 'config') {
    const patch = {};
    if (args.flags.style) patch.style = args.flags.style;
    if (args.flags.interval) patch.interval = Number(args.flags.interval);
    const config = Object.keys(patch).length ? saveConfig(patch) : readConfig();
    process.stdout.write(JSON.stringify({ path: configPath(), ...config }, null, 2) + '\n');
    return;
  }
  if (command === 'preview') {
    const summary = await loadSummary(args);
    for (const style of (args.flags.style ? [settings(args.flags).style] : STYLES)) {
      process.stdout.write(formatMonitor(summary, { ...renderOptions(args), style, columns: 180, rows: 8 }) + '\n\n');
    }
    return;
  }
  if (command === 'pane') {
    const { openPane } = require('../lib/pane');
    openPane(args);
    return;
  }
  if (command === 'doctor') {
    await runDoctor(args);
    return;
  }

  if (command === 'watch') {
    await runWatch(args);
    return;
  }

  const summary = await loadSummary(args);
  const options = renderOptions(args);

  if (command === 'json') {
    process.stdout.write(`${JSON.stringify(summary || { error: 'no session found' }, null, 2)}\n`);
    return;
  }

  if (command === 'statusline') {
    process.stdout.write(`${formatStatusLine(summary, options)}\n`);
    return;
  }

  if (command === 'summary') {
    process.stdout.write(`${formatStopBox(summary, options) || 'codex usage: no session found'}\n`);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

async function runWatch(args) {
  settings(args.flags); // Reject invalid startup settings before entering the loop.
  const pane = Boolean(args.flags.pane);
  if (pane && !process.stdout.isTTY) throw new Error('--pane requires a dedicated terminal');
  let stopped = false;
  let timer;
  let wake;
  let tick = 0;
  let lastError = '';
  const stop = () => { stopped = true; clearTimeout(timer); if (wake) wake(); };
  const input = data => { if (data.includes('q') || data.includes('\x03')) stop(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (pane) {
    process.stdout.write('\x1b[?1049h\x1b[?25l');
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.on('data', input);
      process.stdin.resume();
    }
  }
  // Pin to this session; never switch to a concurrently active thread.
  let pinnedFile = args.flags.file || null;
  try {
    while (!stopped) {
      let interval = 5;
      try {
        const config = settings(args.flags); // Hot reload styles/config every tick.
        interval = config.interval;
        const summary = await loadSummary({ ...args, flags: { ...args.flags, file: pinnedFile } });
        if (summary) pinnedFile = summary.transcriptPath;
        const options = { ...renderOptions(args), ...config, tick: ++tick,
          columns: process.stdout.columns, rows: process.stdout.rows };
        const output = pane ? formatMonitor(summary, options) : formatStatusLine(summary, options);
        process.stdout.write(pane ? '\x1b[H\x1b[2J' + output : output + '\n');
        lastError = '';
      } catch (error) {
        if (error.message !== lastError) process.stderr.write('monitor: ' + error.message + '\n');
        lastError = error.message;
      }
      if (!stopped) await new Promise(resolve => { wake = resolve; timer = setTimeout(resolve, interval * 1000); });
    }
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (pane) {
      process.stdin.off('data', input);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1b[?25h\x1b[?1049l');
    }
  }
}

async function runDoctor(args) {
  const codexHome = args.flags['codex-home'] || defaultCodexHome();
  const latest = args.flags.file || findLatestSessionFile(codexHome);
  process.stdout.write(`Codex home: ${codexHome}\n`);
  process.stdout.write(`Latest session: ${latest || 'not found'}\n`);
  if (latest) {
    const summary = await summarizeSessionFile(latest);
    process.stdout.write(`Model: ${summary ? summary.modelName : 'unreadable'}\n`);
    process.stdout.write(`Turns: ${summary ? summary.turnCount : 0}\n`);
  }
}

async function loadSummary(args) {
  const home = args.flags['codex-home'] || defaultCodexHome();
  const { findSessionFile } = require('../lib/pane');
  const file = args.flags.file || (process.env.CODEX_THREAD_ID
    ? findSessionFile(home, process.env.CODEX_THREAD_ID)
    : findLatestSessionFile(home));
  return summarizeSessionFile(file);
}

function renderOptions(args) {
  return {
    ...settings(args.flags),
    ascii: Boolean(args.flags.ascii || process.env.CODEX_USAGE_MONITOR_ASCII),
    color: !(args.flags['no-color'] || process.env.NO_COLOR || process.env.CODEX_USAGE_MONITOR_NO_COLOR),
  };
}

function parseArgs(argv) {
  const result = { command: null, flags: {} };
  const commands = new Set(['summary', 'statusline', 'json', 'watch', 'doctor', 'help', 'config', 'preview', 'pane']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!result.command && commands.has(arg)) {
      result.command = arg;
      continue;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        result.flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const key = arg.slice(2);
      if (['ascii', 'no-color', 'help', 'pane'].includes(key)) { result.flags[key] = true; continue; }
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result.flags[key] = next;
        i++;
      } else {
        result.flags[key] = true;
      }
    }
  }

  return result;
}

function clearLine() {
  return process.stdout.isTTY ? '\x1b[2K' : '';
}

function helpText() {
  return `codex-usage-monitor

Usage:
  codex-usage-monitor summary [--file session.jsonl]
  codex-usage-monitor statusline [--file session.jsonl]
  codex-usage-monitor json [--file session.jsonl]
  codex-usage-monitor watch [--interval 5]  Refresh statusline every N seconds
  codex-usage-monitor doctor
  codex-usage-monitor pane [--file PATH]  Open a dedicated bottom tmux pane
  codex-usage-monitor preview [--style NAME]
  codex-usage-monitor config [--style NAME] [--interval N]
  Styles: classic, minimal, compact, detailed, ascii, mono

Options:
  --file PATH        Read a specific Codex session JSONL file
  --codex-home PATH  Override CODEX_HOME / ~/.codex
  --ascii            Use ASCII progress bars
  --no-color         Disable ANSI color

Environment:
  CODEX_USAGE_MONITOR_HOOK_INTERVAL_SECONDS=N
                   Throttle Stop-hook boxes to once every N seconds
  CODEX_USAGE_MONITOR_WORK_INTERVAL_SECONDS=N
                   Throttle PostToolUse boxes to once every N seconds
  CODEX_USAGE_MONITOR_DIRECT_TTY=1
                   Enable direct terminal writes from hooks when stderr is hidden
`;
}
