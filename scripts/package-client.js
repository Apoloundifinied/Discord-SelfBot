'use strict';

/**
 * EMPACOTADOR DO CLIENTE — monta a distribuição que vai para o comprador.
 *
 * Garantias desta etapa (a parte "o cliente nunca vê o painel de senhas"):
 *   - O cofre da chave privada (private.pem.enc), o banco de chaves
 *     (keys.json.enc), a ativação (activation.json) e o studio.js são
 *     REMOVIDOS — sem eles é impossível emitir chaves ou abrir a
 *     administração, mesmo que o cliente revire o pacote.
 *   - .env / .env.local / accounts.json são substituídos pelos exemplos.
 *   - Só licenses/public.pem viaja (é o que o app usa para validar a chave
 *     que VOCÊ gerou externamente com a sua privada).
 *   - O dashboard vem com o build de produção (.next) pronto, então o cliente
 *     não precisa compilar: `npm install && node void.js`.
 *   - Ao final, uma varredura confirma que nenhum segredo está no pacote.
 *
 * MODOS:
 *   npm run package:client                  # pacote para cliente com Node instalado
 *   npm run package:client -- --portable    # ZIP portátil: Node embarcado + node_modules
 *                                           # pré-instalados + VOID.bat. O cliente só
 *                                           # descompacta e dá dois cliques — sem instalar
 *                                           # Node, sem npm, sem terminal.
 *
 * Uso:
 *   npm run package:client                                  # gera dist/void-client/
 *   npm run package:client -- --out dist/void-v1.2          # pasta custom
 *   npm run package:client -- --portable                    # gera dist/void-client-vX-win-x64.zip
 *   npm run package:client -- --portable --node-version=v24.18.1   # versão do Node embarcado
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname.replace(/\\/g, '/').replace(/\/scripts$/, '');
const DASH = path.join(ROOT, 'dashboard');
const VENDOR = path.join(ROOT, 'scripts', 'vendor');
const BS_TAR = 'C:\\Windows\\System32\\tar.exe';

const SECRET_NAMES = new Set([
  'private.pem.enc',
  'keys.json.enc',
  'activation.json',
  'studio.js',
  '.env',
  '.env.local',
  'accounts.json',
  'state.json',
]);

const COPY_ROOTS = ['shared', 'fleet', 'scraper', 'licenses', 'database'];

/** Lê flags da CLI: --portable, --out=x, --node-version=vX (com ou sem =). */
function flags() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    let val;
    if (eq !== -1) val = a.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) val = argv[++i];
    else val = true;
    out[key] = val;
  }
  return out;
}

function outDir(f) {
  if (typeof f.out === 'string') return path.resolve(f.out);
  return path.join(ROOT, 'dist', 'void-client');
}

function filterCopy(src) {
  const rel = path.relative(ROOT, src).split(path.sep);
  const base = path.basename(src);

  if (rel[0] === '.git') return false;
  // node_modules em qualquer nível (inclui .next/node_modules, que são
  // symlinks do Turbopack e não copiam no Windows).
  if (rel.includes('node_modules')) return false;
  if (rel[0] === 'scripts' || rel[0] === 'test') return false;
  if (rel[0] === 'dashboard' && rel.includes('.next')) {
    // Só o build de produção. .next/dev e .next/cache são artefatos de dev.
    if (rel.includes('dev') || rel.includes('cache')) return false;
    return true;
  }
  if (base === 'activation.json') return false;
  if (SECRET_NAMES.has(base)) return false;
  return true;
}

