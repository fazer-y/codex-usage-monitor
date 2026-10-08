'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const STYLES = ['classic', 'minimal', 'compact', 'detailed', 'ascii', 'mono'];
function configPath() {
  return process.env.CODEX_USAGE_MONITOR_CONFIG || path.join(os.homedir(), '.config', 'codex-usage-monitor', 'config.json');
}
function readConfig() {
  try {
    const value = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    validate(value);
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('Invalid monitor config (file preserved): ' + error.message);
  }
}
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected config object');
  if (value.style != null && !STYLES.includes(value.style)) throw new Error('unknown style: ' + value.style);
  if (value.interval != null && (!Number.isFinite(value.interval) || value.interval < 1 || value.interval > 3600)) throw new Error('interval must be 1..3600 seconds');
}
function saveConfig(patch) {
  const value = { ...readConfig(), ...patch };
  validate(value);
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak-' + Date.now() + '-' + process.pid);
  const temp = file + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return value;
}
function settings(flags = {}) {
  const config = readConfig();
  const style = flags.style || process.env.CODEX_USAGE_MONITOR_STYLE || config.style || 'classic';
  const interval = Number(flags.interval ?? process.env.CODEX_USAGE_MONITOR_INTERVAL ?? config.interval ?? 5);
  validate({ style, interval });
  return { style, interval };
}
module.exports = { STYLES, configPath, readConfig, saveConfig, settings };
