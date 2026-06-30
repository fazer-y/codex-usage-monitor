# Desktop Tray Usage Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-version Electron system tray app that monitors local Codex usage in real time without consuming model quota.

**Architecture:** Add a `desktop/` Electron app that reuses the existing `lib/session.js`, `lib/pricing.js`, and formatter helpers. Keep filesystem access in the main process, expose snapshots through a narrow preload IPC bridge, and render a compact operational panel from plain JSON.

**Tech Stack:** Node.js CommonJS, Electron, electron-builder, static HTML/CSS/JS, `node:test`.

---

## File Structure

- Modify `package.json`: add Electron scripts, dev dependencies, and packaged files.
- Create `desktop/usage-service.js`: local-only latest-session snapshot service.
- Create `desktop/view-model.js`: convert summaries into renderer-ready text and percentages.
- Create `desktop/main.js`: Electron lifecycle, tray, menu, window, polling.
- Create `desktop/preload.js`: secure renderer IPC bridge.
- Create `desktop/renderer/index.html`: compact monitor panel markup.
- Create `desktop/renderer/styles.css`: restrained desktop panel styling.
- Create `desktop/renderer/app.js`: renderer state updates.
- Create `desktop/assets/tray.svg`: simple tray icon source asset.
- Create `test/desktop-usage-service.test.js`: unit tests for local snapshot behavior.
- Create `test/desktop-view-model.test.js`: unit tests for renderer view model.
- Modify `README.md`: desktop install/run, local-only quota note, platform notes.

---

### Task 1: Add Desktop Package Scripts And Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package scripts and development dependencies**

Modify `package.json` so the scripts section includes:

```json
{
  "test": "node --test test/*.test.js",
  "smoke:statusline": "node bin/codex-usage-monitor.js statusline --file test/fixtures/session-basic.jsonl",
  "smoke:summary": "node bin/codex-usage-monitor.js summary --file test/fixtures/session-basic.jsonl",
  "desktop": "electron desktop/main.js",
  "desktop:package": "electron-builder --config desktop/electron-builder.json"
}
```

Add dev dependencies:

```json
{
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3"
  }
}
```

Add `desktop/` to the existing `files` array.

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created or updated, `node_modules/` remains ignored by git, and `npm` exits 0.

- [ ] **Step 3: Verify existing tests still pass after dependency metadata changes**

Run:

```bash
npm test
```

Expected: all existing `node:test` tests pass.

- [ ] **Step 4: Commit package setup**

```bash
git add package.json package-lock.json
git commit -m "build: add desktop electron scripts"
```

---

### Task 2: Add Local Desktop Usage Service

**Files:**
- Create: `desktop/usage-service.js`
- Create: `test/desktop-usage-service.test.js`

- [ ] **Step 1: Write failing service tests**

Create `test/desktop-usage-service.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createUsageService, secondsFromEnv } = require('../desktop/usage-service');

function tempCodexHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-usage-desktop-'));
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  return home;
}

function copyFixture(codexHome, name = 'session.jsonl') {
  const target = path.join(codexHome, 'sessions', name);
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'session-basic.jsonl'), target);
  return target;
}

test('secondsFromEnv returns default for missing, invalid, or non-positive values', () => {
  assert.equal(secondsFromEnv({}, 'X', 5), 5);
  assert.equal(secondsFromEnv({ X: 'abc' }, 'X', 5), 5);
  assert.equal(secondsFromEnv({ X: '0' }, 'X', 5), 5);
  assert.equal(secondsFromEnv({ X: '-1' }, 'X', 5), 5);
});

test('secondsFromEnv parses positive numbers', () => {
  assert.equal(secondsFromEnv({ X: '2.5' }, 'X', 5), 2.5);
});

test('snapshot reports waiting state when no session exists', async () => {
  const codexHome = tempCodexHome();
  const service = createUsageService({ codexHome });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.status, 'waiting');
  assert.equal(snapshot.codexHome, codexHome);
  assert.equal(snapshot.summary, null);
  assert.match(snapshot.message, /No Codex session/);
});

test('snapshot summarizes the latest local session without network access', async () => {
  const codexHome = tempCodexHome();
  const transcriptPath = copyFixture(codexHome);
  const service = createUsageService({ codexHome });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.codexHome, codexHome);
  assert.equal(snapshot.transcriptPath, transcriptPath);
  assert.equal(snapshot.summary.modelName, 'GPT-5.4 mini');
  assert.equal(snapshot.summary.turnCount, 2);
});
```

