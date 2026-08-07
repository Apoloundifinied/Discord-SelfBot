'use strict';

/**
 * TEST:CLIENT — simula a experiência do cliente localmente.
 *
 * Extrai o ZIP portátil (dist/void-client-vX-win-x64.zip) numa pasta limpa
 * (dist/void-client-test/) e sobe o painel com o node EMBARCADO do pacote —
 * exatamente como o VOID.bat faria, mas sem depender do Explorer nem do
 * duplo clique (que pode rodar o bat de dentro do zip e falhar).
 *
 * Uso:
 *   npm run test:client            # extrai e sobe o painel (nao abre navegador)
 *   npm run test:client -- --open  # abre o navegador com as credenciais
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname.replace(/\\/g, '/').replace(/\/scripts$/, '');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const ZIP = path.join(ROOT, 'dist', `void-client-v${VERSION}-win-x64.zip`);
const TEST_DIR = path.join(ROOT, 'dist', 'void-client-test');
const BS_TAR = 'C:\\Windows\\System32\\tar.exe';

function log(msg = '') {
  console.log(`[test:client] ${msg}`);
}

function main() {
  if (!fs.existsSync(ZIP)) {
    console.error(`[test:client] ERRO: ZIP não encontrado. Rode \`npm run package:portable\` primeiro. (${ZIP})`);
    process.exit(1);
  }

  log(`Extraindo ${path.relative(ROOT, ZIP)} para ${path.relative(ROOT, TEST_DIR)}…`);
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const tar = fs.existsSync(BS_TAR) ? BS_TAR : 'tar';
  const { spawnSync } = require('node:child_process');
  const res = spawnSync(tar, ['-xf', ZIP, '-C', TEST_DIR], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('[test:client] ERRO: falha ao extrair o ZIP.');
    process.exit(1);
  }

  // O zip contém uma subpasta void-client/.
  const clientRoot = fs
    .readdirSync(TEST_DIR)
    .filter(e => fs.statSync(path.join(TEST_DIR, e)).isDirectory())
    .map(e => path.join(TEST_DIR, e))
    .find(dir => fs.existsSync(path.join(dir, 'void.js')));

  if (!clientRoot) {
    console.error('[test:client] ERRO: void.js não encontrado dentro do ZIP extraído.');
    process.exit(1);
  }

  const nodeExe = path.join(clientRoot, 'node', 'node.exe');
  if (!fs.existsSync(nodeExe)) {
    console.error(`[test:client] ERRO: ${path.join('node', 'node.exe')} não existe no pacote.`);
    process.exit(1);
  }

  const open = process.argv.includes('--open');
  log(`Painel em: ${clientRoot}`);
  log(`Rodando node embarcado: node/node.exe void.js${open ? '' : ' --no-open'}…`);
  log('');
  log('  Simulação de cliente: a lock screen de licença vai aparecer.');
  log('  O Machine ID exibido lá é o que o cliente envia ao fornecedor.');
  log('  Pressione Ctrl+C para encerrar.');
  log('');

  const args = ['void.js', '--no-fleet'];
  if (!open) args.push('--no-open');
  const child = spawn(nodeExe, args, { cwd: clientRoot, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
  process.on('SIGINT', () => child.kill('SIGTERM'));
}

main();
