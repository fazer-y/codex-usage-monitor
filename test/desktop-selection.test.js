'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CodexSelection, selectionFromLine } = require('../desktop/codex-selection');
const { createUsageService } = require('../desktop/usage-service');
const { DatabaseSync } = require('node:sqlite');

const idA = '01234567-0123-4567-89ab-0123456789ab';
const idB = '01234567-0123-4567-89ab-0123456789ac';
function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.match(path.basename(root), /^cum-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function viewLine(id, time = '2026-10-21T12:00:00.000Z') {
  return time + ' info [AppServerConnection] response_routed conversationId=' + id
    + ' errorCode=null hadInternalHandler=false hadPending=true method=thread/attachment/list originWebcontentsId=1 targetDestroyed=false\n';
}

test('selection accepts successful desktop view requests and rejects background events', () => {
  const line = viewLine(idA);
  assert.equal(selectionFromLine(line).id, idA);
  assert.equal(selectionFromLine(line.replace('hadInternalHandler=false', 'hadInternalHandler=true')), null);
  assert.equal(selectionFromLine(line.replace('thread/attachment/list', 'thread/tokenUsage/updated')), null);
  assert.equal(selectionFromLine(line.replace('targetDestroyed=false', 'targetDestroyed=true')), null);
  assert.equal(selectionFromLine(line.replace('errorCode=null', 'errorCode=500')), null);
});

test('desktop selection tails completed log lines and resets when the host changes', async t => {
  const logsRoot = temp(t);
  const day = path.join(logsRoot, '2026', '10', '21');
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, 'codex-desktop-test-123-t0-i1-120000-0.log');
  fs.writeFileSync(file, viewLine(idA));
  const selection = new CodexSelection({ logsRoot });
  selection.setHostPid(123);
  assert.equal((await selection.poll()).id, idA);
  const next = viewLine(idB, '2026-10-21T12:00:05.000Z');
  fs.appendFileSync(file, next.slice(0, -1));
  assert.equal((await selection.poll()).id, idA);
  fs.appendFileSync(file, '\n');
  assert.equal((await selection.poll()).id, idB);
  selection.setHostPid(456);
  assert.equal(await selection.poll(), null);
});

test('selected desktop conversations stay selected while other logs are written', async t => {
  const codexHome = temp(t);
  fs.mkdirSync(path.join(codexHome, 'sessions'));
  fs.mkdirSync(path.join(codexHome, 'archived_sessions'));
  const original = fs.readFileSync(path.join(__dirname, 'fixtures', 'session-basic.jsonl'), 'utf8');
  const fileA = path.join(codexHome, 'archived_sessions', 'rollout-' + idA + '.jsonl');
  const fileB = path.join(codexHome, 'sessions', 'rollout-' + idB + '.jsonl');
  fs.writeFileSync(fileA, original.replaceAll('sess_basic', idA));
  fs.writeFileSync(fileB, original.replaceAll('sess_basic', idB));
  const db = new DatabaseSync(path.join(codexHome, 'state_5.sqlite'));
  db.exec('CREATE TABLE threads(id TEXT PRIMARY KEY, rollout_path TEXT, name TEXT, title TEXT)');
  const add = db.prepare('INSERT INTO threads VALUES(?,?,?,?)');
  add.run(idA, path.toNamespacedPath(fileA), 'Conversation A', '');
  add.run(idB, path.toNamespacedPath(fileB), 'Conversation B', '');
  db.close();
  let selected = { id: idA };
  const service = createUsageService({ codexHome, selection: { poll: async () => selected } });
  try {
    assert.equal((await service.getSnapshot()).conversationTitle, 'Conversation A');
    fs.appendFileSync(fileB, '\n');
    assert.equal((await service.getSnapshot()).summary.sessionId, idA);
    selected = { id: idB };
    assert.equal((await service.getSnapshot()).summary.sessionId, idB);
    selected = { id: '01234567-0123-4567-89ab-0123456789ad' };
    const missing = await service.getSnapshot();
    assert.equal(missing.status, 'waiting');
    assert.equal(missing.summary, null);
  } finally { service.close(); }
});
