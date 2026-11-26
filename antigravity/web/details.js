'use strict';

const conversation = document.getElementById('conversation');
const model = document.getElementById('model');
const status = document.getElementById('status');
const groups = document.getElementById('groups');
let previous = '';
let timer;
let pending = false;

function element(tag, text) {
  const child = document.createElement(tag);
  if (text !== undefined) child.textContent = text;
  return child;
}

function render(snapshot) {
  const signature = JSON.stringify(snapshot);
  if (signature === previous) return;
  previous = signature;
  document.documentElement.lang = snapshot.lang;
  document.body.classList.toggle('dark', snapshot.dark);
  conversation.textContent = snapshot.conversationTitle;
  model.textContent = [snapshot.model, snapshot.effort].filter(Boolean).join(' · ');
  model.hidden = model.textContent.length === 0;
  groups.replaceChildren(...snapshot.groups.map(group => {
    const section = element('section');
    const rows = element('dl');
    for (const [label, value] of group.rows) {
      const row = element('div');
      row.append(element('dt', label), element('dd', value));
      rows.append(row);
    }
    section.append(element('h2', group.title), rows);
    return section;
  }));
}

async function update() {
  clearTimeout(timer);
  if (document.hidden || pending) return;
  pending = true;
  try {
    const api = window.sidecar;
    const id = api?.conversationId || new URLSearchParams(location.search).get('conversationId');
    const url = '/api/snapshot' + (id ? '?conversationId=' + encodeURIComponent(id) : '');
    const response = api?.fetch ? await api.fetch(url) : await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Usage unavailable');
    render(await response.json());
    status.hidden = true;
  } catch {
    status.hidden = false;
    status.textContent = document.documentElement.lang.startsWith('zh') ? '正在连接统计服务…' : 'Connecting to the usage monitor…';
  } finally {
    pending = false;
    if (!document.hidden) timer = setTimeout(update, 1500);
  }
}

document.addEventListener('visibilitychange', update);
update();