- [ ] **Step 2: Run service tests and confirm they fail because the module is missing**

Run:

```bash
node --test test/desktop-usage-service.test.js
```

Expected: FAIL with `Cannot find module '../desktop/usage-service'`.

- [ ] **Step 3: Implement the usage service**

Create `desktop/usage-service.js`:

```js
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
```

- [ ] **Step 4: Run service tests and confirm they pass**

Run:

```bash
node --test test/desktop-usage-service.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit service layer**

```bash
git add desktop/usage-service.js test/desktop-usage-service.test.js
git commit -m "feat: add desktop usage snapshot service"
```

---

### Task 3: Add Renderer View Model

**Files:**
- Create: `desktop/view-model.js`
- Create: `test/desktop-view-model.test.js`

- [ ] **Step 1: Write failing view model tests**

Create `test/desktop-view-model.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { snapshotToViewModel } = require('../desktop/view-model');
const { summarizeSessionFile } = require('../lib/session');

test('snapshotToViewModel renders waiting state', () => {
  const vm = snapshotToViewModel({
    status: 'waiting',
    codexHome: '/tmp/codex',
    transcriptPath: null,
    summary: null,
    message: 'No Codex session JSONL files found under /tmp/codex.',
    generatedAt: '2026-06-30T00:00:00.000Z',
  });

  assert.equal(vm.status, 'waiting');
  assert.equal(vm.title, 'Waiting for Codex usage');
  assert.equal(vm.rows.length, 0);
  assert.match(vm.footer, /local files only/i);
});

test('snapshotToViewModel renders usage rows from a summary', async () => {
  const summary = await summarizeSessionFile(path.join(__dirname, 'fixtures', 'session-basic.jsonl'));
  const vm = snapshotToViewModel({
    status: 'ready',
    codexHome: '/tmp/codex',
    transcriptPath: '/tmp/codex/sessions/session-basic.jsonl',
    summary,
    message: 'Usage loaded from local Codex session files.',
    generatedAt: '2026-06-30T00:00:00.000Z',
  });

  assert.equal(vm.status, 'ready');
  assert.equal(vm.title, 'GPT-5.4 mini');
  assert.equal(vm.subtitle, 'think medium · prolite');
  assert.deepEqual(vm.metrics[0], { label: 'Context', value: '12%', percent: 12 });
  assert.equal(vm.rows.some((row) => row.label === 'This turn'), true);
  assert.match(vm.cost, /API/);
});
```

- [ ] **Step 2: Run view model tests and confirm they fail because the module is missing**

Run:

```bash
node --test test/desktop-view-model.test.js
```

Expected: FAIL with `Cannot find module '../desktop/view-model'`.

- [ ] **Step 3: Implement the view model**

Create `desktop/view-model.js`:

```js
'use strict';

const { formatTokens, formatUsd } = require('../lib/format');

function snapshotToViewModel(snapshot) {
  if (!snapshot || snapshot.status !== 'ready' || !snapshot.summary) {
    return {
      status: snapshot ? snapshot.status : 'waiting',
      title: 'Waiting for Codex usage',
      subtitle: snapshot && snapshot.message ? snapshot.message : 'No local session data yet.',
      metrics: [],
      rows: [],
      cost: '',
      footer: `Local files only. No network or model calls. ${snapshot && snapshot.codexHome ? snapshot.codexHome : ''}`.trim(),
      generatedAt: snapshot && snapshot.generatedAt,
    };
  }

  const summary = snapshot.summary;
  const primary = summary.rateLimits && summary.rateLimits.primary;
  const secondary = summary.rateLimits && summary.rateLimits.secondary;

  return {
    status: 'ready',
    title: summary.modelName || summary.model || 'unknown model',
    subtitle: [summary.reasoningEffort ? `think ${summary.reasoningEffort}` : '', summary.planType || ''].filter(Boolean).join(' · '),
    metrics: [
      metric('Context', summary.contextUsedPercent),
      metric(primary ? primary.label : '5h', primary && primary.usedPercent),
      metric(secondary ? secondary.label : '7d', secondary && secondary.usedPercent),
      metric('Cache', summary.totalUsage && summary.totalUsage.cacheHitPercent),
    ].filter((item) => item.percent != null),
    rows: [
      row('This turn', turnText(summary.latestUsage)),
      row('Session', `${formatTokens(summary.totalUsage.inputTokens)} in · ${formatTokens(summary.totalUsage.outputTokens)} out · ${summary.turnCount} turns`),
      row('Models', modelText(summary.cost)),
      row('Source', snapshot.transcriptPath || 'unknown'),
    ].filter((item) => item.value),
    cost: costText(summary.cost),
    footer: 'Local files only. No network or model calls.',
    generatedAt: snapshot.generatedAt,
  };
}

