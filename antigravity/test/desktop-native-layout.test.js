'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { presentation } = require('../desktop/presentation');

test('the Windows bar keeps the model and effort as metrics enter and leave', {
  skip: process.platform !== 'win32', timeout: 30_000,
}, t => {
  const temp = fs.realpathSync(os.tmpdir());
  const folder = fs.mkdtempSync(path.join(temp, 'usage-monitor-layout-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(folder)), temp);
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const framework = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const wpf = ['PresentationFramework.dll', 'PresentationCore.dll', 'WindowsBase.dll']
    .map(name => '/r:' + path.join(framework, 'WPF', name));
  const root = path.join(__dirname, '..');
  const executable = path.join(folder, 'LayoutCheck.exe');
  const options = { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15_000 };
  const compiled = spawnSync(path.join(framework, 'csc.exe'), [
    '/nologo', '/utf8output', '/target:exe', '/main:LayoutCheck', '/out:' + executable, ...wpf,
    '/r:System.Web.Extensions.dll', '/r:System.Xaml.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
    ...['desktop/native/NativeLauncher.cs', 'desktop/native/MonitorWindow.cs', 'test/native/LayoutCheck.cs']
      .map(file => path.join(root, file)),
  ], options);
  assert.equal(compiled.status, 0, compiled.error?.message || compiled.stdout + compiled.stderr);

  const { bar } = presentation('zh-CN', false).snapshot({ title: 'Example', stats: {
    model: 'Gemini 4 Neon', effort: 'High', measuredCalls: 4, tokensPerSecond: 139.2, hitRate: 0.924,
    lastPromptTokens: 351740, promptTokens: 8224603, outputTokens: 80025, steps: 46, turns: 8,
    tools: 130, firstTokenSeconds: 8.1, turnOutputTokens: 7286,
  } });
  const fixture = path.join(folder, 'bar.json');
  fs.writeFileSync(fixture, JSON.stringify(bar));
  const checked = spawnSync(executable, [fixture], options);
  assert.equal(checked.status, 0, checked.error?.message || checked.stdout + checked.stderr);
  t.diagnostic(checked.stdout.trim());
});
