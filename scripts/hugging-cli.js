'use strict';

/**
 * HUGGING CLI — identidade visual dos comandos do dono.
 *
 * Banner, cores e helpers de card usados por scripts/keygen.js e por quem
 * quiser embelezar outros comandos (sell.js etc.). Tudo desliga sozinho em
 * pipes/CI (não-TTY) e com NO_COLOR — nunca estraga logs ou redirecionamentos.
 */

const USE_COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function paint(code, s) {
  return USE_COLOR ? `\u001b[${code}m${s}\u001b[0m` : s;
}

const gold = s => paint('38;5;220', s);
const green = s => paint('32', s);
const red = s => paint('31', s);
const dim = s => paint('90', s);
const bold = s => paint('1', s);
const cyan = s => paint('36', s);

/** Wordmark HUGGING (figlet ANSI Shadow, só caixa alta). */
const BANNER = [
  ' ██╗  ██╗██╗   ██╗ ██████╗  ██████╗ ██╗███╗   ██╗ ██████╗ ',
  ' ██║  ██║██║   ██║██╔════╝ ██╔════╝ ██║████╗  ██║██╔════╝ ',
  ' ███████║██║   ██║██║  ███╗██║  ███╗██║██╔██╗ ██║██║  ███╗',
  ' ██╔══██║██║   ██║██║   ██║██║   ██║██║██║╚██╗██║██║   ██║',
  ' ██║  ██║╚██████╔╝╚██████╔╝╚██████╔╝██║██║ ╚████║╚██████╔╝',
  ' ╚═╝  ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝ ',
].map(line => line.trimEnd()).join('\n');

/** Banner completo: wordmark + divisor + linha opcional. */
function banner(tagline) {
  const lines = [gold(BANNER), dim('─'.repeat(56))];
  if (tagline) lines.push(dim(tagline));
  return lines.join('\n');
}

/** Card de entrega estilizado para a chave recém-gerada. */
function keyCard({ subject, expiresAt, machine, id }) {
  const bound = machine && machine !== 'livre (qualquer máquina)';
  return [
    '',
    gold('╔' + '═'.repeat(52) + '╗'),
    gold('║') + `  CHAVE GERADA · HUGGING LICENSE`.padEnd(52) + gold('║'),
    gold('║') + `  id     : ${id}`.padEnd(52) + gold('║'),
    gold('║') + `  cliente: ${subject}`.padEnd(52) + gold('║'),
    gold('║') + `  expira : ${expiresAt}`.padEnd(52) + gold('║'),
    gold('║') + `  máquina: ${bound ? machine : 'livre (qualquer máquina)'}`.padEnd(52) + gold('║'),
    gold('╠' + '═'.repeat(52) + '╣'),
    gold('║') + `  DCX1.… (abaixo) — envie ao cliente inteira`.padEnd(52) + gold('║'),
    gold('╚' + '═'.repeat(52) + '╝'),
  ].join('\n');
}

/** Linha de dica/aviso (subtle). */
function hint(msg) {
  return dim(`  ${msg}`);
}

module.exports = { banner, keyCard, hint, gold, green, red, dim, bold, cyan, USE_COLOR, BANNER };