function metric(label, percent) {
  if (percent == null) return { label, value: '', percent: null };
  return { label, value: `${trimFixed(percent, 1)}%`, percent };
}

function row(label, value) {
  return { label, value };
}

function turnText(usage) {
  if (!usage) return '';
  const parts = [`${formatTokens(usage.inputTokens)} in`, `${formatTokens(usage.outputTokens)} out`];
  if (usage.reasoningOutputTokens) parts.push(`${formatTokens(usage.reasoningOutputTokens)} reason`);
  return parts.join(' · ');
}

function costText(cost) {
  if (!cost || cost.usd == null) return '';
  return `API≈${cost.complete ? '' : '~'}${formatUsd(cost.usd)}`;
}

function modelText(cost) {
  if (!cost || !Array.isArray(cost.perModel) || cost.perModel.length === 0) return '';
  return cost.perModel.map((item) => `${item.name || item.modelId} ${formatUsd(item.usd)}`).join(' · ');
}

function trimFixed(value, digits) {
  return Number(value).toFixed(digits).replace(/\.0$/, '');
}

module.exports = {
  snapshotToViewModel,
};
```

- [ ] **Step 4: Run view model tests and confirm they pass**

Run:

```bash
node --test test/desktop-view-model.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit view model**

```bash
git add desktop/view-model.js test/desktop-view-model.test.js
git commit -m "feat: add desktop renderer view model"
```

---

### Task 4: Add Electron Main Process And Preload Bridge

**Files:**
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Create: `desktop/assets/tray.svg`
- Create: `desktop/electron-builder.json`

- [ ] **Step 1: Add Electron shell files**

Create `desktop/preload.js`:

```js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexUsageMonitor', {
  getSnapshot: () => ipcRenderer.invoke('usage:getSnapshot'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  onSnapshot: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('usage:snapshot', listener);
    return () => ipcRenderer.removeListener('usage:snapshot', listener);
  },
});
```

Create `desktop/main.js`:

```js
'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
const { createUsageService } = require('./usage-service');
const { snapshotToViewModel } = require('./view-model');

const service = createUsageService();
let tray = null;
let window = null;
let latestViewModel = null;
let pollTimer = null;

app.setName('Codex Usage Monitor');
app.whenReady().then(start).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer);
});

async function start() {
  createTray();
  createWindow();
  registerIpc();
  await refreshSnapshot();
  pollTimer = setInterval(refreshSnapshot, service.intervalSeconds * 1000);
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray.svg'));
    tray.setToolTip('Codex Usage Monitor');
    tray.on('click', toggleWindow);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Refresh', click: refreshSnapshot },
      { label: 'Open Sessions Folder', click: openSessionsFolder },
      { label: 'Open Settings', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
  } catch (error) {
    console.error(`Tray unavailable: ${error.message}`);
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 420,
    height: 560,
    show: !tray,
    resizable: false,
    title: 'Codex Usage Monitor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
}

function registerIpc() {
  ipcMain.handle('usage:getSnapshot', () => latestViewModel);
  ipcMain.handle('usage:refresh', refreshSnapshot);
}

async function refreshSnapshot() {
  const snapshot = await service.getSnapshot();
  latestViewModel = snapshotToViewModel(snapshot);
  if (window && !window.isDestroyed()) {
    window.webContents.send('usage:snapshot', latestViewModel);
  }
  if (tray) tray.setToolTip(`Codex Usage Monitor - ${latestViewModel.title}`);
  return latestViewModel;
}

function toggleWindow() {
  if (!window) return;
  if (window.isVisible()) window.hide();
  else showWindow();
}

function showWindow() {
  if (!window) return;
  window.show();
  window.focus();
}

function openSessionsFolder() {
  shell.openPath(path.join(service.codexHome, 'sessions'));
}
```

