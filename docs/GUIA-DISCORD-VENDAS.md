# 🎮 GUIA MÍNIMO — Servidor Discord de vendas do HUGGING

> O fluxo inteiro em uma frase:
> **cliente chega → lê o preço → paga o Pix → manda o comprovante →
> baixa o ZIP → manda o Machine ID → você envia a chave. Fim.**

Nada de cargos, nada de bots, nada de canal escondido. **2 canais e pronto.**

---

## ⚠️ A ÚNICA coisa que você precisa saber antes

Seu ZIP tem **147 MB** — o Discord sem Nitro só deixa enviar **10 MB por arquivo**.
**O ZIP não fica anexado no Discord.** Ele fica num host gratuito e você cola o
**link** no canal de download.

**Suba o ZIP no MediaFire** (grátis, nunca expira, padrão no BR) → copie o link.

> 💡 E pode deixar o link **público** — sem problema nenhum. O ZIP sem chave
> fica preso na tela de desbloqueio. **O ZIP é a isca, a chave é o produto.**
> Quem baixar sem pagar não consegue usar.

---

## 1️⃣ Criar o servidor (2 minutos)

1. Discord → clique no **+** (sidebar esquerda) → **"Criar meu próprio servidor"**.
2. Nome: **HUGGING** · ícone: o corvo (`huginn_logo_dark.png`).
3. Pronto. Só isso.

**Um ajuste de segurança** (30 segundos):
Configurações do servidor → **Segurança → Modo de verificação → Médio**.
Isso sozinho segura os bots de spam.

---

## 2️⃣ Crie só 2 canais

```
#🛒-comprar       ← o canal da venda (tudo acontece aqui)
#📥-download      ← só o LINK do ZIP
```

---

## 3️⃣ Cole estes textos

### Canal #🛒-comprar — mensagem fixada (uma única mensagem):

```
🦅 HUGGING — console de inteligência do Discord

💰 PREÇO: R$ XX,XX · pagamento único · chave vitalícia (vinculada à SUA máquina)

📲 PIX:
   Chave: SUA-CHAVE-PIX
   Nome: SEU-NOME

COMO COMPRAR (3 passos):
1️⃣ Faça o Pix e tire um print do comprovante.
2️⃣ Cole o print AQUI neste canal.
3️⃣ Baixe o ZIP no #📥-download e rode o VOID.bat.
   Copie o MACHINE ID que aparece na tela e cole AQUI também.

Sua chave DCX1 chega logo em seguida. ⏱️ Normalmente em minutos.
```

### Canal #📥-download:

```
📥 DOWNLOAD DO HUGGING

⬇️ LINK: COLE-AQUI-O-LINK-DO-MEDIAFIRE

1. Baixe o ZIP e descompacte (ex: C:\HUGGING).
2. Dê dois cliques em VOID.bat.
3. O navegador abre o painel — cole sua chave DCX1 na tela de desbloqueio.

Requisitos: Windows 10/11 · sem instalação.
```

---

## 3.5️⃣ Opcional (RECOMENDADO): privar o download com cargo 🛒

Deixar o ZIP público é seguro (sem chave ele não abre), mas privar o canal de
**download até o pagamento** valoriza o produto e te dá controle de quem baixou.
O custo: 10 segundos por cliente (dar o cargo). Vale a pena.

**Crie 1 cargo:**
1. Configurações do servidor → **Cargos** → **Criar cargo**.
2. Nome: `🛒 Cliente` → cor dourada → Criar.

**Proteja o canal #📥-download:**
1. Clique no `#📥-download` → **Editar canal** → **Permissões**.
2. Em **@everyone**: desative **Ver canal** (fica com o olhinho cortado).
3. Em **🛒 Cliente** (cargo): ative **Ver canal**.

Pronto — só quem tem o cargo vê o download.

**No atendimento:** após confirmar o Pix, clique no nome do cliente →
**Cargos** → marque `🛒 Cliente`. Ele já enxerga o download. Quando ele mandar
o Machine ID e você entregar a chave, pode deixar o cargo (é o registro de
quem comprou) ou remover depois — sua escolha.

---

## 4️⃣ Sua parte (o atendimento) — o que VOCÊ faz

Quando um cliente cola o comprovante no #🛒-comprar:

```
1. Confere o Pix no app do banco (caiu? ok).
2. Responde no canal:
   "✅ Pix confirmado! Pode baixar no #📥-download.
   Quando rodar o VOID.bat, me manda o MACHINE ID aqui."
3. Cliente manda o Machine ID (ex: 3a07b1ab7a67fab6).
4. Você roda no terminal:
   npm run key
   → email do cliente → dias → cola o MACHINE ID → enter
5. Copia a chave DCX1 que apareceu e cola no canal.
6. Cliente ativa. VENDA FECHADA ✅
```

> 💡 Sempre gere a chave **com o Machine ID** (nunca `--no-bind` pra cliente) —
> assim ele não consegue passar a chave pra outro PC.

---

## 5️⃣ Opcional: 1 bot (só se aparecer spam)

Se começar a cair gente estranha no servidor, instale o **Captcha.bot**
(grátis, site oficial → Invite → seu servidor). Só isso. Sem MEE6, sem Carl-bot,
sem nada — quando crescer, você adiciona.

---

## Checklist antes de divulgar

- [ ] Servidor "HUGGING" criado + modo verificação Médio
- [ ] ZIP no MediaFire, link no #📥-download
- [ ] Texto do #🛒-comprar com preço + chave Pix
- [ ] Teste real com outra conta: pagou → baixou → mandou Machine ID → recebeu chave
- [ ] Bio do TikTok → link do Discord

---

## 🧠 Regras de ouro (as únicas 3 que importam)

1. **Chave sempre com Machine ID** — nunca chave livre pra cliente.
2. **ZIP pode ser público** — sem chave da máquina dele, não abre.
3. **Comprovante antes da chave** — nunca gere chave antes de ver o Pix.
