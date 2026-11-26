'use strict';

const SESSION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TITLE_LIMIT = 25;

function selectConversation(windowTitle, conversations) {
  const caption = windowTitle?.trim();
  if (!caption) return null;
  const truncated = caption.length === TITLE_LIMIT + 3 && caption.endsWith('...');
  const prefix = truncated ? caption.slice(0, TITLE_LIMIT) : caption;
  let best = null;
  let bestScore = 0;
  let ambiguous = false;

  for (const conversation of conversations) {
    if (!SESSION_ID.test(conversation.id) || !conversation.title) continue;
    const title = conversation.title.trim();
    let score = 0;
    if (caption === title) score = TITLE_LIMIT * 10 + title.length;
    else if (prefix.startsWith(title + ' - ')) score = TITLE_LIMIT * 2 + title.length;
    else if (truncated && title.startsWith(prefix)) score = prefix.length * 2 - 1;
    else if (truncated && prefix.startsWith(title) && ' - '.startsWith(prefix.slice(title.length))) score = prefix.length * 2 - 1;
    else if (!truncated && caption.startsWith(title + ' — ')) score = TITLE_LIMIT * 2 + title.length;
    if (score > bestScore) {
      best = conversation;
      bestScore = score;
      ambiguous = false;
    } else if (score && score === bestScore && best?.id !== conversation.id) {
      ambiguous = true;
    }
  }
  return ambiguous ? null : best;
}

module.exports = { selectConversation, SESSION_ID };