function writeClientPackageJson(dest, opts = {}) {
  const pkg = require(path.join(ROOT, 'package.json'));
  const portable = !!opts.portable;
  const cleaned = {
    name: 'void-client',
    version: pkg.version,
    private: true,
    description: 'VOID — console de inteligência Discord (instalação do cliente).',
    engines: pkg.engines,
    scripts: {
      start: 'node void.js',
      void: 'node void.js',
      doctor: 'node doctor.js',
      // No modo portátil o cliente NUNCA roda npm — node_modules já vem
      // pré-instalado; o postinstall só existe no modo "instale você mesmo".
      ...(portable ? {} : { postinstall: 'npm --prefix dashboard install --no-audit --no-fund' }),
    },
    bin: { void: 'void.js' },
    dependencies: {
      '@libsql/client': pkg.dependencies['@libsql/client'],
      // Dep explícita de PRODUÇÃO: o discord.js-selfbot-v13 (via werift-rtp)
      // require('debug') sem declará-la — no lock do root ela ficava marcada
      // como dev (via eslint) e o --omit=dev a omitia, quebrando o QR e o
      // teste de token no pacote do cliente ("Cannot find module 'debug'").
      // Fallback literal: se o root remover a dep, o cliente não fica sem ela.
      debug: pkg.dependencies.debug || '^4.4.0',
      'discord.js-selfbot-v13': pkg.dependencies['discord.js-selfbot-v13'],
      dotenv: pkg.dependencies.dotenv,
      'tree-kill': pkg.dependencies['tree-kill'],
    },
  };
  fs.writeFileSync(dest, JSON.stringify(cleaned, null, 2) + '\n');
}

function writeClientReadme(dest, version, opts = {}) {
  const portable = !!opts.portable;
  const body = portable
    ? [
        `# VOID — instalação portátil (v${version})`,
        '',
        '## Instalar (uma vez)',
        '',
        '1. Descompacte a pasta VOID em qualquer lugar (ex.: `C:\\VOID`).',
        '2. Dê **dois cliques em VOID.bat**.',
        '',
        'O painel abre no navegador. Se aparecer a tela de desbloqueio, cole a chave de',
        'licença que você recebeu. Depois, o assistente guia banco de dados e token.',
        '',
        '## Rodar de novo',
        '',
        'Dois cliques em **VOID.bat** (ou **VOID-Silent.vbs** para rodar sem a janela do',
        'console).',
        '',
        '## Diagnóstico (suporte)',
        '',
        'Se algo não funcionar, rode e envie a saída ao suporte:',
        '',
        '```',
        'node\\node.exe doctor.js --json',
        '```',
        '',
        'Verifica versão, Node.js, banco de dados, licença, token e última coleta — sem',
        'nunca imprimir tokens ou chaves.',
        '',
        '> Este pacote contém apenas a chave pública de licença — não é possível emitir',
        '> ou visualizar chaves aqui. Para emitir chaves, o fornecedor usa a ferramenta',
        '> de administração dele.',
      ].join('\n')
    : [
        `# VOID — instalação do cliente (v${version})`,
        '',
        '## Instalar (uma vez)',
        '',
        '1. Instale o Node.js 20.18+ (https://nodejs.org).',
        '2. Abra o terminal na pasta e rode:',
        '   ```',
        '   npm install',
        '   ```',
        '3. Copie `dashboard/.env.local.example` para `dashboard/.env.local` e preencha',
        '   `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` com as credenciais que você recebeu.',
        '',
        '## Rodar',
        '',
        '```',
        'node void.js',
        '```',
        '',
        'O painel abre no navegador. Se aparecer a tela de desbloqueio, cole a chave de',
        'licença que você recebeu. A chave é verificada localmente; nada é enviado para',
        'fora da sua máquina.',
        '',
        '## Diagnóstico',
        '',
        'Se algo não funcionar, rode e envie a saída ao suporte:',
        '',
        '```',
        'npm run doctor -- --json',
        '```',
        '',
        'Verifica versão, Node.js, banco de dados, licença, token e última coleta — sem',
        'nunca imprimir tokens ou chaves.',
        '',
        '> Este pacote contém apenas a chave pública de licença — não é possível emitir',
        '> ou visualizar chaves aqui. Para emitir chaves, o fornecedor usa a ferramenta',
        '> de administração dele.',
      ].join('\n');
  fs.writeFileSync(dest, body + '\n');
}

