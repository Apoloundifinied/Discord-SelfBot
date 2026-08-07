# PROMPT — Landing Page Motion Design · VOID

> Copie e cole tudo abaixo (do "── PROMPT INICIA AQUI ──" até o fim) em qualquer IA geradora de sites (v0, Lovable, Cursor, Claude, etc.). Está em português, autocontido, com todos os tokens de design, o conteúdo de copy e a especificação de motion.

---

── PROMPT INICIA AQUI ──

Você é um diretor de arte e engenheiro front-end sênior especializado em **motion design clean** — estética de ferramenta de inteligência premium, no nível de marcas como Nous Research (Hermes Agent), Linear e Vercel. Seu trabalho: criar uma **landing page one-page** para o produto abaixo, com **motion design e animação de alto nível mas contido** ("expensive, quiet, precise"). Nada de ruído, nada de decoração pesada — movimento como resposta e narrativa.

## 1. O PRODUTO

**VOID — Console de Inteligência · Discord** (um "scraper" de Discord vendido como app local, estilo selfbot de monitoramento/inteligência).

O que ele faz de verdade:
- **Coleta histórica** — raspa o histórico completo de servidores/canais do Discord (o usuário cola os IDs) e grava tudo num banco (Turso na nuvem ou SQLite local).
- **Tempo real (Fleet)** — uma ou várias contas ficam online monitorando servidores, mensagens novas chegam ao vivo no dashboard.
- **Dashboard local** — painel Next.js "console" com feed ao vivo, estatísticas, gráficos de atividade 24h/14 dias, top canais/autores, busca global.
- **Identidade** — resolve perfis (nome, avatar, flags, presença, atividade, conexões) e rastreia mudanças ao longo do tempo.
- **Minha Conta (Self)** — snapshot completo da conta dona do token: perfil, relações, notas, DMs, servidores, affinities, até país de cobrança (pagamentos gravados redigidos).
- **Licenciamento** — chaves assinadas Ed25519, vínculo opcional de máquina, expiração por dias; venda por ZIP portátil com Node embarcado (2 cliques, zero instalação).

**Público-alvo:** usuários avançados / revendedores que querem monitorar Discord com discrição e elegância. O tom é **ferramenta de inteligência profissional**, não "hacker script".

**Marca:** wordmark "VOID" em mono com letter-spacing largo, ponto violeta pulsante ao lado. Subtítulo "CONSOLE DE INTELIGÊNCIA • DISCORD".

## 2. REFERÊNCIA DE DESIGN (obrigatória)

Estude **https://hermes-agent.nousresearch.com/** (Hermes Agent, Nous Research). É a referência de direção:

