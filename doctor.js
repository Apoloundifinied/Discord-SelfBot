#!/usr/bin/env node
'use strict';

/**
 * DOCTOR — diagnóstico consolidado do produto.
 *
 * Uso:
 *   npm run doctor                  # relatório humano
 *   npm run doctor -- --json        # saída JSON (para o suporte/automação)
 *
 * Cobre: versão, Node.js, licença, banco de dados (Turso/SQLite local), token
 * do Discord e última coleta. Exit code 0 = tudo em ordem; 1 = algo precisa de
 * atenção. O relatório NUNCA imprime tokens nem chaves de licença.
 */

const { readEnvConfig, runDiagnostics } = require('./shared/doctor');

const ROOT = __dirname;
const JSON_MODE = process.argv.includes('--json');

const useColor = Boolean(process.stdout?.isTTY) && !process.env.NO_COLOR;
const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const paint = (color, text) => (useColor ? `${C[color]}${text}${C.reset}` : text);

function log(msg = '') {
  console.log(`[doctor] ${msg}`);
}

function statusIcon(check) {
  if (check === true) return paint('green', '✓');
  if (check === false) return paint('red', '✗');
  return paint('dim', '—');
}

function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleString('pt-BR');
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function licenseLine(license) {
  if (license.valid) {
    const bound = license.machineBound ? ' · vinculada à máquina' : '';
    return `${statusIcon(true)} Licença ativada · ${license.subject} · expira ${new Date(license.expiresAt).toLocaleString('pt-BR')}${bound}`;
  }
  // Razões específicas primeiro — um pacote sem public.pem NÃO é "não ativada".
  if (license.reason === 'chave-publica-ausente') {
    return `${statusIcon(false)} Licença: chave pública ausente — este build não inclui licenses/public.pem`;
  }
  if (license.reason && license.reason !== 'sem-ativacao') {
    const reasons = {
      'formato-invalido': 'formato inválido',
      'assinatura-invalida': 'assinatura inválida — chave adulterada ou forjada',
      'expirada': 'chave expirada',
      'maquina-diferente': 'chave vinculada a outra máquina',
      'versao-desconhecida': 'versão de chave não suportada',
      'verificacao-falhou': 'falha ao verificar a chave ativada',
    };
    return `${statusIcon(false)} Licença inválida: ${reasons[license.reason] ?? license.reason}`;
  }
  if (license.mode === 'owner' && !license.enforce) {
    return `${statusIcon(true)} Modo dono · cofre presente, bloqueio desligado`;
  }
  return `${statusIcon(license.enforce)} Licença bloqueada — nenhuma chave ativada (cole a chave recebida na tela de desbloqueio)`;
}

function databaseLine(db) {
  if (!db.configured) {
    return `${statusIcon(null)} Banco não configurado — use o assistente de configuração ou a aba "Banco de Dados"`;
  }
  const kind = db.local ? 'SQLite local' : 'Turso';
  if (!db.connected) {
    return `${statusIcon(false)} Banco ${kind} falhou: ${db.error}`;
  }
  const count = db.messageCount === null ? 'mensagens: schema não aplicado' : `${db.messageCount.toLocaleString('pt-BR')} mensagens`;
  return `${statusIcon(true)} Banco ${kind} conectado · ${count} · última coleta ${timeAgo(db.lastCollectedAt)}`;
}

function tokenLine(token) {
  if (!token.present) {
    return `${statusIcon(null)} Nenhum token configurado (scraper/.env ou fleet/accounts.json)`;
  }
  if (!token.formatOk) {
    return `${statusIcon(false)} Token com formato inválido`;
  }
  if (token.valid) {
    const user = token.user ? ` · ${token.user.tag} (${token.user.id})` : '';
    return `${statusIcon(true)} Token válido${user}`;
  }
  return `${statusIcon(false)} Token inválido: ${token.error}`;
}

function fleetLine(fleet, scraperTokenPresent) {
  if (!fleet.configured && !scraperTokenPresent) {
    return `${statusIcon(null)} Nenhuma conta configurada`;
  }
  if (fleet.configured) {
    const flagged = fleet.withToken < fleet.accounts ? paint('yellow', ` · ${fleet.accounts - fleet.withToken} sem token`) : '';
    return `${statusIcon(fleet.withToken > 0)} Fleet: ${fleet.accounts} conta(s), ${fleet.withToken} com token${flagged}`;
  }
  return `${statusIcon(true)} Scraper configurado com token`;
}

function printHuman(result) {
  log('');
  log(paint('bold', `  VOID · diagnóstico · ${result.version ? `v${result.version}` : 'versão desconhecida'}`));
  log(paint('dim', '  ─────────────────────────────────────────────────────'));
  log(` ${nodeOkLine(result)}`);
  log(` ${licenseLine(result.license)}`);
  log(` ${databaseLine(result.database)}`);
  log(` ${tokenLine(result.token)}`);
  log(` ${fleetLine(result.fleet, result.scraperTokenPresent)}`);
  log(paint('dim', '  ─────────────────────────────────────────────────────'));

  if (result.ok) {
    log(paint('green', 'Tudo em ordem. ✓'));
  } else {
    log(paint('yellow', `${result.problems.length} ponto(s) precisam de atenção.`));
    log(paint('dim', 'Rode "npm run doctor -- --json" e envie a saída ao suporte.'));
  }
  log('');
}

function nodeOkLine(result) {
  if (result.nodeOk) {
    return `${statusIcon(true)} Node.js ${result.node} (mínimo 20.18) · ${result.platform}`;
  }
  return `${statusIcon(false)} Node.js ${result.node} — versão mínima 20.18 necessária`;
}

async function main() {
  const config = readEnvConfig(ROOT);
  const result = await runDiagnostics({ config, rootDir: ROOT });

  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  process.exitCode = result.ok ? 0 : 1;
}

main().catch(err => {
  console.error(`[doctor] ERRO fatal: ${err?.message ?? err}`);
  process.exit(1);
});