function runNpm(cwd, args) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  console.log(`[package] npm ${args.join(' ')} (${path.relative(ROOT, cwd)})…`);
  // No Windows, .cmd só é executável via shell; os args são tokens estáticos
  // (sem caminhos com espaço), então concatenar e usar shell é seguro e evita
  // EINVAL ao spawnar .cmd (e o DEP0190 de passar array com shell:true).
  const command = process.platform === 'win32' ? `${cmd} ${args.join(' ')}` : cmd;
  const res = spawnSync(command, process.platform === 'win32' ? [] : args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    console.error(`[package] ERRO: npm ${args.join(' ')} falhou (código ${res.status}${res.error ? ' — ' + res.error.message : ''}).`);
    process.exit(1);
  }
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`[package] Baixado ${path.relative(ROOT, dest)} (${(buf.length / 1024 / 1024).toFixed(1)} MB).`);
}

/** Baixa e valida o SHASUMS256.txt oficial — o node.exe vai embarcado pro cliente. */
async function fetchNodeSha256(ver) {
  const res = await fetch(`https://nodejs.org/dist/${ver}/SHASUMS256.txt`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar SHASUMS256.txt`);
  return await res.text();
}

function verifyNodeZip(zipPath, ver) {
  const zipName = path.basename(zipPath);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  const sums = fs.readFileSync(path.join(VENDOR, `SHASUMS256-${ver}.txt`), 'utf8');
  const line = sums.split(/\r?\n/).find(l => l.trim().endsWith(zipName));
  const expected = line ? line.split(/\s+/)[0].toLowerCase() : null;
  if (!expected) throw new Error(`SHA256 de ${zipName} não encontrado no SHASUMS256.txt.`);
  if (actual !== expected) throw new Error(`Checksum inválido para ${zipName}. Cache corrompido — remova ${VENDOR} e rode de novo.`);
  console.log(`[package] SHA256 de ${zipName} verificado ✓`);
}

function extractZip(zipPath, toDir) {
  const tar = fs.existsSync(BS_TAR) ? BS_TAR : 'tar';
  fs.mkdirSync(toDir, { recursive: true });
  const res = spawnSync(tar, ['-xf', zipPath, '-C', toDir], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`Falha ao extrair ${zipPath}.`);
}

/** Embarca o node.exe portátil oficial (zip assinado pela OpenJS Foundation). */
async function embedNode(dest, versionOverride) {
  // Guard: flag --node-version sem valor vira true — trata como ausente.
  const version = typeof versionOverride === 'string' && versionOverride ? versionOverride : process.versions.node; // ex.: 24.18.1
  const ver = version.startsWith('v') ? version : `v${version}`;
  const zipName = `node-${ver}-win-x64.zip`;
  const zipPath = path.join(VENDOR, zipName);
  const extractDir = path.join(VENDOR, `node-${ver}-win-x64`);
  const srcExe = path.join(extractDir, 'node.exe');

  if (!fs.existsSync(srcExe)) {
    if (!fs.existsSync(zipPath)) {
      const url = `https://nodejs.org/dist/${ver}/${zipName}`;
      console.log(`[package] Baixando Node ${ver} (${url})…`);
      await download(url, zipPath);
    }
    // Checa o SHA256 do zip (baixa o SHASUMS uma vez por versão, cacheado).
    const sumsPath = path.join(VENDOR, `SHASUMS256-${ver}.txt`);
    if (!fs.existsSync(sumsPath)) {
      const sums = await fetchNodeSha256(ver);
      fs.mkdirSync(VENDOR, { recursive: true });
      fs.writeFileSync(sumsPath, sums);
    }
    try {
      verifyNodeZip(zipPath, ver);
      console.log('[package] Extraindo node.exe…');
      extractZip(zipPath, VENDOR);
    } catch (err) {
      // Zip corrompido (download interrompido numa rodada anterior): purge e
      // re-baixa uma vez, em vez de reusar o cache ruim para sempre.
      console.error(`[package] ${err.message}`);
      console.error('[package] Cache do Node corrompido — removendo e baixando de novo…');
      fs.rmSync(zipPath, { force: true });
      fs.rmSync(extractDir, { recursive: true, force: true });
      await download(`https://nodejs.org/dist/${ver}/${zipName}`, zipPath);
      verifyNodeZip(zipPath, ver);
      extractZip(zipPath, VENDOR);
    }
  }

  if (!fs.existsSync(srcExe)) throw new Error(`node.exe não encontrado em ${extractDir} após extração.`);
  const target = path.join(dest, 'node');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(srcExe, path.join(target, 'node.exe'));
  const mb = (fs.statSync(path.join(target, 'node.exe')).size / 1024 / 1024).toFixed(0);
  console.log(`[package] Node ${ver} embarcado (node/node.exe, ${mb} MB).`);
}

