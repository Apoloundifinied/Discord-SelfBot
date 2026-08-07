'use strict';

const { createClient } = require('@libsql/client');

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Fábrica única de client Turso (libsql) para os processos Node (fleet/scraper).
 * Centraliza validação de configuração e criação do client — a camada de dados
 * nunca precisa saber como o client é montado.
 */
function createTursoClient({ url, authToken }) {
  if (!url) {
    throw new Error('TURSO_DATABASE_URL deve estar configurada.');
  }
  // SQLite local (file:) não exige token — modo zero-config para o cliente.
  const isLocal = url.startsWith('file:');
  if (!isLocal && !authToken) {
    throw new Error('TURSO_AUTH_TOKEN é obrigatória para bancos remotos (libsql:// ou https://).');
  }
  return createClient({ url, authToken });
}

/** Valida um nome de tabela antes de interpolar em SQL (evita injeção). */
function assertValidTableName(table) {
  if (!TABLE_NAME_RE.test(table)) throw new Error(`Nome de tabela inválido: ${table}`);
  return table;
}

/**
 * Diz se o banco está de fato configurado: URL presente E (modo local OU token
 * presente). SQLite local (file:) não exige token; remoto exige. Usada pelos
 * launcher, fleet e scraper para decidir se podem subir sem quebrar no client.
 * Aceita tanto { tursoUrl, tursoAuthToken } (objeto config de fleet/scraper)
 * quanto { url, authToken } (formato do createTursoClient).
 */
function isTursoConfigured(cfg) {
  const url = cfg?.tursoUrl ?? cfg?.url;
  const authToken = cfg?.tursoAuthToken ?? cfg?.authToken;
  if (!url) return false;
  return url.startsWith('file:') || Boolean(authToken);
}

module.exports = { createTursoClient, assertValidTableName, isTursoConfigured };
