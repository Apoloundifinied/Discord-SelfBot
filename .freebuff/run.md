# Run — preview do dashboard (VOID console)

## Reproduzir artefatos (checkout novo)

1. **Dependências** — instale as do dashboard (Next.js 16 + React 19 + libsql):

   ```bash
   npm --prefix dashboard install
   ```

   (o root do projeto também tem `npm install`; o dashboard tem `package-lock.json` próprio.)

2. **`dashboard/.env.local`** — necessário para as APIs e o proxy de auth. Não está
   versionado. Procedimento:
   - Copie `dashboard/.env.local.example` → `dashboard/.env.local`.
   - Preencha `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` com as credenciais do banco
     (URL + token gerados no painel do Turso).
   - Defina `DASHBOARD_PASSWORD` (obrigatória em produção; sem ela o proxy deixa
     tudo passar em dev com `NODE_ENV !== production`).
   - Opcional: `LICENSE_ENFORCE`, `LICENSE_MASTER_PASSPHRASE` (ver `.env.local.example`).
   - No worktree principal o arquivo já existe — não copiar do Git (nunca commitar).

3. **Arquivos de runtime opcionais** — o dashboard também lê `scraper/.env` e
   `fleet/.env` para o diagnóstico (`/api/health`). Sem eles o painel funciona,
   mas o HealthCard mostra "não configurado".

## Rodar o servidor (dev, Turbopack)

```bash
cd dashboard
PORT=3000 npm run dev
```

- **Porta**: 3000 é a padrão do launcher (`void.js`). Se ocupada, escolha uma
  livre e exporte: `PORT=3123 npm run dev` (o Next também sobe sozinho em 3001+
  se 3000 estiver em uso, mas prefira fixar a porta).
- **Detached** (sobrevive à conversa), log em arquivo:

  ```bash
  cd dashboard && (PORT=3000 npm run dev > /caminho/do/log 2>&1 &)
  ```

- **Autenticação**: o `dashboard/proxy.js` protege tudo com Basic Auth
  (`DASHBOARD_PASSWORD`). O launcher abre `/api/auth/login` com credenciais na
  URL (`void:SENHA@host`), que troca por cookie `void_auth` (httpOnly) e
  redireciona para a raiz. Sem credenciais na URL, um header Basic em qualquer
  rota também emite o cookie (usado por curl/testes).
- **Health check**: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/`
  → 401 é esperado (proxy pedindo auth); 200/307 significa rota pública.

## Preview (Freebuff)

1. Suba o servidor como acima, aguarde responder.
2. `register_preview` com `url=http://localhost:<porta>` e o PID do processo
   (via `netstat -ano | grep ':<porta>' | grep LISTEN`).
3. No preview: autentique com um fetch Basic em `'/'` (o proxy emite o cookie)
   e recarregue.
