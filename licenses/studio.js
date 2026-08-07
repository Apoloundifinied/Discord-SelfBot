'use strict';

/**
 * LICENSE STUDIO — ferramenta exclusiva do DONO. Nunca distribua esta pasta
 * inteira para clientes: ela contém a chave PRIVADA (cifrada) e o banco de
 * chaves emitidas.
 *
 * O que viaja com o produto é APENAS licenses/public.pem + a verificação em
 * shared/license.js (que usa só node:crypto). Aqui vive todo o código que
 * precisa de Argon2id (cifrar/decifrar o cofre) e da chave privada.
 *
 * Uso:
 *   npm run license:init                        # gera o cofre + chave pública
 *   node licenses/studio.js create --sub cliente@x --days 30 [--features a,b] [--bind] [--machine <id>]
 *   node licenses/studio.js list
 *   node licenses/studio.js revoke <id>
 *   node licenses/studio.js extend <id> --days 60
 *   node licenses/studio.js verify <KEY>
 *   node licenses/studio.js info
 *
 * Modo admin (JSON puro no stdout — usado pelo painel do dashboard):
 *   node licenses/studio.js admin --action create|list|revoke|extend|status ...
 *
 * A senha-mestra vem de LICENSE_MASTER_PASSPHRASE ou é pedida interativamente.
 * Ela nunca é gravada em disco; só o hash Argon2id (para conferência) e o
 * cofre AES-256-GCM cuja chave é derivada dela.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const {
  generateKeyPair,
  loadPublicKey,
  createLicenseKey,
  parseKey,
  verifyLicenseKey,
  getMachineId,
  keySummary,
} = require('../shared/license');
// Apenas hashRawSync (deriva a chave AES da senha-mestra). A conferência da
// senha é feita pelo próprio AES-GCM: se a senha estiver errada, o tag não
// autentica e a decifragem falha — sem precisar de um hash/verify separado.
const { hashRawSync: argon2HashRawSync, argon2id } = require('@node-rs/argon2');

const LICENSE_DIR = __dirname;
const PRIVATE_ENC = path.join(LICENSE_DIR, 'private.pem.enc');
const PUBLIC_PEM = path.join(LICENSE_DIR, 'public.pem');
const KEYS_ENC = path.join(LICENSE_DIR, 'keys.json.enc');

const ENVELOPE_MAGIC = 'DCXVAULT1'; // 9 bytes
const ARGON2 = { algorithm: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
const FEATURE_RE = /^[a-z0-9_-]{1,32}$/i;

let JSON_MODE = false;

// ---------------------------------------------------------------------------
// Helpers de saída
// ---------------------------------------------------------------------------

function human(msg) {
  if (JSON_MODE) process.stderr.write(`[studio] ${msg}\n`);
  else console.log(msg);
}

// ---------------------------------------------------------------------------
// Cofre (Argon2id + AES-256-GCM)
// ---------------------------------------------------------------------------

function deriveVaultKey(passphrase, salt) {
  return argon2HashRawSync(passphrase, { ...ARGON2, salt, outputLen: 32 });
}

function encryptEnvelope(plain, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveVaultKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(ENVELOPE_MAGIC), salt, iv, tag, enc]);
}

function decryptEnvelope(buf, passphrase) {
  if (buf.length < 53 || buf.subarray(0, 9).toString('utf8') !== ENVELOPE_MAGIC) {
    throw new Error('Arquivo cifrado inválido ou corrompido.');
  }
  const salt = buf.subarray(9, 25);
  const iv = buf.subarray(25, 37);
  const tag = buf.subarray(37, 53);
  const enc = buf.subarray(53);
  const key = deriveVaultKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Armazenamento de chaves emitidas (JSON cifrado)
// ---------------------------------------------------------------------------

function readStore(passphrase) {
  if (!fs.existsSync(KEYS_ENC)) return { keys: [] };
  const json = decryptEnvelope(fs.readFileSync(KEYS_ENC), passphrase).toString('utf8');
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('Banco de chaves corrompido.');
  }
}

function writeStore(passphrase, store) {
  const buf = encryptEnvelope(Buffer.from(JSON.stringify(store, null, 2), 'utf8'), passphrase);
  fs.writeFileSync(KEYS_ENC, buf);
  fs.chmodSync(KEYS_ENC, 0o600);
}

function unlock(passphrase) {
  if (!fs.existsSync(PRIVATE_ENC)) {
    throw new Error('Cofre de chave privada não existe. Rode `npm run license:init` primeiro.');
  }
  let pem;
  try {
    pem = decryptEnvelope(fs.readFileSync(PRIVATE_ENC), passphrase).toString('utf8');
  } catch {
    // AES-GCM não autenticou: senha-mestra errada (ou cofre corrompido).
    throw new Error('Senha-mestra incorreta ou cofre corrompido.');
  }
  if (!pem.includes('PRIVATE KEY')) throw new Error('Cofre corrompido: chave privada ilegível.');
  return pem;
}

// ---------------------------------------------------------------------------
// Prompt de senha (sem eco)
// ---------------------------------------------------------------------------

function promptHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const original = rl._writeToOutput.bind(rl);
    let promptShown = false;
    rl._writeToOutput = str => {
      if (!promptShown) {
        promptShown = true;
        original(str);
      }
      // Nada é ecoado depois do prompt: a senha fica invisível.
    };
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getPassphrase(confirm = false) {
  const fromEnv = (process.env.LICENSE_MASTER_PASSPHRASE || '').trim();
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new Error('LICENSE_MASTER_PASSPHRASE não definida e sem terminal interativo.');

  const first = await promptHidden('Senha-mestra do cofre: ');
  if (!first) throw new Error('Senha vazia não é permitida.');
  if (confirm) {
    const second = await promptHidden('Confirme a senha-mestra: ');
    if (first !== second) throw new Error('As senhas não conferem.');
  }
  return first;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function actInit({ force }) {
  if (fs.existsSync(PRIVATE_ENC) && !force) {
    throw new Error('Cofre já existe. Use --force para regenerar (INVALIDA todas as chaves emitidas).');
  }
  const passphrase = await getPassphrase(true);
  const { publicKeyPem, privateKeyPem } = generateKeyPair();

  fs.writeFileSync(PUBLIC_PEM, publicKeyPem);
  fs.writeFileSync(PRIVATE_ENC, encryptEnvelope(Buffer.from(privateKeyPem, 'utf8'), passphrase));
  writeStore(passphrase, { keys: [] });
  fs.chmodSync(PRIVATE_ENC, 0o600);

  const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
  return {
    ok: true,
    message: 'Cofre criado. A chave privada ficou cifrada neste diretório — ela NUNCA deve ser distribuída.',
    publicKey: PUBLIC_PEM,
    fingerprint,
    machineId: getMachineId(),
  };
}

function createRecord({ subject, days, exp, features, bind, machine }, passphrase) {
  const privateKeyPem = unlock(passphrase);

  const expiresAt = exp ? Number(exp) * 1000 : Date.now() + days * 86400000;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Data de expiração inválida (deve ser no futuro).');
  }

  const featList = Array.isArray(features)
    ? features
    : String(features || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
  for (const f of featList) {
    if (!FEATURE_RE.test(f)) throw new Error(`Feature inválida: "${f}".`);
  }

  // Vínculo de máquina: --machine <id> usa o ID do cliente (venda remota);
  // --bind sozinho usa a máquina em que o studio roda (venda presencial).
  const machineId = machine || (bind ? getMachineId() : null);
  const key = createLicenseKey({ privateKeyPem, subject, expiresAt, features: featList, machineId });
  const parsed = parseKey(key);
  const record = {
    id: parsed.payload.i,
    sub: subject,
    exp: Math.floor(expiresAt / 1000),
    features: featList,
    mid: machineId,
    status: 'active',
    createdAt: Date.now(),
    key,
  };

  const store = readStore(passphrase);
  store.keys.push(record);
  writeStore(passphrase, store);

  return { ok: true, ...keySummary(key, parsed.payload), status: record.status };
}

function listRecords(passphrase) {
  unlock(passphrase);
  const store = readStore(passphrase);
  const keys = store.keys
    .map(r => ({
      id: r.id,
      sub: r.sub,
      status: r.status,
      expiresAt: new Date(r.exp * 1000).toISOString(),
      features: r.features,
      machineBound: Boolean(r.mid),
      createdAt: new Date(r.createdAt).toISOString(),
      key: r.key,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { ok: true, count: keys.length, keys };
}

function revokeRecord(passphrase, id) {
  unlock(passphrase);
  const store = readStore(passphrase);
  const record = store.keys.find(k => k.id === id);
  if (!record) throw new Error(`Chave "${id}" não encontrada.`);
  record.status = 'revoked';
  writeStore(passphrase, store);
  return { ok: true, id, status: record.status, sub: record.sub };
}

function extendRecord(passphrase, id, days) {
  unlock(passphrase);
  const store = readStore(passphrase);
  const record = store.keys.find(k => k.id === id);
  if (!record) throw new Error(`Chave "${id}" não encontrada.`);
  if (record.status === 'revoked') throw new Error('Chave revogada não pode ser estendida.');

  const base = Math.max(Date.now(), record.exp * 1000);
  record.exp = Math.floor((base + days * 86400000) / 1000);
  writeStore(passphrase, store);
  return { ok: true, id, exp: new Date(record.exp * 1000).toISOString(), status: record.status };
}

function verifyRecord(key, machine) {
  if (!key) throw new Error('Chave é obrigatória (argumento posicional).');
  const publicKeyPem = loadPublicKey(PUBLIC_PEM);
  const result = verifyLicenseKey({ publicKeyPem, key });
  if (!result.ok) return { ok: false, reason: result.reason };

  const payload = result.payload;
  if (payload.mid) {
    const local = machine || getMachineId();
    if (payload.mid !== local) {
      return { ok: false, reason: 'maquina-diferente', payload };
    }
  }
  return { ok: true, payload };
}

function infoRecord() {
  const vault = fs.existsSync(PRIVATE_ENC);
  const publicKey = fs.existsSync(PUBLIC_PEM) ? loadPublicKey(PUBLIC_PEM) : null;
  return {
    ok: true,
    vaultPresent: vault,
    publicKeyPresent: Boolean(publicKey),
    fingerprint: publicKey ? crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16) : null,
    machineId: getMachineId(),
  };
}

// ---------------------------------------------------------------------------
// Parsing de argumentos
// ---------------------------------------------------------------------------

// Flags que consomem um valor (aceitam `--flag=valor` e `--flag valor`).
const VALUE_KEYS = new Set(['action', 'sub', 'features', 'days', 'exp', 'id', 'machine']);
// Flags booleanas.
const BOOL_KEYS = new Set(['bind', 'force', 'json']);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = /^--([^=]+)=(.*)$/.exec(arg);
    if (eq) {
      const [, key, value] = eq;
      out[key] = BOOL_KEYS.has(key) ? value === 'true' || value === '1' : value;
      continue;
    }
    const flag = /^--([^=]+)$/.exec(arg);
    if (flag) {
      const key = flag[1];
      if (VALUE_KEYS.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[key] = argv[++i];
      } else {
        out[key] = BOOL_KEYS.has(key);
      }
      continue;
    }
    out._.push(arg);
  }
  // Normaliza `--sub` para a chave usada pelas ações.
  if (out.sub !== undefined && out.subject === undefined) out.subject = out.sub;
  // Converte numéricos para validar com Number.isFinite.
  if (out.days !== undefined) out.days = Number(out.days);
  if (out.exp !== undefined) out.exp = Number(out.exp);
  return out;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

async function runAction(action, args) {
  JSON_MODE = process.argv[2] === 'admin';
  try {
    switch (action) {
      case 'init':
        return await actInit({ force: Boolean(args.force) });
      case 'create': {
        const subject = args.subject || args._[0];
        if (!subject || subject === true) throw new Error('--sub é obrigatório (ex.: cliente@email).');
        const days = Number.isFinite(args.days) ? args.days : 30;
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          throw new Error('--days deve ser um inteiro entre 1 e 3650.');
        }
        // Senha: env (dashboard/admin) ou prompt interativo (CLI).
        const passphrase = await getPassphrase(false);
        return createRecord({ subject, days, exp: args.exp, features: args.features, bind: args.bind, machine: args.machine }, passphrase);
      }
      case 'list': {
        const passphrase = await getPassphrase(false);
        return listRecords(passphrase);
      }
      case 'revoke': {
        const id = args.id || args._[0];
        if (!id) throw new Error('--id é obrigatório.');
        const passphrase = await getPassphrase(false);
        return revokeRecord(passphrase, id);
      }
      case 'extend': {
        const id = args.id || args._[0];
        if (!id) throw new Error('--id é obrigatório.');
        const days = Number.isFinite(args.days) ? args.days : 30;
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          throw new Error('--days deve ser um inteiro entre 1 e 3650.');
        }
        const passphrase = await getPassphrase(false);
        return extendRecord(passphrase, id, days);
      }
      case 'verify':
        return verifyRecord(args._[0], args.machine);
      case 'info':
        return infoRecord();
      default:
        throw new Error(`Ação desconhecida: "${action}".`);
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const isAdmin = argv[0] === 'admin';

  const args = parseArgs(isAdmin ? argv.slice(1) : argv);
  const action = isAdmin ? args.action : args._.shift() || String(args.action || '');
  const result = await runAction(action, args);

  if (isAdmin) {
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  // Erro fatal (com .error). Falhas de VERIFICAÇÃO (verify) não têm .error:
  // o próprio switch abaixo imprime o motivo e seta o exit code.
  if (!result.ok && result.error) {
    console.error(`[studio] ERRO: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  switch (action) {
    case 'init':
      human('Cofre criado com sucesso.');
      human(`  chave pública  : ${result.publicKey}`);
      human(`  fingerprint    : ${result.fingerprint}`);
      human(`  máquina atual  : ${result.machineId}`);
      human('  AVISO: private.pem.enc / keys.json.enc NÃO podem ser distribuídos.');
      break;
    case 'create':
      human('Chave emitida:');
      human(`  id        : ${result.id}`);
      human(`  cliente   : ${result.subject}`);
      human(`  expira em : ${result.expiresAt}`);
      human(`  features  : ${result.features.join(', ') || '—'}`);
      human(`  máquina   : ${result.machineId || 'livre (qualquer máquina)'}`);
      human('');
      human('╔═ CHAVE (mostrada uma única vez — copie agora) ═╗');
      human(result.key);
      human('╚════════════════════════════════════════════════╝');
      break;
    case 'list':
      if (result.keys.length === 0) {
        human('Nenhuma chave emitida ainda.');
      } else {
        for (const k of result.keys) {
          human(
            `${k.id.padEnd(18)} ${k.status.padEnd(8)} ${(k.sub || '').padEnd(24)} exp ${k.expiresAt} ` +
              `fe[${k.features.join(',') || '—'}]${k.machineBound ? ' 🔒máquina' : ' livre'}`,
          );
        }
        human(`Total: ${result.count}`);
      }
      break;
    case 'revoke':
      human(`Chave ${result.id} → ${result.status}.`);
      break;
    case 'extend':
      human(`Chave ${result.id} → expira em ${result.exp}.`);
      break;
    case 'verify':
      if (result.ok) {
        human(`Chave VÁLIDA. Cliente: ${result.payload.sub} · expira ${new Date(result.payload.exp * 1000).toISOString()}.`);
      } else {
        human(`Chave INVÁLIDA: ${result.reason}`);
        process.exitCode = 1;
      }
      break;
    case 'info':
      human(`cofre presente : ${result.vaultPresent}`);
      human(`chave pública   : ${result.publicKeyPresent}`);
      human(`fingerprint     : ${result.fingerprint}`);
      human(`máquina atual   : ${result.machineId}`);
      break;
    default:
      console.error('[studio] Uso: init | create | list | revoke | extend | verify | info | admin --action <acao>');
      process.exitCode = 1;
  }
}

main();
