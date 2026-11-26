'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createController } = require('../desktop/native-main');
const { FOLDED_WIDTH, STRIP_WIDTH } = require('../desktop/docking');

test('the overlay follows focus and chats, folds to a handle, and closes its resources', t => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-bar-controller-'));
  const events = [];
  const selections = [];
  let onWindow;
  let closedStore = false;
  let closedObserver = false;
  let exited = false;
  const store = {
    read: title => {
      selections.push(title);
      return title === 'Unknown' ? null : { title, stats: { model: title, tokensPerSecond: null } };
    },
    readId: id => id === 'exact-id' ? { title: 'Side conversation' } : null,
    release() {},
    close: () => { closedStore = true; },
  };
  const controller = createController({ store, userData, appSettings: path.join(userData, 'theme.json'),
    send: (event, done) => { events.push(event); done?.(); }, exit: () => { exited = true; },
    observe: onChange => { onWindow = onChange; return { close: () => { closedObserver = true; } }; } });
  t.after(() => { controller.close(); fs.rmSync(userData, { recursive: true, force: true }); });

  const workArea = { x: 0, y: 0, width: 1600, height: 900 };
  const host = { ...workArea, found: true, active: true, scale: 1, handle: '100', foregroundPid: 2, title: 'First' };
  const last = event => events.findLast(value => value.event === event).data;
  controller.receive({ method: 'ready', data: { pid: 1, scale: 1, locale: 'en-US', workArea } });
  onWindow(host);
  assert.equal(last('window').visible, true);
  assert.equal(last('snapshot').title, 'First');
  const wide = last('window').bounds.width;
  onWindow({ ...host, width: 1000 });
  assert.equal(last('window').bounds.width, STRIP_WIDTH);
  onWindow(host);
  assert.equal(last('window').bounds.width, wide);
  assert.ok(wide > STRIP_WIDTH);
  onWindow({ ...host, title: 'Second' });
  assert.equal(last('snapshot').title, 'Second');
  onWindow({ ...host, title: 'Unknown' });
  assert.equal(last('snapshot').title, 'Open a conversation');
  assert.equal(controller.details().conversationTitle, 'Second');
  assert.equal(controller.details('exact-id').conversationTitle, 'Side conversation');
  controller.receive({ method: 'folded', value: true });
  assert.equal(last('window').bounds.width, FOLDED_WIDTH);
  const beforeSwitch = selections.length;
  onWindow({ ...host, title: 'Third' });
  assert.equal(selections.slice(beforeSwitch).includes('Third'), false);
  controller.receive({ method: 'folded', value: false });
  assert.equal(last('snapshot').title, 'Third');
  onWindow({ ...host, title: 'Usage Monitor - Antigravi...' });
  assert.equal(last('window').visible, false);
  assert.equal(controller.details().conversationTitle, 'Third');
  onWindow({ ...host, title: 'Third', active: false });
  assert.equal(last('window').visible, false);
  controller.close();
  assert.equal(closedStore && closedObserver && exited, true);
});
