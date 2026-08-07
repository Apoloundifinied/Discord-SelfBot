# Discord Message Collector

Aplicação local para coletar histórico (`scraper`), acompanhar mensagens em tempo real (`fleet`) e visualizá-las no dashboard Next.js.

## Preparação

1. Crie um banco no [Turso](https://turso.tech) e gere um token de leitura/escrita. Execute `database/schema.sql` no banco (via `turso db shell <nome-do-banco>` ou pelo painel) e, para a seção "Minha Conta" do dashboard, também `database/self-schema.sql` (tabelas `self_*`).
2. Copie `scraper/.env.example` para `scraper/.env` e configure a coleta histórica (`DISCORD_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
3. Copie `fleet/.env.example` para `fleet/.env` e `fleet/accounts.example.json` para `fleet/accounts.json` para a coleta em tempo real.
4. Copie `dashboard/.env.local.example` para `dashboard/.env.local` com as mesmas credenciais do Turso. Em produção, defina `DASHBOARD_PASSWORD`.
5. Instale as dependências: `npm install` e `npm --prefix dashboard install`.

## Comandos

- `npm run scrape` — executa a coleta de histórico.
- `npm run fleet` — inicia uma instância por conta configurada.
- `npm run doctor` — diagnóstico consolidado (versão, Node, banco, licença, token e última coleta). Use `npm run doctor -- --json` para saída JSON (suporte/automação).
- `npm run dashboard` — inicia o painel local.

O painel também expõe o mesmo diagnóstico em `GET /api/health`.

### Modo local (zero-configuração)

Na primeira execução sem banco nem token configurados, o painel abre o assistente
de configuração: escolha **Local** para criar um SQLite em `data/void.db` (sem
conta, tudo na máquina) ou **Turso** para um banco remoto (URL + token). Depois
é só colar o token da conta do Discord. O scraper e a fleet usam o mesmo banco
automaticamente.
- `npm run check` — lint, testes e build do painel.
- `node fleet/self.js` — coleta o snapshot completo da conta dona do token (perfil, relações, notas, DMs, servidores, affinities, compras). Dados de pagamento são gravados somente redigidos.

`message_id` é único no banco; scraper e fleet podem ser reiniciados sem criar mensagens duplicadas.

Não versione `.env`, `accounts.json` ou `node_modules`. Como estes arquivos já existiram no histórico anterior, rotacione todos os tokens e chaves antes de usar o projeto novamente.

## Licenciamento (opcional, para vender)

O produto pode ser protegido por **chaves assinadas (Ed25519)**, sem servidor próprio:

1. Na **sua máquina**, rode `npm run license:init` (senha-mestra pedida na hora, ou via `LICENSE_MASTER_PASSPHRASE`). Isso cria o cofre cifrado (Argon2id + AES-256-GCM) com a chave privada — ela **nunca sai da sua máquina**.
2. Emita chaves com `npm run license:create -- --sub cliente@email --days 30 [--features full] [--bind]`, ou pela aba **Licença → Administração de licenças** no dashboard da sua máquina.
3. Distribua para o cliente **apenas** `licenses/public.pem` (chave pública) junto com o app. Na máquina dele, sem o cofre, a aba de administração não existe — é impossível emitir ou forjar chaves.
4. No build do cliente, defina `LICENSE_ENFORCE=true` no `dashboard/.env.local`: o painel só abre com uma chave ativa (assinatura + validade + vínculo opcional de máquina).

Comandos: `npm run license` (ajuda), `license:init`, `license:create`, e `node licenses/studio.js list|revoke|extend|verify|info`. Documentação em `licenses/README.md`.

> Honestidade de segurança: a verificação roda no próprio app local. Uma chave **não pode ser forjada** sem a privada, e o vínculo de máquina impede copiar a ativação — mas um binário JS local sempre pode ser remendado por alguém determinado. Isso eleva a barreira, não a torna absoluta.

## Distribuição para o cliente

### 1. Empacote (na sua máquina)

```bash
npm run package:client
```

Gera `dist/void-client/` com **apenas a chave pública** de licença. O cofre da chave privada, o banco de chaves, a ativação, o `studio.js` e todos os `.env`/`accounts.json` são **removidos e verificados** — na máquina do cliente é impossível emitir chaves ou abrir a administração, mesmo revirando o pacote. O dashboard já vem compilado (`.next`), então o cliente não precisa buildar.

**Variante portátil** (recomendada para venda): `npm run package:portable` gera `dist/void-client-vX-win-x64.zip` com **Node embarcado** + `node_modules` pré-instalados + `VOID.bat`. O cliente só descompacta e dá dois cliques — **zero instalação, zero npm, zero terminal**. Sem falsos positivos de antivírus: o `node.exe` é o oficial assinado pela OpenJS Foundation (nada de executável compilado). Use `-- --node-version=v24.18.1` para escolher a versão do Node embarcado.

**Venda guiada (um comando só):** `npm run sell` empacota o portátil **e** emite a chave na sequência, perguntando email/dias/máquina do cliente, e imprime o caminho do ZIP + a chave prontos para enviar. Para venda remota, cole o Machine ID do cliente com `npm run sell -- --machine <id>` (o ID aparece no painel dele em "Licença") — a chave já nasce vinculada à máquina dele. `--no-bind` emite chave livre.

### 2. Gere a chave do cliente

Na sua máquina (com o cofre): `npm run license:create -- --sub cliente@email --days 30 [--features full] [--bind]` ou pela aba **Licença → Administração de licenças**. Envie a chave para o cliente por qualquer canal (email/WhatsApp). Como a chave é **assinada com a sua chave privada**, o app local do cliente — que só tem a chave pública — reconhece qualquer chave que você gerar, em qualquer lugar, sem servidor.

### 3. O cliente instala e roda

**Pacote portátil (zip):** descompacte a pasta VOID em qualquer lugar (ex.: `C:\VOID`) e dê **dois cliques em `VOID.bat`** (`VOID-Silent.vbs` roda sem janela do console). Na 1ª execução o `dashboard/.env.local` é criado sozinho a partir do exemplo — o assistente de onboarding configura banco e token dentro do painel.

**Pacote padrão (precisa de Node):**

```bash
npm install      # instala o app e o dashboard (uma vez)
node void.js     # ou: void, se instalado globalmente (npm link / npm i -g)
```

O launcher sobe o painel e abre o navegador. Em modo cliente (sem o cofre), o bloqueio de licença é **forçado**: aparece a tela de desbloqueio (lock screen) e nada do painel renderiza até uma chave válida ser ativada. Flags: `--port=3000`, `--no-fleet`, `--no-open`.

## Fluxo do dono (resumo)

1. `npm run license:init -- --force` — cria o cofre com a **sua** senha-mestra (os arquivos de teste atuais usam `teste-mestre-123`).
2. `LICENSE_MASTER_PASSPHRASE=...` no `dashboard/.env.local` — libera a aba de administração na sua máquina.
3. `npm run sell` — empacota o cliente e emite a chave guiado (ou `package:client` + `license:create ...` separados).
4. Envie o ZIP + a chave impressa para o cliente.