- Fundo **preto absoluto** (#000), superfícies quase pretas, iluminação por **glows suaves** (dourado/âmbar e um toque violeta) em vez de gradientes óbvios.
- Tipografia **off-white quente** sobre preto; hierarquia por contraste e respiro, não por cor.
- **Um único acento vivo por vez** — dourado como acento principal, violeta como secundário raro.
- Layout limpo, generoso em whitespace, cartões finos com bordas sutis.
- Motion **discreto e caro**: entradas escalonadas, luz varrendo a tela ocasionalmente, textura de grão de filme sobre tudo.

O projeto já usa este sistema (chamado internamente de "Hermes Console") — **reutilize os tokens abaixo para a landing page ser idêntica em identidade ao produto**.

## 3. DESIGN SYSTEM (tokens obrigatórios)

```css
/* Paleta */
--bg:            #000000;          /* fundo absoluto */
--surface:       #0c0c0f;          /* cartão base */
--surface-2:     #131318;          /* cartão elevado */
--surface-3:     #1a1a20;          /* hover / código */
--border:        #202027;
--border-soft:   #16161b;
--border-strong: #2e2e38;

/* Texto (off-white quente) */
--text:          #f0ede6;
--text-muted:    #a6a29a;
--text-faint:    #6e6a63;

/* Accent Hermes gold */
--accent:        #f2c14e;
--accent-2:      #d9a441;
--accent-3:      #b98a2f;
--accent-ink:    #171104;          /* texto sobre botão gold */
--violet:        #a78bfa;          /* secundário raro */
--violet-2:      #7c6fd6;

/* Semânticos */
--success:       #5af7b0;
--warning:       #ffcf5f;
--danger:        #ff6b7d;

/* Glows */
--gold-glow:     rgba(242,193,78,0.14);
--gold-glow-soft:rgba(242,193,78,0.06);
--violet-glow:   rgba(167,139,250,0.10);

/* Tipografia */
--sans: 'Segoe UI Variable','Segoe UI',system-ui,-apple-system,sans-serif;
--mono: 'Cascadia Code','JetBrains Mono','SF Mono',Consolas,monospace;

/* Geometria / sombra */
--radius:  14px;
--radius-sm: 9px;
--radius-xs: 6px;
--shadow:   0 24px 60px rgba(0,0,0,0.55);
--shadow-sm:0 10px 30px rgba(0,0,0,0.40);

/* Motion */
--ease:        cubic-bezier(0.22, 1, 0.36, 1);   /* suave, "caro" */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* micro-interações */
```

Regras de identidade:
- **Wordmark:** mono, 700, letter-spacing ~0.3em, em **violeta com brilho animado** (gradiente de texto com background-position animado) + ponto violeta pulsante (ping de box-shadow).
- **Botão primário:** gradiente vertical gold (#f7cf6d → #f2c14e → #d9a441), texto `--accent-ink`, sombra dourada; hover = brightness 1.08 + levantar 1px + glow; active = scale 0.97.
- **Botão secundário / ghost:** transparente, borda `--border`, texto muted; hover = borda gold + glow suave.
- **Chips/badges:** pill com borda fina e texto mono uppercase pequeno; status "live" com dot verde `--success` pulsando (ping).
- **Cartões:** gradiente sutil `linear-gradient(180deg, surface-2, surface)`, borda `--border`; hover = borda gold 0.25 + **filete de 1px gold no topo que acende** + translateY(-2px).
- **Títulos de seção:** pequenos, mono, uppercase, letter-spacing 0.14em, cor `--text-faint`, com um **traço dourado de 14px** à esquerda (gradiente gold→transparente).
- **Código/IDs:** sempre `--mono`, gold sobre fundo `--surface-3` com borda.
- **Fundo:** grade de pontos sutil (radial-gradient 1px, opacidade ~0.04, size 26px) + blobs aurora (3: dois gold, um violeta) + **grão de filme** estático (SVG feTurbulence, opacidade 0.02) por cima de tudo.

## 4. ESTRUTURA DA PÁGINA (seções, nesta ordem)

1. **Nav fixa** — wordmark VOID à esquerda; links: Produto · Recursos · Como funciona · Segurança · Preço; à direita um chip de status ("LIVE" com dot verde pulsando) e botão CTA gold "Baixar VOID". Ao rolar: fundo vira vidro escuro (backdrop-blur) com borda inferior sutil; links com underline que cresce da esquerda no hover.
2. **Hero** — sobre o fundo aurora. Acima do título: chip pill mono "CONSOLE DE INTELIGÊNCIA • DISCORD" com dot gold pulsando. Título gigante (clamp ~2.5rem–5rem): "VEJA O QUE O DISCORD NÃO MOSTRA." — em off-white, com **uma palavra em gold** ("NÃO MOSTRA" ou "DISCORD"). Subtítulo muted explicando o produto em 1 frase. 2 CTAs: gold "Baixar para Windows" + ghost "Ver como funciona". Abaixo: **mockup animado do dashboard** (ver §5 item hero) — o elemento mais importante da página.
3. **Faixa de prova social / números** — 4 contadores animados (count-up ao entrar na viewport): "+1M mensagens coletadas", "Tempo real 24/7", "100% local", "2 cliques p/ instalar" (valores ajustáveis). Mono, gold, tabular-nums.
4. **Recursos (grid)** — 6 cartões: Coleta histórica · Tempo real (Fleet) · Dashboard ao vivo · Identidade & rastreio · Minha Conta · Licenciamento à prova de cópia. Cada um com ícone minimalista (stroke 1.5px, gold), título, 1 parágrafo, e um **detalhe de hover** (filete gold no topo + glow). Stagger ao entrar.
5. **Como funciona (3 passos)** — linha de pipeline animada: ① Descompacte e dê 2 cliques (ou npm install) → ② Conecte banco + escaneie o QR do token (fluxo "Token por QR") → ③ Pronto: histórico + tempo real no console. Passos conectados por linha que **desenha** (scaleX) conforme scroll; número em mono dentro de círculo com borda gold.
6. **Segurança & Privacidade** — seção em fundo mais escuro com grid 2 colunas: "Tudo na sua máquina" / "Chaves assinadas Ed25519, sem servidor" / "Pagamentos redigidos" / "Vínculo por máquina anti-cópia". Tom honesto, sem exagero ("eleva a barreira, não a torna absoluta").
7. **Preço / Planos** — 2 cards: **Chave Livre** (qualquer PC) e **Chave Amarrada** (anti-cópia, 1 máquina). Preço em mono grande, lista de recursos, botão CTA. Card destaque com borda gold e leve glow.
8. **FAQ** (4–6 perguntas) — accordion com animação de altura suave (layout animation), seta que gira 45°.
9. **CTA final** — sobre aurora mais intensa: título + botão gold grande + hint mono pequeno ("Windows 10/11 · Sem instalação · Sem terminal").
10. **Footer** — minimalista: wordmark, links, "© 2026 VOID" mono faint, chip de licença.

## 5. MOTION DESIGN — ESPECIFICAÇÃO (o coração do pedido)

Estilo: **clean, preciso, caro**. Movimento sempre tem motivo (narrativa, resposta, foco). Regras de ouro:
- **Só anime `transform` e `opacity`** (GPU-friendly). Nunca animar `width/height/top/left` para grandes elementos.
- Easing padrão `cubic-bezier(0.22, 1, 0.36, 1)`; spring apenas em micro-interações (menus, accordion, botões).
- Durações: entradas 500–900ms; reveals de scroll 600–800ms; micro 150–250ms; count-up 1.2–2s.
- Stagger máximo de ~6 itens (ex.: 0ms, 60ms, 120ms…). Depois disso, agrupar.
- **Nunca** movimento infinito chamativo além de: blobs aurora (lentos), dot pulsante, shimmer em skeleton, sweep de luz ocasional (a cada ~26s) e brilho do wordmark.

### Hero (a sequência de entrada, 1.2s total)
1. 0ms — chip pill fade+rise 8px.
2. 100ms — título com reveal por linhas/palavras (máscara `overflow:hidden` + translateY 110%→0, ou blur+fade). Palavra gold entra por último.
3. 250ms — subtítulo fade.
4. 350ms — CTAs fade+rise com stagger.
5. 500ms — **mockup do dashboard**: fade + translateY 40px→0 + leve scale 0.98→1 e um **glow bloom** atrás (radial gold que acende). Dentro do mockup, animação de **feed de mensagens ao vivo**: 3–5 mensagens entram escalonadas (como o painel real, `msgIn` 8px rise), com indicador "AO VIVO" e um contador de mensagens incrementando; esporadicamente uma nova mensagem "chega" (reinsere no topo com animação). Barras do gráfico de atividade crescem `scaleY` escalonadas. Tudo em loop suave, mas **lento e sutil** (mensagem nova a cada ~3–4s).

### Scroll (ScrollTrigger / IntersectionObserver, 1x por elemento)
- **Reveal padrão:** opacity 0→1 + translateY 24px→0 + blur(6px)→0, 700ms, `--ease`, staggered por grupos (não por card individual além de 6).
- **Contadores:** count-up com easing `outExpo`/`--ease`, iniciando quando o número entra; números em `font-variant-numeric: tabular-nums` (sem tremor).
- **Linha dos 3 passos:** desenha com scaleX quando o passo 1 entra; cada passo revela com stagger.
- **Parallax sutil** (máx. 20px, `useTransform` scroll) nos blobs aurora e no mockup do hero (mockup desce mais devagar que o scroll — sensação de profundidade).
- **Barra de progresso de scroll** no topo: linha gold 2px que preenche com scaleX, fixa sob a nav.
- **Nav:** ao rolar 40px+, fundo vira `rgba(0,0,0,0.6)` + `backdrop-filter: blur(14px)` com transição de 0.3s.

### Micro-interações (resposta, nunca decoração)
- **Botões magnéticos** no hero: leve atração ao cursor (translate máx. 4px) + glow que segue o mouse (radial-gradient na posição do cursor).
- Cards: hover = filete gold no topo acende (opacity 0→1), borda gold, translateY(-2px), glow de sombra.
- Links: underline scaleX da esquerda; seta "→" desliza 4px no hover.
- Accordion FAQ: altura animada (grid-template-rows 0fr→1fr ou height auto via layout animation), 300ms spring, seta gira 45°.
- Cursor customizado? **Não** — manter o nativo (clean).
- Tilt 3D nos cards? **Não** — seria ruído; no máximo um parallax de 1–2° no mockup do hero.

### Respeito ao usuário
- `@media (prefers-reduced-motion: reduce)`: desligar TODAS as animações (duração 0.01ms) e o loop do mockup; conteúdo permanece visível (estados finais garantidos — usar `both`/`fill-mode` ou remover transforms).
- Mobile: parallax e efeitos de cursor desligados; mockup com largura reduzida; reveals mais curtos (400ms).

## 6. COPY — TOM DE VOZ

- Português do Brasil, direto, confiante, **sem hype** e sem "hacker cringe". Frases curtas. Termos técnicos em mono quando são IDs/comandos.
- **Hero:** "VEJA O QUE O DISCORD NÃO MOSTRA." (alternativa: "TUDO QUE O DISCORD NÃO TE CONTA.")
- Subtítulo: "O VOID coleta histórico, monitora servidores em tempo real e monta a inteligência completa da sua conta — tudo num console local, discreto e rápido."
- Seções usam os títulos do §4; cada feature em 1 parágrafo, concreto (ex.: "Raspa o histórico completo dos servidores e canais que você escolher — uma vez configurado, é só deixar rodando.").
- Honestidade de segurança: "As chaves são assinadas com Ed25519 e o vínculo de máquina impede copiar a ativação — nada é à prova de balas, mas a barreira é real."

## 7. STACK TÉCNICA (recomendada)

- **Next.js (App Router) + React + Tailwind CSS** + **Framer Motion** (para as animações de scroll/entrada/layout) — combina com o produto (o dashboard é Next.js).
- Ou, se for estática: HTML/CSS/JS puro + IntersectionObserver (aceitável, mas Framer Motion dá o resultado mais refinado).
- Ícones: SVG inline, stroke 1.5px (estilo Linear), cores por token.
- Fonte: usar a stack do sistema (§3) — nenhuma fonte externa obrigatória. Se quiser um display, usar uma serifada discreta só no hero, mas manter mono nos acentos técnicos.
- Tudo responsivo (mobile-first) e acessível (contraste, focus-visible gold, aria para accordion/FAQ).

## 8. CRITÉRIOS DE ACEITE (o que "pronto" significa)

1. One-page completa com as 10 seções do §4, responsiva.
2. Hero com a sequência de entrada do §5 e o mockup de dashboard vivo (é a peça central — deve parecer o painel real do produto).
3. Todos os tokens do §3 aplicados — a página deve parecer "irmã" do painel VOID.
4. Scroll reveals, contadores, linha dos passos, barra de progresso e parallax funcionando; sem jank (animações só em transform/opacity).
5. `prefers-reduced-motion` respeitado.
6. Zero console errors, Lighthouse performance ≥ 90.
7. SEO básico: título, meta description, og:title/og:image.

## 9. NÃO FAZER

- Não usar gradientes neon/arco-íris, emojis, imagens stock, glassmorphism exagerado, tilt 3D em cards, cursor customizado, sombras coloridas fortes.
- Não animar elementos que já estão fora da viewport indefinidamente.
- Não exagerar no violeta — dourado é o acento; violeta é raro (wordmark, um detalhe por seção no máximo).
- Não prometer no copy nada que o produto não faz (ex.: "detecção em tempo real de tudo" — ser preciso).

Mãos à obra. Entregue a landing page completa, com o motion spec acima implementado de verdade.

── PROMPT TERMINA AQUI ──
