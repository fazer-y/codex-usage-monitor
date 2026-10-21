'use strict';

function createDetailAutoCollapse(onCollapse, delayMs = 3000) {
  let expanded = false;
  let focused = true;
  let timer = null;

  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    cancel();
    if (!expanded || focused) return;
    timer = setTimeout(() => { timer = null; onCollapse(); }, delayMs);
    timer.unref?.();
  }

  return {
    setExpanded(value) { expanded = value; schedule(); },
    setFocused(value) { focused = value; schedule(); },
    close: cancel,
  };
}

module.exports = { createDetailAutoCollapse };
