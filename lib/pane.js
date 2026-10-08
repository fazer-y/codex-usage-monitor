'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { defaultCodexHome } = require('./session');
function findSessionFile(home, id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const root = path.join(home, 'sessions');
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name.endsWith(id + '.jsonl')) return file;
    }
  }
  return null;
}
function quote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
function openPane(args) {
  if (!process.env.TMUX || !process.env.TMUX_PANE) throw new Error('Run pane inside the Codex tmux window');
  const target = process.env.TMUX_PANE;
  if (!/^%[0-9]+$/.test(target)) throw new Error('Invalid tmux pane');
  const tmux = argv => execFileSync('tmux', argv, { encoding: 'utf8' }).trim();
  const existing = tmux(['show-options', '-p', '-q', '-v', '-t', target, '@codex_usage_pane']);
  if (/^%[0-9]+$/.test(existing)) {
    const panes = tmux(['list-panes', '-t', target, '-F', '#{pane_id}']).split('\n');
    if (panes.includes(existing)) { process.stdout.write('Monitor already running: ' + existing + '\n'); return; }
  }
  const home = args.flags['codex-home'] || defaultCodexHome();
  const file = args.flags.file || findSessionFile(home, process.env.CODEX_THREAD_ID || '');
  if (!file) throw new Error('Cannot identify current session. Supply --file explicitly; no history fallback.');
  const command = [process.execPath, path.resolve(__dirname, '../bin/codex-usage-monitor.js'), 'watch', '--pane', '--file', file];
  for (const flag of ['interval', 'style']) if (args.flags[flag]) command.push('--' + flag, String(args.flags[flag]));
  const pane = tmux(['split-window', '-v', '-f', '-d', '-l', '6', '-t', target, '-P', '-F', '#{pane_id}', command.map(quote).join(' ')]);
  tmux(['set-option', '-p', '-t', target, '@codex_usage_pane', pane]);
  process.stdout.write('Bottom monitor ' + pane + '; input stays in ' + target + '; source: ' + file + '\n');
}
module.exports = { findSessionFile, openPane, quote };
