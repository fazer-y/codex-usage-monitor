#!/usr/bin/env node
'use strict';

const { formatStatusLine, formatStopBox } = require('../lib/format');
const { defaultCodexHome, findLatestSessionFile, summarizeSessionFile } = require('../lib/session');

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
  const intervalMs = Math.max(1000, Number(args.flags.interval || 5) * 1000);
  const options = renderOptions(args);
  const print = async () => {
    const summary = await loadSummary(args);
    process.stdout.write(`\r${clearLine()}${formatStatusLine(summary, options)}`);
  };
  await print();
  setInterval(print, intervalMs).unref();
  await new Promise(() => {});
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
  const file = args.flags.file || findLatestSessionFile(args.flags['codex-home'] || defaultCodexHome());
  return summarizeSessionFile(file);
}

function renderOptions(args) {
  return {
    ascii: Boolean(args.flags.ascii || process.env.CODEX_USAGE_MONITOR_ASCII),
    color: !(args.flags['no-color'] || process.env.NO_COLOR || process.env.CODEX_USAGE_MONITOR_NO_COLOR),
  };
}

function parseArgs(argv) {
  const result = { command: null, flags: {} };
  const commands = new Set(['summary', 'statusline', 'json', 'watch', 'doctor', 'help']);

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
