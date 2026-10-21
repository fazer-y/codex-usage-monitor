'use strict';

function createManagedLifecycle(onExit, { managed = false, delayMs = 2000, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let hostPresent = null;
  let connected = false;
  let hasConnected = false;
  let timer = null;
  let closed = false;
  function update() {
    const shouldExit = managed && (hostPresent === false || (hostPresent === null && hasConnected && !connected));
    if ((!shouldExit || closed) && timer !== null) { cancel(timer); timer = null; }
    if (shouldExit && !closed && timer === null) timer = schedule(() => { timer = null; onExit(); }, delayMs);
  }
  return {
    setManaged() { managed = true; update(); },
    setHostPresent(value) { hostPresent = value; update(); },
    setConnections(count) { connected = count > 0; hasConnected ||= connected; if (connected) managed = true; update(); },
    close() { closed = true; update(); },
  };
}

module.exports = { createManagedLifecycle };