Create `desktop/assets/tray.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#20242c"/>
  <path d="M8 20h16v3H8zM9 9h4v9H9zM15 12h4v6h-4zM21 6h4v12h-4z" fill="#8bd450"/>
</svg>
```

Create `desktop/electron-builder.json`:

```json
{
  "appId": "dev.codex-usage-monitor.desktop",
  "productName": "Codex Usage Monitor",
  "directories": {
    "output": "dist/desktop"
  },
  "files": [
    "desktop/**/*",
    "lib/**/*",
    "package.json",
    "README.md",
    "LICENSE"
  ],
  "win": {
    "target": ["nsis", "dir"]
  },
  "mac": {
    "target": ["dmg", "zip"]
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Utility"
  }
}
```

- [ ] **Step 2: Run a syntax smoke check**

Run:

```bash
node --check desktop/main.js
node --check desktop/preload.js
```

Expected: both commands exit 0.

- [ ] **Step 3: Commit Electron shell**

```bash
git add desktop/main.js desktop/preload.js desktop/assets/tray.svg desktop/electron-builder.json
git commit -m "feat: add electron tray shell"
```

---

### Task 5: Add Renderer Panel

**Files:**
- Create: `desktop/renderer/index.html`
- Create: `desktop/renderer/styles.css`
- Create: `desktop/renderer/app.js`

- [ ] **Step 1: Add static renderer files**

Create `desktop/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Codex Usage Monitor</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="panel">
      <header class="header">
        <div>
          <h1 id="title">Waiting for Codex usage</h1>
          <p id="subtitle">Reading local session files</p>
        </div>
        <button id="refresh" type="button" title="Refresh">Refresh</button>
      </header>
      <section id="metrics" class="metrics" aria-label="Usage metrics"></section>
      <section id="rows" class="rows" aria-label="Usage details"></section>
      <footer>
        <strong id="cost"></strong>
        <span id="footer">Local files only. No network or model calls.</span>
      </footer>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
```

Create `desktop/renderer/styles.css` with fixed compact panel dimensions, stable
metric bars, restrained colors, and no nested card layout:

```css
:root {
  color-scheme: dark;
  --bg: #17191f;
  --panel: #20242c;
  --text: #f2f5f0;
  --muted: #9ca6ad;
  --line: #303640;
  --accent: #8bd450;
  --warn: #e7b84f;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 380px;
  min-height: 520px;
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--bg);
}

.panel {
  width: 100%;
  min-height: 100vh;
  padding: 18px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: 0;
}

p {
  margin: 4px 0 0;
  color: var(--muted);
}

button {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text);
  background: var(--panel);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}

.metric {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.metric-label,
.row-label {
  color: var(--muted);
  font-size: 12px;
}

.metric-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
}

.bar {
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #343b46;
}

.bar-fill {
  height: 100%;
  width: 0%;
  background: var(--accent);
}

.rows {
  border-top: 1px solid var(--line);
}

.row {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.row-value {
  overflow-wrap: anywhere;
}

footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 14px;
  color: var(--muted);
}

#cost {
  color: var(--warn);
  font-size: 18px;
}
```

Create `desktop/renderer/app.js`:

