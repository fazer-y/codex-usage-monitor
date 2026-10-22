'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function stage(destination) {
  const resolved = path.resolve(destination);
  if (!resolved.startsWith(path.join(root, 'dist') + path.sep)) throw new Error('Package output must be inside dist.');
  fs.rmSync(resolved, { recursive: true, force: true });
  function copy(source, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  copy(path.join(__dirname, 'native/bin/Codex Usage Monitor.exe'), path.join(resolved, 'Codex Usage Monitor.exe'));
  for (const name of ['README.md', 'README.zh-CN.md', 'LICENSE', 'plugin.json', 'mcp.json', '.codex-plugin/plugin.json'])
    copy(path.join(root, name), path.join(resolved, name));
  for (const name of fs.readdirSync(__dirname).filter(name => name.endsWith('.js') && !['build-native.js', 'package-native.js', 'launch-native.js'].includes(name)))
    copy(path.join(__dirname, name), path.join(resolved, 'app/desktop', name));
  for (const name of ['native/bin/window-observer.exe'])
    copy(path.join(__dirname, name), path.join(resolved, 'app/desktop', name));
  fs.cpSync(path.join(root, 'lib'), path.join(resolved, 'app/lib'), { recursive: true });
  const pkg = require('../package.json');
  fs.writeFileSync(path.join(resolved, 'app/package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'commonjs' }));
  const lock = require('../package-lock.json');
  for (const [name, value] of Object.entries(lock.packages)) {
    if (!name.startsWith('node_modules/') || value.dev || value.link) continue;
    const source = path.join(root, name);
    fs.cpSync(source, path.join(resolved, 'app', name), { recursive: true, filter: file => {
      const relative = path.relative(source, file);
      if (!relative) return true;
      if (relative.split(path.sep).some(part => ['node_modules', '.git', 'test', 'tests', 'examples', 'docs'].includes(part))) return false;
      return fs.statSync(file).isDirectory() || /\.(?:[cm]?js|json|node|wasm|pem|crt)$|(?:license|notice|copying)/i.test(path.basename(file));
    } });
  }
  return resolved;
}

function findNsis(env = process.env) {
  const found = spawnSync('where.exe', ['makensis.exe'], { encoding: 'utf8', windowsHide: true });
  const candidates = [env.NSIS_MAKENSIS, ...(found.stdout || '').trim().split(/\r?\n/),
    ...[env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean).map(base => path.join(base, 'NSIS', 'makensis.exe'))];
  const result = candidates.find(file => file && fs.existsSync(file));
  if (!result) throw new Error('NSIS was not found. Install NSIS or set NSIS_MAKENSIS to makensis.exe.');
  return result;
}

if (require.main === module) {
  if (process.platform !== 'win32') throw new Error('The desktop package requires Windows.');
  const output = stage(path.join(root, 'dist/desktop/windows-x64'));
  console.log('Packaged ' + path.relative(root, output));
  if (process.argv.includes('--installer')) {
    const result = spawnSync(findNsis(), ['/V2', '/INPUTCHARSET', 'UTF8', `/DVERSION=${require('../package.json').version}`,
      `/DPACKAGE=${output}`, `/DOUTPUT=${path.join(root, 'dist/desktop/codex-usage-monitor-setup-windows-x64.exe')}`,
      path.join(__dirname, 'native-installer.nsi')], { encoding: 'utf8', windowsHide: true });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

module.exports = { stage, findNsis };
