'use strict';

const path = require('path');
const dotenv = require('dotenv');

function loadEnv(directory) {
  // override: true é ESSENCIAL. O dashboard inicia estes processos via fork()
  // e o Next.js carrega .env.local no boot — se o banco for configurado
  // depois (pelo painel), o process.env herdado fica com TURSO_DATABASE_URL
  // vazia. O dotenv por padrão NÃO sobrescreve variável já existente, então
  // o valor do arquivo .env nunca seria aplicado e o processo crasharia no
  // require do tursoClient. O arquivo .env de cada processo é a fonte da
  // verdade — deve SEMPRE vencer sobre o env herdado.
  dotenv.config({ path: path.join(directory, '.env'), override: true });
}

function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function list(name) {
  return (process.env[name] ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} deve ser true, false, 1 ou 0.`);
}

module.exports = { loadEnv, integer, list, boolean };