function writePortableLaunchers(dest) {
  // ATENCAO cmd.exe: parenteses ( ) dentro de um bloco if (... ) quebram o
  // parsing — "nao rode (de dentro do Explorer)" virava ". was unexpected
  // at this time". Nenhum parentese em texto dentro dos blocos if.
  const bat = [
    '@echo off',
    'rem VOID - launcher portatil de dois cliques.',
    'cd /d "%~dp0"',
    'if not exist "%~dp0node\\node.exe" (',
    '  echo [VOID] ERRO: node\\node.exe nao encontrado ao lado deste arquivo.',
    '  echo        Descompacte o ZIP antes de usar - nao rode de dentro do Explorer.',
    '  pause',
    '  exit /b 1',
    ')',
    'if not exist "%~dp0void.js" (',
    '  echo [VOID] ERRO: void.js nao encontrado ao lado deste arquivo.',
    '  pause',
    '  exit /b 1',
    ')',
    '"%~dp0node\\node.exe" "%~dp0void.js" %*',
    'echo.',
    'echo VOID encerrou. Pressione qualquer tecla para fechar.',
    'pause >nul',
  ].join('\r\n');
  fs.writeFileSync(path.join(dest, 'VOID.bat'), bat + '\r\n');

  const vbs = [
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh = CreateObject("WScript.Shell")',
    'folder = fso.GetParentFolderName(WScript.ScriptFullName)',
    'sh.CurrentDirectory = folder',
    'cmd = """" & folder & "\\node\\node.exe"" """ & folder & "\\void.js"""',
    'sh.Run cmd, 0, False',
  ].join('\r\n');
  fs.writeFileSync(path.join(dest, 'VOID-Silent.vbs'), vbs + '\r\n');

  const note = [
    'COMO INICIAR O VOID',
    '===================',
    '',
    '1. Dê DOIS cliques no arquivo  VOID.bat',
    '2. O painel abre no navegador sozinho',
    '3. Cole a chave de licença na tela de desbloqueio',
    '4. Siga o assistente (banco de dados e token)',
    '',
    'Para rodar sem janela preta: use VOID-Silent.vbs',
    '',
    'Problemas? Rode  node\\node.exe doctor.js --json  e envie a saída ao suporte.',
  ].join('\r\n');
  fs.writeFileSync(path.join(dest, 'INICIAR AQUI.txt'), note + '\r\n');
}

function zipPortable(dest) {
  const version = require(path.join(ROOT, 'package.json')).version;
  const parent = path.dirname(dest);
  const base = path.basename(dest);
  const zipPath = path.join(parent, `void-client-v${version}-win-x64.zip`);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

  const tar = fs.existsSync(BS_TAR) ? BS_TAR : 'tar';
  console.log(`[package] Comprimindo ${path.relative(ROOT, zipPath)} (pode levar alguns minutos)…`);
  const res = spawnSync(tar, ['-a', '-cf', zipPath, '-C', parent, base], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('[package] ERRO: falha ao gerar o ZIP.');
    process.exit(1);
  }
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`[package] OK — ${path.relative(ROOT, zipPath)} (${mb} MB).`);
}

/**
 * O Turbopack externaliza módulos nativos (ex.: @libsql/client) criando, DENTRO
 * de .next/node_modules, links com nome com hash (client-<hash>) apontando pro
 * node_modules real — e o chunk buildado faz require("@libsql/client-<hash>").
 * O filterCopy exclui .next/node_modules, então sem esta etapa o pacote sobe
 * com `Cannot find module @libsql/client-<hash>` (bug afeta ambos os modos).
 * Copia o diretório REAL (dereference) para o destino — sem symlink, funciona
 * sem privilégios de admin no Windows.
 */
