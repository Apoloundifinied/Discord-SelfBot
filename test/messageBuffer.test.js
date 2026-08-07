'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageBuffer } = require('../fleet/messageBuffer');

test('grava em lote ao atingir o limite', async () => {
  const batches = [];
  const buffer = createMessageBuffer({
    batchSize: 2,
    flushMs: 1000,
    write: async rows => batches.push(rows),
  });

  await buffer.push({ message_id: '1' });
  await buffer.push({ message_id: '2' });
  await buffer.flush();

  assert.deepEqual(batches, [[{ message_id: '1' }, { message_id: '2' }]]);
});