```js
'use strict';

const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');
const metrics = document.getElementById('metrics');
const rows = document.getElementById('rows');
const cost = document.getElementById('cost');
const footer = document.getElementById('footer');
const refresh = document.getElementById('refresh');

refresh.addEventListener('click', () => {
  window.codexUsageMonitor.refresh().then(render).catch(renderError);
});

window.codexUsageMonitor.getSnapshot().then(render).catch(renderError);
window.codexUsageMonitor.onSnapshot(render);

function render(model) {
  if (!model) return;
  title.textContent = model.title || 'Waiting for Codex usage';
  subtitle.textContent = model.subtitle || '';
  cost.textContent = model.cost || '';
  footer.textContent = model.footer || 'Local files only. No network or model calls.';

  metrics.replaceChildren(...(model.metrics || []).map(renderMetric));
  rows.replaceChildren(...(model.rows || []).map(renderRow));
}

function renderMetric(metric) {
  const item = document.createElement('article');
  item.className = 'metric';
  item.innerHTML = '<div class="metric-label"></div><div class="metric-value"></div><div class="bar"><div class="bar-fill"></div></div>';
  item.querySelector('.metric-label').textContent = metric.label;
  item.querySelector('.metric-value').textContent = metric.value;
  item.querySelector('.bar-fill').style.width = `${Math.max(0, Math.min(100, metric.percent || 0))}%`;
  return item;
}

function renderRow(row) {
  const item = document.createElement('div');
  item.className = 'row';
  item.innerHTML = '<div class="row-label"></div><div class="row-value"></div>';
  item.querySelector('.row-label').textContent = row.label;
  item.querySelector('.row-value').textContent = row.value;
  return item;
}

function renderError(error) {
  render({
    title: 'Monitor error',
    subtitle: error && error.message ? error.message : 'Unable to load usage.',
    metrics: [],
    rows: [],
    cost: '',
    footer: 'Local files only. No network or model calls.',
  });
}
```

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check desktop/renderer/app.js
```

Expected: exits 0.

- [ ] **Step 3: Commit renderer panel**

```bash
git add desktop/renderer/index.html desktop/renderer/styles.css desktop/renderer/app.js
git commit -m "feat: add desktop usage panel"
```

---

### Task 6: Document Desktop Usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README desktop section**

Add a `Desktop Tray App` section with these commands:

```markdown
## Desktop Tray App

The desktop app runs as an Electron tray or menu bar monitor on Windows,
macOS, and Ubuntu graphical desktops.

```bash
npm install
npm run desktop
```

Package local installers:

```bash
npm run desktop:package
```

The desktop app does not consume model quota. It reads local Codex session JSONL
files from `CODEX_HOME` or `~/.codex`, summarizes them on the same machine, and
does not call OpenAI APIs or telemetry services.

Environment variables:

| Variable | Effect |
| --- | --- |
| `CODEX_USAGE_MONITOR_DESKTOP_INTERVAL_SECONDS=N` | Refresh the desktop snapshot every `N` seconds. Default: 5. |
| `CODEX_HOME=PATH` | Read Codex sessions from a custom home directory. |
```

- [ ] **Step 2: Commit README update**

```bash
git add README.md
git commit -m "docs: describe desktop tray monitor"
```

---

### Task 7: Full Verification

**Files:**
- No source changes expected unless verification exposes defects.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run smoke commands**

Run:

```bash
npm run smoke:summary
npm run smoke:statusline
```

Expected: both commands exit 0 and print usage output from the fixture.

- [ ] **Step 3: Run desktop syntax checks**

Run:

```bash
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/usage-service.js
node --check desktop/view-model.js
node --check desktop/renderer/app.js
```

Expected: all commands exit 0.

- [ ] **Step 4: Run Electron startup smoke test**

Run:

```bash
npm run desktop
```

Expected on a graphical desktop: the app starts, creates a tray icon where the
desktop supports one, opens the usage panel from the tray click, and shows local
fixture or real Codex usage when sessions are present.

- [ ] **Step 5: Run packaging dry build**

Run:

```bash
npm run desktop:package
```

Expected: electron-builder produces a local package under `dist/desktop` for
the current platform. Cross-platform installer artifacts still require running
the build on each target OS.

---

## Self-Review

- Spec coverage: tasks cover package setup, local-only data service, renderer
  view model, tray shell, compact panel UI, documentation, and verification.
- Placeholder scan: this plan contains no intentionally deferred code paths.
- Type consistency: snapshot status values are `waiting`, `ready`, and `error`;
  the renderer consumes the view model shape produced by
  `snapshotToViewModel()`.
