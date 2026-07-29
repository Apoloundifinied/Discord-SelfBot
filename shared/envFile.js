'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Lê um arquivo .env simples (KEY=VALUE por linha) para um objeto.
 * Ignora comentários (#) e linhas vazias. Retorna {} se o arquivo não existir.
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const result = {};
  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  return result;
}

/**
 * Atualiza um arquivo .env in-place: substitui o valor de chaves já existentes
 * (preservando comentários e ordem das outras linhas) e acrescenta no final
 * as chaves que ainda não existiam. Cria o arquivo se ele não existir.
 * @param {string} filePath Caminho do arquivo .env
 * @param {Object<string, string>} updates Pares chave/valor a gravar
 */
function updateEnvFile(filePath, updates) {
  const remaining = { ...updates };
  let lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split('\n') : [];

  lines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const eq = trimmed.indexOf('=');
    if (eq === -1) return line;

    const key = trimmed.slice(0, eq).trim();
    if (!Object.prototype.hasOwnProperty.call(remaining, key)) return line;

    const value = remaining[key];
    delete remaining[key];
    return `${key}=${value}`;
  });

  const appended = Object.entries(remaining).map(([key, value]) => `${key}=${value}`);
  if (appended.length) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(...appended);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`, 'utf8');
}

module.exports = { parseEnvFile, updateEnvFile };
