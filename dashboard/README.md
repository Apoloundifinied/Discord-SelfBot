# Dashboard (Next.js) — visualização em tempo real

Site de página única (single-page) que consome a mesma tabela `discord_messages`
do Turso usada pelo `scraper/` e pela `fleet/`, e mostra as mensagens
chegando praticamente em tempo real, sem precisar mexer no banco diretamente.

## Como funciona (arquitetura)

```
Navegador  --(fetch a cada 2s)-->  /api/messages  --(Turso/libsql)-->  discord_messages
```

- **`app/api/messages/route.js`** — única rota de API. Roda no servidor Next.js
  e é o **único lugar** que fala com o Turso, usando o token de autenticação
  (`TURSO_AUTH_TOKEN`, definida em `dashboard/.env.local`, sem prefixo
  `NEXT_PUBLIC_` — ou seja, nunca é enviado ao navegador).
  - Sem parâmetros: retorna as últimas mensagens (mais novas primeiro).
  - Com `?after=<id>`: retorna só mensagens mais novas que esse id
    (usado para o polling incremental).
- **`hooks/useMessagesFeed.js`** — hook React que busca as mensagens iniciais e
  depois faz *polling* em `/api/messages?after=...` a cada 2 segundos,
  inserindo só as mensagens novas no topo da lista. Não é um WebSocket/Realtime
  de verdade, mas o efeito prático é o mesmo (atualização quase instantânea).
- **Componentes modulares** (`components/`):
  - `Header.jsx` — título + indicador de status da conexão (ao vivo/erro).
  - `StatsBar.jsx` — contadores (mensagens carregadas, autores únicos,
    servidores, mensagens no último minuto).
  - `FilterBar.jsx` — filtro por servidor + busca por texto/autor.
  - `MessageFeed.jsx` / `MessageItem.jsx` — lista de mensagens.
- **`app/page.js`** — a única página do site; monta os componentes acima e
  aplica os filtros (tudo client-side, sobre os dados já carregados).

## Configuração

```bash
cd dashboard
cp .env.local.example .env.local   # preencha com TURSO_DATABASE_URL e TURSO_AUTH_TOKEN
npm install
```

## Rodando localmente

```bash
npm run dev
```

Acesse http://localhost:3000

Ou, a partir da raiz do projeto:

```bash
npm run dashboard
```

## Build de produção

```bash
npm run build
npm run start
```

## Segurança

- O `TURSO_AUTH_TOKEN` é um token **secreto** com acesso de escrita ao banco.
  Ele só é lido em `lib/tursoServer.js`, importado exclusivamente pela rota de
  API (código que roda no servidor). Nenhum componente client-side
  (`'use client'`) importa esse arquivo nem tem acesso a essa variável.
- `dashboard/.env.local` está no `.gitignore` — nunca deve ser commitado.
