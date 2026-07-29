'use strict';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Espera um tempo aleatório entre min e max ms (ajuda a evitar padrões de robô). */
function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(ms);
}

/**
 * Detecta se um erro veio de rate limit (HTTP 429) da API do Discord.
 */
function isRateLimitError(err) {
  return err?.httpStatus === 429 || err?.code === 429 || /rate ?limit/i.test(err?.message ?? '');
}

module.exports = { sleep, randomDelay, isRateLimitError };
