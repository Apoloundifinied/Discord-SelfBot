# Fleet de coleta em tempo real (múltiplas contas → Supabase)

Sistema separado do `scraper/` (que lê **histórico**). Este aqui coleta
mensagens **em tempo real**, usando **N contas Discord simultaneamente**, cada
uma ouvindo os servidores dos quais já é membro e enviando `{ autor, conteúdo }`
para a mesma tabela `discord_messages` no Supabase.

> **Modo recomendado: `GUILD_IDS`.** Em vez de cada conta tentar entrar
> automaticamente em um servidor via convite (o que pode disparar um captcha
> que a lib não resolve sozinha — veja a seção de Configuração), você entra
> manualmente em vários servidores com suas contas (pelo app oficial do
> Discord) e informa os IDs desses servidores em `GUILD_IDS`. Cada instância
> só escuta, dentre essa lista, os servidores dos quais a conta dela já é
> membro — sem nenhuma tentativa de entrada automatizada.

## Adaptação do diagrama original (VPS → máquina local)

O diagrama original previa cada "instância" rodando em uma VPS, com um
"servidor pai" orquestrando tudo e um "servidor de exibição" separado. Como
você não tem uma VPS, esta implementação roda **tudo localmente**:

- Cada "instância" do diagrama = **um processo filho Node** (`fleet/instance.js`),
  criado via `child_process.fork` a partir de `fleet/manager.js`.
- O "servidor pai" = `fleet/manager.js`, rodando na sua própria máquina.
- O "servidor de exibição" não existe como processo separado: o console do
  `manager.js` já mostra o status de cada instância, e a própria tabela
  `discord_messages` no Supabase é a fonte de dados para qualquer exibição
  futura (dashboard, etc.).

Nada impede de mover isso para uma VPS depois — é só rodar `npm run fleet` lá
em vez de localmente.

## Arquitetura

```
fleet/manager.js  (processo pai)
  ├─ fork → fleet/instance.js  (conta 1)
  ├─ fork → fleet/instance.js  (conta 2)
  └─ fork → fleet/instance.js  (conta N)
```

- O `manager.js` lê `fleet/accounts.json` (label + token de cada conta) e sobe
  um processo filho por conta.
- O token é enviado para o filho **via mensagem IPC** (`child.send(...)`),
  nunca por variável de ambiente ou argumento de linha de comando — assim ele
  não aparece em `ps aux` nem em `/proc/<pid>/environ`.
- Cada instância (`instance.js`):
  1. Loga com o token recebido.
  2. **Modo `GUILD_IDS` (recomendado)**: confere, dentre os IDs configurados,
     quais a conta já é membro (`client.guilds.cache`) — nenhuma tentativa de
     entrada automática.
     **Modo `GUILD_INVITE` (legado)**: resolve o servidor com
     `client.fetchInvite(...)` e, se ainda não for membro, espera um delay
     aleatório e tenta entrar com `client.acceptInvite(...)` (pode exigir
     captcha — veja abaixo).
  3. Ouve `messageCreate` nesses servidores (com filtro opcional de canais) e
     insere cada mensagem no Supabase.
  4. Se o Discord responder 401/403 (token inválido/banido/bloqueado), o
     processo se mata sozinho (`process.exit(2)`) para o manager parar de
     reiniciar essa conta.
- O `manager.js` acompanha cada filho via mensagens IPC (`ready`, `joined`,
  `listening`, `warning`, `banned`, `crashed`, `needs-manual-join`) e via
  código de saída:
  - `exit code 2` → conta banida/bloqueada, **não reinicia**.
  - `exit code 3` → Discord pediu captcha para entrar via convite (modo
    `GUILD_INVITE`), **não reinicia** — entre manualmente com essa conta e
    rode a fleet de novo (ou migre para o modo `GUILD_IDS`).
  - `exit code != 0/2/3` → crash comum, reinicia após `RESTART_DELAY_MS`, até
    `MAX_RESTARTS_PER_ACCOUNT` tentativas.
  - `exit code 0` → encerramento limpo (ex.: `Ctrl+C`), nada a fazer.

## Proteções anti-ban

- **Sem entrada automatizada (modo `GUILD_IDS`)**: a forma mais segura é você
  mesmo entrar manualmente nos servidores com cada conta (como faria
  normalmente) e só apontar os IDs em `GUILD_IDS` — nenhuma automação de
  entrada, nenhum risco de captcha/detecção por esse motivo.
- **Entrada escalonada (modo `GUILD_INVITE`, legado)**: cada conta espera um
  tempo aleatório (`MIN_JOIN_DELAY_MS`–`MAX_JOIN_DELAY_MS`, padrão 5–20s) antes
  de aceitar o convite, evitando que todas entrem no servidor "ao mesmo
  tempo". Mesmo assim, o Discord pode exigir captcha nesse modo.
- **Self-destruct em vez de retry-loop**: uma conta banida/bloqueada, ou que
  esbarrou no captcha, não fica tentando de novo — ela se desliga e é marcada
  como inativa na fleet.
- **Sem paralelismo agressivo por conta**: cada instância só reage a eventos
  (`messageCreate`), não faz polling nem varre histórico.

Mesmo assim, **automação de contas de usuário nunca é livre de risco** perante
os Termos de Serviço do Discord.

## Configuração

```bash
cd fleet
cp .env.example .env
cp accounts.example.json accounts.json
```

Edite `fleet/.env`:

- `SUPABASE_URL` / `SUPABASE_KEY` — pode reaproveitar as mesmas do `scraper/.env`.
- `GUILD_IDS` (recomendado) — lista separada por vírgula com os IDs dos
  servidores que suas contas já participam (entre manualmente pelo app do
  Discord e copie o ID do servidor: clique com o botão direito no ícone do
  servidor > Copiar ID do Servidor, com o modo desenvolvedor ativado).
- `GUILD_INVITE` (opcional/legado) — só usado se `GUILD_IDS` estiver vazio;
  convite para a conta tentar entrar automaticamente (pode pedir captcha).
- `CHANNEL_IDS` — opcional, lista separada por vírgula para restringir os canais ouvidos.

Edite `fleet/accounts.json` com as contas reais:

```json
[
  { "label": "conta-01", "token": "..." },
  { "label": "conta-02", "token": "..." }
]
```

Para obter o token de cada conta com segurança (sem hacks de console do
navegador), use o helper de QR code já existente no `scraper/`:

```bash
npm run get-token
```

> `fleet/accounts.json` contém tokens reais e está no `.gitignore` — nunca
> deve ser commitado.

## Execução

Na raiz do projeto:

```bash
npm install
npm run fleet
```

Para encerrar com segurança (pede shutdown gracioso a todas as instâncias, e
força o encerramento com `tree-kill` se alguma não responder a tempo), use
`Ctrl+C`.

## Tabela esperada no Supabase

Mesma tabela usada pelo `scraper/`:

```sql
create table if not exists discord_messages (
  id bigint generated by default as identity primary key,
  author_name text not null,
  message_content text,
  captured_at timestamp with time zone default timezone('utc'::text, now()) not null,
  source_info jsonb default '{}'::jsonb
);

create index if not exists idx_author_name on discord_messages (author_name);
```
