'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const { summarizeGenerations, decodeGeneration } = require('../lib/generation');
const { selectConversation } = require('../lib/window-selection');
const { SessionStore } = require('../lib/session-store');

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

function integer(value) {
  const bytes = [];
  while (value >= 128) {
    bytes.push((value % 128) + 128);
    value = Math.floor(value / 128);
  }
  return Buffer.from([...bytes, value]);
}

function number(tag, value) {
  return Buffer.concat([integer(tag * 8), integer(value)]);
}

function bytes(tag, value) {
  const data = Buffer.from(value);
  return Buffer.concat([integer(tag * 8 + 2), integer(data.length), data]);
}

function message(...parts) {
  return Buffer.concat(parts);
}

function fixture({ idx = 2, id = 'response-one', output = 100, label = 'Test Agent (High)', streaming = 2 } = {}) {
  return message(bytes(1, message(
    bytes(4, message(number(2, 30), number(3, output), number(4, 10), number(5, 60), number(9, 11), bytes(11, id))),
    bytes(11, message(number(1, 1), number(2, 250_000_000))),
    bytes(12, number(1, streaming)), bytes(19, 'test-agent'), bytes(21, label))),
  bytes(2, integer(idx)));
}

test('generation metrics count cache writes once and use streaming time alone', () => {
  const data = decodeGeneration(fixture());
  const sample = summarizeGenerations([data, data], 2);
  assert.equal(sample.model, 'Test Agent');
  assert.equal(sample.effort, 'High');
  assert.equal(sample.promptTokens, 100);
  assert.equal(sample.hitRate, 0.6);
  assert.equal(sample.outputTokens, 100);
  assert.equal(sample.reasoningTokens, 11);
  assert.equal(sample.tokensPerSecond, 50);
  assert.equal(sample.firstTokenSeconds, 1.25);
  assert.equal(sample.turnOutputTokens, 100);
  assert.equal(sample.steps, 1);
});

test('older generations keep the model configuration name and omit missing rates', () => {
  const data = decodeGeneration(fixture({ label: '', streaming: 0, idx: 0 }));
  const sample = summarizeGenerations([data], 1);
  assert.equal(sample.model, 'test-agent');
  assert.equal(sample.tokensPerSecond, null);
  assert.equal(sample.turnOutputTokens, null);
});

test('window selection resolves full and truncated captions and leaves duplicate matches unresolved', () => {
  const title = 'Conversation about a very long plan';
  const rows = [{ id: first, title }, { id: second, title: 'A second chat' }];
  assert.equal(selectConversation(title.slice(0, 25) + '...', rows).id, first);
  assert.equal(selectConversation('A second chat - Workspace', rows).id, second);
  assert.equal(selectConversation('Antigravity', rows), null);
  assert.equal(selectConversation(title, [...rows, { id: second, title }]), null);
  assert.equal(selectConversation('Conversation about a very...', [...rows, { id: second, title: title + ' revised' }]), null);
  const edge = '123456789012345678901234';
  assert.equal(selectConversation((edge + ' - Workspace').slice(0, 25) + '...', [{ id: first, title: edge }]).id, first);
});

test('a WAL update changes only the selected conversation and a switch restores its cached statistics', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-bar-test-'));
  const folder = path.join(root, 'conversations');
  fs.mkdirSync(folder);
  const summary = new DatabaseSync(path.join(root, 'conversation_summaries.db'));
  const writer = new DatabaseSync(path.join(folder, first + '.db'));
  const other = new DatabaseSync(path.join(folder, second + '.db'));
  const store = new SessionStore(root);
  t.after(() => {
    store.close();
    summary.close();
    writer.close();
    other.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  summary.exec("CREATE TABLE conversation_summaries (conversation_id TEXT, title TEXT, not_fully_idle INTEGER, last_user_input_time TEXT)");
  const put = summary.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?, ?)');
  put.run(first, 'Main chat', 0, null);
  put.run(second, 'Other chat', 0, null);
  for (const db of [writer, other]) {
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE steps(idx INTEGER PRIMARY KEY, step_type INTEGER);'
      + ' CREATE TABLE gen_metadata(idx INTEGER PRIMARY KEY, data BLOB); INSERT INTO steps VALUES (1,14),(2,132);');
  }
  writer.prepare('INSERT INTO gen_metadata VALUES (0,?)').run(fixture());
  assert.equal(store.read('Main chat').stats.outputTokens, 100);
  const previous = store.read('Main chat').stats;
  assert.equal(store.read('Main chat').stats, previous);
  other.prepare('INSERT INTO gen_metadata VALUES (0,?)').run(fixture({ label: 'Other Model', output: 400 }));
  assert.equal(store.read('Main chat').stats, previous);
  assert.equal(store.read('Other chat').stats.model, 'Other Model');
  assert.equal(store.readId(second).stats.outputTokens, 400);

  writer.prepare('UPDATE gen_metadata SET data = ? WHERE idx = 0').run(fixture({ output: 120 }));
  assert.equal(store.read('Main chat').stats.outputTokens, 120);
  writer.exec('INSERT INTO steps VALUES (3,14),(4,132)');
  writer.prepare('INSERT INTO gen_metadata VALUES (1,?)').run(fixture({ id: 'response-two', idx: 4 }));
  const updated = store.read('Main chat').stats;
  assert.equal(updated.outputTokens, 220);
  assert.equal(updated.turnOutputTokens, 100);
  assert.equal(updated.turns, 2);
  assert.equal(updated.tools, 2);
  assert.equal(store.read('Antigravity'), null);
  assert.equal(store.read('Other chat').stats.outputTokens, 400);
});
