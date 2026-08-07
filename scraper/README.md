# Raspador de histórico de mensagens (Discord → Turso)

Ferramenta que usa a conta de usuário (selfbot) deste projeto para ler o
**histórico de mensagens** de canais/servidores do Discord e salvar cada
mensagem na tabela `discord_messages` de um banco Turso (libsql).

Este script **não** modifica o cliente/lib em si — ele apenas usa
`discord.js-selfbot-v13` como biblioteca para logar e ler mensagens.

## O que ele faz

1. Loga na conta configurada em `DISCORD_TOKEN`.
2. Monta a lista de canais a raspar a partir de `CHANNEL_IDS` e/ou `GUILD_IDS`
   (quando um `GUILD_ID` é informado, todos os canais de texto **legíveis**
   pela conta naquele servidor entram na lista).
3. Para cada canal, pagina o histórico com `channel.messages.fetch({ limit, before })`
   (o máximo permitido pelo Discord, 100 mensagens por request).
4. Cada mensagem é convertida e enviada em lote para o Turso:
   - `author_name` → `message.author.tag`
   - `message_content` → `message.content`
   - `source_info` (JSON) → `{ message_id, channel_id, channel_name, guild_id, guild_name, sent_at, edited_at, attachments }`
   O upsert usa `ON CONFLICT (message_id) DO UPDATE`, então reiniciar o script
   não cria mensagens duplicadas.
5. O progresso de cada canal é salvo em `scraper/data/state.json`, permitindo:
   - Retomar de onde parou se o processo for interrompido.
   - Depois que o histórico completo de um canal já foi lido uma vez, passar a
     buscar **só mensagens novas** nas execuções seguintes (`after`), em vez de
     reler tudo de novo.

## Proteções para reduzir o risco de banimento

Selfbots são detectados principalmente por **padrões de requisição não-humanos**
(rajadas de chamadas, paralelismo agressivo, raspagem contínua sem pausas). Este
script mitiga isso com:

- **Processamento sequencial**: nunca busca mais de um canal por vez.
- **Delay aleatório entre páginas** (`MIN_DELAY_MS`/`MAX_DELAY_MS`, padrão 2.5–5.5s).
- **Delay maior entre canais** (`MIN_CHANNEL_DELAY_MS`/`MAX_CHANNEL_DELAY_MS`, padrão 8–15s).
- **Limite por execução** (`MAX_MESSAGES_PER_CHANNEL_PER_RUN`, padrão 2000): em vez
  de tentar raspar um canal gigante de uma vez, rode o script periodicamente
  (ex.: via `cron`) e deixe ele continuar de onde parou.
- **Backoff automático** em caso de erro/HTTP 429 (rate limit), com espera
  progressiva antes de tentar de novo (`MAX_RETRIES`).
- **Modo incremental**: depois do histórico completo já lido uma vez, só busca
  mensagens novas — muito menos requisições no dia a dia.

Mesmo assim, **nenhuma automação de conta de usuário é 100% livre de risco**
perante os Termos de Serviço do Discord. Use valores conservadores de delay e
evite raspar muitos servidores/canais simultaneamente.

## Configuração

```bash
cd scraper
cp .env.example .env
```

Edite `scraper/.env` e preencha pelo menos:

- `DISCORD_TOKEN` — token da conta que vai ler as mensagens.
- `TURSO_DATABASE_URL` — ex.: `libsql://seu-banco.turso.io`.
- `TURSO_AUTH_TOKEN` — token de leitura/escrita gerado no painel do Turso.
- `CHANNEL_IDS` e/ou `GUILD_IDS` — o que raspar.

## Instalação e execução

Na raiz do projeto:

```bash
npm install
npm run scrape
```

Para parar com segurança (salva o progresso antes de sair), use `Ctrl+C`.

## Tabela esperada no Turso

Veja `database/schema.sql` (raiz do projeto):

```sql
create table if not exists discord_messages (
  id integer primary key autoincrement,
  message_id text not null unique,
  author_name text not null,
  message_content text,
  captured_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source_info text not null default '{}'
);
```

`captured_at` é preenchido automaticamente pelo banco (default `now()`); o
script não precisa enviar esse campo.
