# VOID — Guia de Venda (Dono → Cliente)

Guia simplificado de comercialização. Existem 2 formas de vender:

| Tipo | Pra que serve | Cliente precisa te mandar o Machine ID? |
|---|---|---|
| **Chave livre** | Venda rápida, cliente usa em qualquer PC | Não |
| **Chave amarrada** | Anti-cópia: a chave só roda no PC do cliente | Sim (1º passo) |

O comando de venda **faz tudo sozinho**: empacota o produto + emite a chave. Você só entrega o ZIP + a chave.

---

## PARTE 1 — VOCÊ (DONO)

Rode tudo na pasta do projeto (onde tem o `package.json`).

### 1. Setup único (só na 1ª vez)

```bash
npm install
npm run license:init        # cria o cofre de chaves (private.pem.enc + public.pem)
```

> Se a pasta `licenses/` já tem `private.pem.enc`, pode pular o `license:init`.

### 2. Vender — chave LIVRE (simples, qualquer PC)

```bash
npm run sell -- --email email-do-cliente --days 30
```

### 3. Vender — chave AMARRADA ao PC do cliente (pede o Machine ID antes)

```bash
# 1) Cliente roda o VOID.bat e te manda o Machine ID
#    (na tela de desbloqueio tem um botão "copiar" — é esse ID)

# 2) Você emite a chave amarrada a esse PC:
npm run sell -- --email email-do-cliente --days 30 --machine ID-QUE-O-CLIENTE-MANDOU
```

⚠️ **Atenção**: use sempre `--machine <id-do-cliente>`.
NUNCA use `--bind` em venda remota — o `--bind` amarra a chave à
máquina de QUEM RODA o comando (você), e a chave não funcionaria no PC do cliente.

### 4. O que sai do comando

- **ZIP do produto**: `dist/void-client-v1.0.0-win-x64.zip`
- **Chave de licença**: impressa na tela (formato `DCX1.xxxxx.yyyyy`)

O `npm run sell` pede a senha-mestra do cofre (ou usa a que estiver em
`dashboard/.env.local` / variável `LICENSE_MASTER_PASSPHRASE`).

### 5. Entrega ao cliente

1. Manda o **ZIP** + a **chave** (WhatsApp / email / Drive).
2. Manda junto as instruções da PARTE 2 (abaixo).

### 6. Pós-venda (gerenciar chaves)

```bash
node licenses/studio.js list                 # ver todas as chaves emitidas
node licenses/studio.js verify <CHAVE>       # conferir se uma chave é válida
node licenses/studio.js extend <id> --days 60   # renovar (cliente expirou)
node licenses/studio.js revoke <id>          # cancelar uma chave
```

### 7. Testar o produto como o cliente veria (opcional)

```bash
npm run test:client -- --open    # extrai o ZIP e abre o painel com o node embarcado
```

### Regras de ouro (nunca quebrar)

- **NUNCA** envie a pasta `licenses/` inteira, nem `private.pem.enc`, nem
  `keys.json.enc` — quem tem isso consegue emitir chaves no seu lugar.
- O que viaja para o cliente é **só o ZIP** (ele já vem com a chave pública).
- A senha-mestra do cofre é o poder de emitir chaves: guarde bem.

---

## PARTE 2 — O CLIENTE (mensagem pronta pra enviar)

> Copie e cole isto para o seu cliente (ajuste a parte da chave amarrada se for o caso):

---

**COMO INSTALAR O VOID**

1. Descompacte o arquivo ZIP que você recebeu:
   clique com o botão direito → "Extrair tudo" → confirme.
   (Escolha uma pasta como `C:\VOID`. NÃO rode de dentro do Explorador do ZIP.)

2. Dentro da pasta extraída, dê **DOIS cliques em `VOID.bat`**.
   - Quer rodar sem a janela preta? Use `VOID-Silent.vbs` em vez do `.bat`.

3. O painel abre sozinho no navegador. Na tela de desbloqueio:
   - **(Se a chave é amarrada à máquina)** clique em **"copiar"** no ID da máquina
     que aparece na tela e envie esse ID para o vendedor. Ele vai te mandar a chave.
   - Cole a **chave de licença** que você recebeu e confirme.

4. Siga o assistente:
   - **Banco de dados**: duas opções —
     - **Local** (mais simples): tudo fica na máquina, sem conta. Recomendado
       para uso pessoal.
     - **Turso** (nuvem, dados em qualquer PC): crie um banco grátis em
       https://turso.tech → Databases → Create database → abra o console do
       banco e cole o conteúdo do arquivo `database/turso-template.sql`
       (acompanha o pacote) → Run. Depois copie a URL do banco e gere o token
       em Settings → Tokens → Generate. Cole URL + token no assistente.
   - **Token por QR** (recomendado): abra o app do Discord no celular →
     Configurações → Escanear QR Code e aponte para o código na tela. O token
     é coletado e validado sozinho.
   - **Token do Discord**: alternativa manual — cole o token, clique em
     "Testar token" e, se der certo, "Pronto".

5. Toda vez que for usar: **dois cliques em `VOID.bat`**.

6. **Problemas?** Na pasta do VOID, abra um terminal (cmd) dentro da pasta e rode:

   ```
   node\node.exe doctor.js --json
   ```

   Envie a saída inteira para o suporte — ela mostra o diagnóstico sem expor
   token nem chave.

---

## Fluxo completo da venda AMARRADA (passo a passo)

```
1. Cliente descompacta o ZIP e roda VOID.bat
2. Na tela de desbloqueio, o cliente vê o "ID da máquina" + botão copiar
3. Cliente te manda esse ID (ex.: a1b2c3d4e5f6a7b8)
4. VOCÊ roda:  npm run sell -- --email cliente@x --days 30 --machine a1b2c3d4e5f6a7b8
5. Sai o ZIP (se ainda não tinha) + a chave amarrada ao PC dele
6. Você manda a chave → cliente cola na tela → painel liberado
```

*Detalhe: o ID da máquina é um hash do hardware do PC do cliente — se ele trocar
de computador, a chave amarrada não funciona mais; emita uma nova para o novo ID.*
