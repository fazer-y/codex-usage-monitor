'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.join(__dirname, '..');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
}

test('renderer uses local assets and a constrained content security policy', () => {
  const html = fs.readFileSync(path.join(root, 'desktop/renderer/index.html'), 'utf8');
  assert.match(html, /default-src 'self'/);
  assert.match(html, /id="metrics"/);
  assert.match(html, /id="details"/);
  assert.match(html, /aria-label="Refresh"/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>(.|\n)*<\/script>/);
});

test('renderer updates values and supports details, docking and reversible folding', async () => {
  const html = fs.readFileSync(path.join(root, 'desktop/renderer/index.html'), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.get('details').hidden = true;
  elements.get('dock').setAttribute('aria-pressed', 'true');
  const actions = [];
  let update;
  let windowState;
  let updateTheme;
  const rootStyle = new Map();
  const documentRoot = { style: { setProperty: (key, value) => rootStyle.set(key, value) } };
  const bridge = {
    getSnapshot: async () => null,
    getWindowState: async () => ({ docked: true, expanded: false, folded: false, detailsBelow: true }),
    getTheme: async () => null,
    onTheme: callback => { updateTheme = callback; },
    onSnapshot: callback => { update = callback; },
    onWindowState: callback => { windowState = callback; },
    refresh: async () => null,
    setExpanded: async value => { actions.push(['expanded', value]); return { expanded: value }; },
    setDocked: value => actions.push(['docked', value]),
    setFolded: async value => { actions.push(['folded', value]); return { folded: value, expanded: false }; },
  };
  const source = fs.readFileSync(path.join(root, 'desktop/renderer/app.js'), 'utf8');
  vm.runInNewContext(source, {
    window: { codexUsageMonitor: bridge },
    document: { documentElement: documentRoot, getElementById: id => elements.get(id), createElement: () => new Element() },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('panel').dataset.detailsBelow, 'true');
  updateTheme({ mode: 'dark', colors: { surface: '#181818', text: '#ffffff', accent: '#339cff' } });
  assert.equal(documentRoot.style.colorScheme, 'dark');
  assert.equal(rootStyle.get('--surface'), '#181818');
  assert.equal(rootStyle.get('--text'), '#ffffff');
  const firstModel = { status: 'ready', title: 'GPT-6.1 Sol', subtitle: 'max', metrics: [{ kind: 'cache', label: '缓存', value: '91%' }],
    rows: [{ label: 'Test', value: '<script>untrusted</script>' }] };
  update(firstModel);
  assert.equal(elements.get('title').textContent, 'GPT-6.1 Sol');
  assert.equal(elements.get('reasoning').textContent, 'Max');
  assert.equal(elements.get('reasoning').hidden, false);
  assert.equal(elements.get('metrics').children[0].children[1].textContent, '91%');
  update({ ...firstModel, subtitle: 'xhigh' });
  assert.equal(elements.get('reasoning').textContent, 'XHigh');
  update({ status: 'ready', title: 'GPT-6 Luna', metrics: [{ kind: 'cache', label: '缓存', value: '82%' }], rows: [{ label: 'Test', value: 'Current details' }] });
  assert.equal(elements.get('title').textContent, 'GPT-6 Luna');
  assert.equal(elements.get('reasoning').hidden, true);
  assert.equal(elements.get('metrics').children[0].children[1].textContent, '82%');
  assert.equal(elements.get('rows').children.length, 0);
  await elements.get('expand').listeners.click();
  assert.equal(elements.get('details').hidden, false);
  assert.equal(elements.get('expand').getAttribute('aria-expanded'), 'true');
  assert.equal(elements.get('rows').children[0].children[1].textContent, 'Current details');
  windowState({ docked: false, detailsBelow: false });
  assert.equal(elements.get('panel').dataset.detailsBelow, 'false');
  assert.equal(elements.get('dock').title, '居中吸附到 Codex 标题栏');
  windowState({ expanded: false });
  assert.equal(elements.get('details').hidden, true);
  assert.equal(elements.get('expand').getAttribute('aria-expanded'), 'false');
  elements.get('dock').listeners.click();
  await elements.get('fold').listeners.click();
  assert.equal(elements.get('strip').hidden, true);
  assert.equal(elements.get('restore').hidden, false);
  assert.equal(elements.get('details').hidden, true);
  assert.equal(elements.get('panel').dataset.folded, 'true');
  update({ status: 'ready', title: 'GPT-6.1 Sol', subtitle: 'max', metrics: [{ kind: 'cache', label: '缓存', value: '95%' }],
    rows: [{ label: 'Test', value: 'Updated while folded' }] });
  assert.equal(elements.get('title').textContent, 'GPT-6 Luna');
  assert.equal(elements.get('metrics').children[0].children[1].textContent, '82%');
  await elements.get('restore').listeners.click();
  assert.equal(elements.get('strip').hidden, false);
  assert.equal(elements.get('restore').hidden, true);
  assert.equal(elements.get('panel').dataset.folded, 'false');
  assert.equal(elements.get('title').textContent, 'GPT-6.1 Sol');
  assert.equal(elements.get('metrics').children[0].children[1].textContent, '95%');
  assert.equal(elements.get('details').hidden, true);
  await elements.get('expand').listeners.click();
  assert.equal(elements.get('rows').children[0].children[1].textContent, 'Updated while folded');
  windowState({ folded: true, expanded: true });
  assert.equal(elements.get('details').hidden, true);
  assert.equal(elements.get('expand').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(actions, [['expanded', true], ['docked', true], ['folded', true], ['folded', false], ['expanded', true]]);
  assert.doesNotMatch(source, /innerHTML/);
});
