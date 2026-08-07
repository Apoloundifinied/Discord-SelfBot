'use strict';

/**
 * Núcleo de licenciamento por chaves assinadas (Ed25519).
 *
 * Modelo de confiança:
 *   - O DONO gera um par de chaves com `license/studio.js init` na própria
 *     máquina. A chave PRIVADA nunca sai dela (fica cifrada em
 *     license/private.pem.enc — AES-256-GCM com senha-mestra derivada por
 *     Argon2id). A chave PÚBLICA (license/public.pem) é a única coisa
 *     embarcada no produto distribuído.
 *   - Uma chave de licença é um token autocontido e assinado:
 *         DCX1.<payload base64url>.<assinatura base64url>
 *     O payload carrega { v, i (id), sub (cliente), exp (epoch s), fe (features),
 *     mid (máquina, opcional), c (criada em) }.
 *   - Verificação local: assinatura contra a chave pública + validade temporal
 *     + (opcional) vínculo de máquina. Sem a chave privada é impossível forjar
 *     uma chave válida.
 *
 * Este módulo usa APENAS node:crypto de propósito: a verificação roda no
 * produto distribuído (dashboard), que não deve carregar dependências do lado
 * do dono (argon2). Tudo que precisa de Argon2id vive em license/studio.js.
 */

const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');

const KEY_PREFIX = 'DCX1.';

// ---------------------------------------------------------------------------
// Codificação base64url
// ---------------------------------------------------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function unb64url(str) {
  return Buffer.from(str, 'base64url');
}

// ---------------------------------------------------------------------------
// Identificação de máquina (vínculo opcional de chave)
// ---------------------------------------------------------------------------

/**
 * ID estável e aproximado da máquina: hash de sinais do SO/hardware.
 * Não é um "hardware ID" criptográfico (isso não existe em JS puro), mas é o
 * suficiente para impedir que uma chave vinculada rode numa máquina diferente.
 */
function getMachineId() {
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model ?? 'unknown-cpu',
    String(os.totalmem()),
  ].join('|');
  return crypto.createHash('sha256').update(parts).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Par de chaves Ed25519
// ---------------------------------------------------------------------------

/** Gera um par de chaves Ed25519 e devolve em PEM (SPKI / PKCS8). */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

/** Lê a chave pública PEM do disco (a única coisa que viaja com o produto). */
function loadPublicKey(pemPath) {
  return fs.readFileSync(pemPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Emissão e verificação de chaves de licença
// ---------------------------------------------------------------------------

/**
 * Cria uma chave de licença assinada.
 * @param {object} opts
 * @param {string} opts.privateKeyPem  chave privada Ed25519 (PEM PKCS8)
 * @param {string} opts.subject        identificação do cliente (email/nome/ID)
 * @param {number} opts.expiresAt      timestamp em ms
 * @param {string[]} [opts.features]   flags de recursos liberados
 * @param {string|null} [opts.machineId] vínculo de máquina (null = livre)
 * @param {string|null} [opts.jti]     id explícito (gerado se ausente)
 */
function createLicenseKey({ privateKeyPem, subject, expiresAt, features = [], machineId = null, jti = null }) {
  if (!privateKeyPem) throw new Error('Chave privada ausente.');
  if (!subject || typeof subject !== 'string') throw new Error('Assinante (subject) é obrigatório.');
  if (!Number.isFinite(expiresAt)) throw new Error('Data de expiração inválida.');

  const payload = {
    v: 1,
    i: jti || crypto.randomBytes(8).toString('hex'),
    sub: subject,
    exp: Math.floor(expiresAt / 1000),
    fe: Array.isArray(features) ? features : [],
    mid: machineId || null,
    c: Math.floor(Date.now() / 1000),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(payloadB64, 'utf8'), privateKeyPem);
  return `${KEY_PREFIX}${payloadB64}.${b64url(sig)}`;
}

/** Faz o parse de uma chave sem validar. Retorna null se o formato for inválido. */
function parseKey(key) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return null;
  const body = key.slice(KEY_PREFIX.length);
  const dot = body.lastIndexOf('.');
  if (dot <= 0 || dot === body.length - 1) return null;
  const payloadB64 = body.slice(0, dot);
  const sigB64 = body.slice(dot + 1);
  if (!payloadB64 || !sigB64) return null;

  let payload;
  try {
    payload = JSON.parse(unb64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;

  return { payload, payloadB64, sig: unb64url(sigB64) };
}

/**
 * Verifica uma chave de licença.
 * @returns {{ ok: boolean, reason?: string, payload?: object }}
 *   reason: 'formato-invalido' | 'versao-desconhecida' | 'assinatura-invalida' | 'expirada'
 */
function verifyLicenseKey({ publicKeyPem, key, now = Date.now() }) {
  if (!publicKeyPem) return { ok: false, reason: 'chave-publica-ausente' };

  const parsed = parseKey(key);
  if (!parsed) return { ok: false, reason: 'formato-invalido' };
  const { payload, payloadB64, sig } = parsed;

  if (payload.v !== 1) return { ok: false, reason: 'versao-desconhecida', payload };

  let valid;
  try {
    valid = crypto.verify(null, Buffer.from(payloadB64, 'utf8'), publicKeyPem, sig);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'assinatura-invalida', payload };

  if (typeof payload.exp === 'number' && payload.exp * 1000 < now) {
    return { ok: false, reason: 'expirada', payload };
  }

  return { ok: true, payload };
}

/** Estado de uma chave emitida (normalizado para exibição/API). */
function keySummary(key, payload) {
  return {
    id: payload.i,
    subject: payload.sub,
    features: Array.isArray(payload.fe) ? payload.fe : [],
    machineBound: Boolean(payload.mid),
    machineId: payload.mid || null,
    createdAt: payload.c ? new Date(payload.c * 1000).toISOString() : null,
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    key,
  };
}

module.exports = {
  KEY_PREFIX,
  getMachineId,
  generateKeyPair,
  loadPublicKey,
  createLicenseKey,
  parseKey,
  verifyLicenseKey,
  keySummary,
  b64url,
  unb64url,
};
