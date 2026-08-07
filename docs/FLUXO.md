# Fluxograma — Ciclo de vida do VOID (da aquisição ao uso com o token)

Visão do processo inteiro, do lado do **dono** (você) até o cliente rodando o
produto com o token da conta. Cada fase corresponde a um bloco de código real
do projeto (os comandos citados são os que existem).

---

## Diagrama (Mermaid)

````mermaid
flowchart TD
    subgraph F0["FASE 0 · DONO (você)"]
        A1[license:init<br/>cria o cofre cifrado<br/>private.pem.enc + public.pem] --> A2[package:client<br/>empacota dist/void-client<br/>REMOVE cofre/studio/.env/accounts]
        A1 --> A3[license:create --sub cliente --days 30<br/>emite chave assinada DCX1.payload.sig]
        A2 --> A4[Entrega ao cliente:<br/>pacote + chave<br/>email/WhatsApp]
        A3 --> A4
    end

    subgraph F1["FASE 1 · INSTALAÇÃO (máquina do cliente)"]
        B1[npm install<br/>instala o app + dashboard] --> B2[node void.js]
        B2 --> B3{Modo cliente?<br/>sem private.pem.enc}
        B3 -- sim --> B4[Força LICENSE_ENFORCE=true<br/>tela de bloqueio obrigatória]
        B3 -- não (dono) --> B5[Sem bloqueio<br/>admin de licenças disponível]
        B4 --> B6[Launcher sobe o painel<br/>next start + DASHBOARD_PASSWORD<br/>abre o navegador]
        B5 --> B6
    end

    subgraph F2["FASE 2 · DESBLOQUEIO (lock screen)"]
        C1[Painel consulta /api/license/status] --> C2{Sem ativação + enforce?}
        C2 -- sim --> C3[Lock screen estilo macOS<br/>campo de chave + shake em erro]
        C3 --> C4[Cliente cola a chave recebida<br/>POST /api/license/activate]
        C4 --> C5{Verificação local:<br/>assinatura com public.pem<br/>+ expiração + máquina}
        C5 -- ok --> C6[Grava licenses/activation.json<br/>PAINEL LIBERADO]
        C5 -- erro --> C7[Motivo na tela<br/>formato/assinatura/expirada/máquina]
        C7 --> C3
    end

    subgraph F3["FASE 3 · ONBOARDING (primeiro uso)"]
        D1[Assistente de configuração] --> D2{Banco já configurado?}
        D2 -- sim --> D4[Pula para o passo do token]
        D2 -- não --> D3{PASSO 1 · Banco}
        D3 -- Local --> D3a[Cria data/void.db<br/>SQLite zero-config · schema completo<br/>sem conta, sem token de banco]
        D3 -- Turso --> D3b[URL libsql:// + token de leitura/escrita]
        D3a --> D4
        D3b --> D4
        D4 --> D5{PASSO 2 · Token por QR Code}
        D5 --> D5a[POST /api/token/qr<br/>spawn fleet/scan-token.js · remote-auth
QR exibido na tela · polling de eventos]
        D5a --> D5b[Cliente escaneia com o app do Discord<br/>Configurações > Escanear QR Code]
        D5b --> D5c[Token validado via GET /users/@me<br/>aplicado automaticamente no passo seguinte]
        D5c --> D6{PASSO 3 · Token do Discord<br/>pré-preenchido ou colado à mão}
        D6 --> D6b[Testar token<br/>POST /api/token/test → GET /users/@me]
        D6b -- válido --> D7[PASSO 4 · Pronto → Começar a usar]
        D6b -- inválido --> D6
    end

    subgraph F4["FASE 4 · OPERAÇÃO (com o access token)"]
        E1["scraper (histórico)<br/>DISCORD_TOKEN + guilds/canais<br/>grava discord_messages"] --> E7[(Banco de dados<br/>Turso ou SQLite local<br/>mesmo DB p/ tudo)]
        E2["fleet (tempo real)<br/>accounts.json · 1 instância/conta<br/>grava discord_messages"] --> E7
        E3["Identidade<br/>perfil por ID via REST<br/>guilds mútuas · presença · conexões"] --> E7
        E4["Minha Conta (self)<br/>snapshot completo do dono do token<br/>relações · notas · DMs · servidores · compras"] --> E7
        E5["Rastreio agendado<br/>loop no fleet/manager<br/>snapshots de perfil no tempo"] --> E7
        E6["Busca de mensagens por autor<br/>messages/search por guild"] --> E7
        E7 --> E8[Painel<br/>Ao vivo · Diagnóstico (health)<br/>Identidade · Minha Conta · Fleet · Scraper]
        E8 --> E9["npm run doctor / GET /api/health<br/>diagnóstico consolidado<br/>versão · banco · licença · token · última coleta"]
    end

    subgraph F5["FASE 5 · CICLO DE VIDA DA LICENÇA"]
        F1a[Chave re-verificada a cada<br/>/api/license/status] --> F1b{Expirada?}
        F1b -- sim --> F1c[Lock screen de novo<br/>precisa de chave nova]
        F1b -- não --> F1d[Painel segue liberado]
        F1c --> F1e[Dono emite nova chave<br/>license:create / extend<br/>entrega de novo]
        F1e --> F1c
        F1d --> F1b
    end

    F0 --> F1
    F1 --> F2
    F2 --> F3
    F3 --> F4
    F4 --> F5
````

---

## Visão em texto (passo a passo)

### FASE 0 — Dono (só na sua máquina)
1. `npm run license:init` → gera o par Ed25519 e cifra a privada no cofre
   (`private.pem.enc`, AES-256-GCM com senha derivada por Argon2id). Só a
   **pública** (`public.pem`) é feita para viajar.
2. `npm run package:client` → builda o dashboard e monta `dist/void-client/`:
   cofre, `studio.js`, `.env`, `accounts.json` e ativações são **removidos e
   verificados**. O pacote só tem `public.pem` + o app compilado.
3. `npm run license:create -- --sub cliente --days 30` → emite a chave
   `DCX1.<payload>.<assinatura>` — um token autocontido que só você consegue
   assinar (você tem a privada).
4. Entrega: **pacote** + **chave** (email/WhatsApp). Nada de servidor, nada
   de hospedagem sua.

### FASE 1 — Instalação (máquina do cliente)
1. `npm install` → instala o app e o dashboard (postinstall cuida do painel).
2. `node void.js` → o launcher:
   - valida Node ≥ 20.18;
   - detecta **modo cliente** (não existe `private.pem.enc`) e força
     `LICENSE_ENFORCE=true`;
   - garante a `DASHBOARD_PASSWORD` local (Basic Auth do painel);
   - usa o build `.next` já empacotado (ou compila na 1ª execução);
   - sobe o painel na porta livre e abre o navegador.

### FASE 2 — Desbloqueio (lock screen)
1. O painel consulta `/api/license/status`; sem ativação + enforce ativo →
   aparece a **tela de desbloqueio** (estilo macOS).
2. O cliente cola a chave → `/api/license/activate` verifica **localmente**:
   assinatura contra a `public.pem` embarcada + validade temporal + vínculo de
   máquina (se a chave foi emitida com `--bind`).
3. Sucesso → grava `licenses/activation.json` e o painel libera.
4. Falha → motivo claro na tela e o campo treme.

### FASE 3 — Onboarding (primeiro uso)
1. O assistente detecta se já há banco configurado (se sim, pula direto pro token).
2. **Passo Banco**: *Local* (SQLite em `data/void.db`, zero-config, schema
   criado automaticamente) ou *Turso* (URL + token).
3. **Passo Token por QR** (novo, recomendado): o painel inicia uma sessão de
   login por QR Code (`POST /api/token/qr` → `fleet/scan-token.js`, remote-auth
   do Discord) e exibe o QR na tela. O cliente escaneia com o app do Discord
   (Configurações → Escanear QR Code); o token é validado via `GET /users/@me`
   e **aplicado automaticamente** no passo seguinte.
4. **Passo Token do Discord**: já vem pré-preenchido pelo QR, ou o cliente cola
   o token manualmente e toca **Testar** — o painel valida contra
   `GET /users/@me` antes de salvar.
5. **Passo Pronto** → o painel abre completo.

### FASE 4 — Operação (com o access token)
Tudo grava no **mesmo banco** (Turso ou SQLite local):
- **Scraper** — coleta histórica (guilds/canais do `scraper/.env`).
- **Fleet** — coleta em tempo real (1 instância por conta em `accounts.json`).
- **Identidade** — perfil de qualquer usuário por ID (guilds mútuas, presença,
  conexões, badges) via REST.
- **Minha Conta** — snapshot completo do dono do token (relações, notas, DMs,
  servidores, affinities, compras — dados sensíveis redigidos).
- **Rastreio agendado** — snapshots de perfil ao longo do tempo.
- **Busca por autor** — recupera mensagens de um usuário num servidor sem o
  scraper ter passado lá.
- **Diagnóstico** — `HealthCard` no painel poli `/api/health` (cache 10s) e
  `npm run doctor` no terminal.

### FASE 5 — Ciclo de vida da licença
- A chave é re-verificada a cada chamada de status: expirou → **lock de novo**,
  o cliente precisa de chave nova (você emite via `license:create`/`extend`).
- **Revogação honesta**: revogar no cofre impede novas emissões/extensões e o
  registro no seu painel, mas **não propaga em tempo real** para uma máquina já
  ativada (a verificação é local e não há servidor) — a chave ativada vale até
  expirar. É a barreira que o modelo local permite.

---

## Pontos de segurança do modelo

| Garantia | Como é feita |
|---|---|
| Cliente não emite chaves | Chave privada nunca sai da sua máquina; o pacote nem contém o `studio.js` |
| Chave não é forjada | Assinatura Ed25519 verificada com a `public.pem` embarcada |
| Chave não é copiada | Vínculo de máquina opcional (`--bind`) + `activation.json` local |
| Nada sai da máquina do cliente | Banco, token e dados ficam locais (ou no Turso que o próprio cliente criou) |
| Suporte remoto | `node doctor.js --json` → você diagnostica sem perguntar nada |
