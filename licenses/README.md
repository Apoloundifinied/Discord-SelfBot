# Licenciamento — o que vive nesta pasta

| Arquivo | Quem tem | O que é |
|---|---|---|
| `studio.js` | **só o dono** | CLI que emite/gerencia chaves (usa a chave privada + Argon2id). |
| `private.pem.enc` | **só o dono** | Chave privada Ed25519 cifrada (AES-256-GCM; senha-mestra derivada por Argon2id). Criada pelo `init`. |
| `keys.json.enc` | **só o dono** | Banco de chaves emitidas, cifrado com a mesma senha-mestra. |
| `activation.json` | a instalação (cliente) | Chave ativada localmente + máquina em que foi ativada. Criada ao ativar no painel. |
| `public.pem` | **viaja com o produto** | Chave pública — a única peça que o cliente recebe. Verifica assinaturas. |

> **Regra de ouro:** `private.pem.enc`, `keys.json.enc` e `activation.json`
> estão no `.gitignore` e **nunca** podem ser enviados a um cliente. Se um cliente
> tiver o cofre, ele tem o poder de emitir chaves — o isolamento do campo de
> administração depende disso.

## Fluxo do dono

**Painel (recomendado para venda diária):**

```bash
npm run panel        # abre o painel HUGGING no navegador — gera/copia/revoga/estende
```

Só escuta em `127.0.0.1` e cada acesso exige o token impresso no terminal.

**CLI guiada (um comando só):**

```bash
npm run key          # pergunta email → dias → Machine ID do cliente → imprime a chave
npm run key -- --email joao@x --days 30 --machine <id-do-cliente>   # sem prompts
npm run key -- --email joao@x --days 30 --no-bind                   # chave livre
npm run keys         # lista as chaves emitidas (alias do studio list)
```

**Studio (controle fino):**

```bash
npm run license:init                      # 1ª vez: cria o cofre + public.pem
npm run license:create -- --sub joao@x --days 30 --features full --bind
node licenses/studio.js revoke <id>       # matar uma chave
node licenses/studio.js extend <id> --days 60
node licenses/studio.js verify <CHAVE>    # conferir uma chave
```

> Vínculo de máquina: `--machine <id>` usa o Machine ID que o CLIENTE vê na tela
> de desbloqueio (venda remota). `--bind` amarra à máquina onde o comando roda
> (venda presencial). Sem nenhum dos dois, a chave fica **livre** (qualquer máquina).

A senha-mestra vem de `LICENSE_MASTER_PASSPHRASE` (env) ou é pedida no terminal
(sem eco). Emissões pela aba **Licença** do dashboard usam a senha do
`dashboard/.env.local` da máquina do dono.

## Formato da chave

```
DCX1.<payload base64url>.<assinatura base64url>
```

Payload assinado (Ed25519): `{ v, i (id), sub (cliente), exp (epoch s), fe (features), mid (máquina), c (criada em) }`.
A verificação é 100% local (`shared/license.js`, só `node:crypto`): assinatura +
validade + vínculo opcional de máquina.

## Ativar no produto (cliente)

Aba **Licença** → colar a chave → “Ativar licença”. A ativação grava
`licenses/activation.json` localmente e o status é re-verificado a cada chamada.
Com `LICENSE_ENFORCE=true` no `dashboard/.env.local`, o painel não abre sem
licença válida.

## Limites honestos

- Uma chave **não pode ser forjada** sem a chave privada (assinatura Ed25519).
- O vínculo de máquina (`--bind`) impede copiar a ativação para outro PC.
- Mas a verificação roda no app local: um JS distribuído sempre pode ser
  remendado por alguém determinado. Nenhum sistema offline é inquebrável — este
  eleva a barreira a um nível prático para venda casual.
- Revogação offline: como não há servidor, a revogação vale para chaves ainda
  não ativadas ou para builds que reconectam a um servidor seu (futuro opcional).
  Chaves ativadas param no fim da validade.
