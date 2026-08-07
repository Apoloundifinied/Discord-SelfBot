'use strict';

function createMessageBuffer({ batchSize, flushMs, write }) {
  let rows = [];
  let timer = null;
  let flushing = Promise.resolve();

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!rows.length) return flushing;
    const batch = rows;
    rows = [];
    const current = flushing.catch(() => {}).then(() => write(batch));
    flushing = current.catch(() => {});
    return current;
  }

  function push(row) {
    rows.push(row);
    if (rows.length >= batchSize) return flush();
    if (!timer) timer = setTimeout(() => flush().catch(() => {}), flushMs);
    return Promise.resolve();
  }

  return { push, flush };
}

module.exports = { createMessageBuffer };