function replicateNextExternalModules(dest) {
  const srcRoot = path.join(DASH, '.next', 'node_modules');
  const dstRoot = path.join(dest, 'dashboard', '.next', 'node_modules');
  if (!fs.existsSync(srcRoot)) return;

  // cpSync com dereference (default true) copia TUDO num passe só: diretórios
  // reais e os targets dos symlinks com hash — o chunk buildado faz
  // require("@libsql/client-<hash>"), então o diretório real precisa existir.
  fs.cpSync(srcRoot, dstRoot, { recursive: true });
  console.log('[package] externals do .next/node_modules replicados (Turbopack).');
}

function scanForSecrets(dest) {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // node_modules pré-instalado no modo portátil não é varrido: são
        // pacotes públicos do npm, e a varredura sobre 30k arquivos é lenta.
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (SECRET_NAMES.has(entry.name)) found.push(path.relative(dest, full));
    }
  };
  walk(dest);
  return found;
}

async function main() {
  const f = flags();
  const portable = !!f.portable;
  const dest = outDir(f);

  // NEXT_PUBLIC_* seria embutido no .next/static durante o build e vazaria no
  // pacote. Este projeto não usa nenhuma, mas o guard impede regressão futura.
  const dashEnvPath = path.join(DASH, '.env.local');
  if (fs.existsSync(dashEnvPath)) {
    const dashEnv = fs.readFileSync(dashEnvPath, 'utf8');
    if (/^\s*NEXT_PUBLIC_/m.test(dashEnv)) {
      console.error('[package] ERRO: dashboard/.env.local contém NEXT_PUBLIC_* — esses valores seriam embutidos no build e vazariam para o cliente. Remova e rode de novo.');
      process.exit(1);
    }
  }

  console.log('[package] Build do dashboard (next build)…');
  const build = spawnSync(process.execPath, [path.join(DASH, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: DASH,
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('[package] ERRO: build do dashboard falhou.');
    process.exit(1);
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  console.log('[package] Copiando arquivos…');
  fs.cpSync(path.join(ROOT, 'void.js'), path.join(dest, 'void.js'));
  // Doctor acompanha o pacote: é a ferramenta de suporte (node doctor.js --json).
  fs.cpSync(path.join(ROOT, 'doctor.js'), path.join(dest, 'doctor.js'));
  fs.cpSync(path.join(ROOT, 'LICENSE'), path.join(dest, 'LICENSE'));
  fs.cpSync(path.join(ROOT, 'README.md'), path.join(dest, 'README.md'));

  for (const dir of COPY_ROOTS) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, dir), { recursive: true, filter: filterCopy });
  }
  fs.cpSync(DASH, path.join(dest, 'dashboard'), { recursive: true, filter: filterCopy });
  // Reconstrói os externals com hash que o Turbopack criou no build (symlinks
  // de .next/node_modules). Sem isso o dashboard do cliente sobe com 500.
  replicateNextExternalModules(dest);

  // package.json do cliente (sem argon2, sem scripts do dono) + README do cliente.
  writeClientPackageJson(path.join(dest, 'package.json'), { portable });
  writeClientReadme(path.join(dest, 'CLIENT-README.md'), require(path.join(ROOT, 'package.json')).version, { portable });

  if (portable) {
    console.log('[package] Modo portátil — pré-instalando node_modules…');
    // Lock do root: versões determinísticas (o dashboard já copia o lock dele).
    fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(dest, 'package-lock.json'));
    runNpm(dest, ['install', '--omit=dev', '--no-audit', '--no-fund']);
    runNpm(path.join(dest, 'dashboard'), ['install', '--omit=dev', '--no-audit', '--no-fund']);

    await embedNode(dest, f.nodeVersion);
    writePortableLaunchers(dest);
    zipPortable(dest);
  }

  // Varredura final: nenhum segredo pode estar no pacote.
  const secrets = scanForSecrets(dest);
  if (secrets.length > 0) {
    console.error('[package] ERRO: segredos encontrados no pacote:', secrets.join(', '));
    process.exit(1);
  }

  console.log('[package] OK — pacote do cliente em:');
  console.log(`          ${dest}`);
  console.log('[package] Contém apenas public.pem (chave pública). Cofre/studio/segredos: REMOVIDOS e verificados.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[package] ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { flags, outDir, embedNode, zipPortable, writePortableLaunchers, writeClientPackageJson, writeClientReadme, scanForSecrets };

