'use strict';

/**
 * Logger simples e consistente para os processos CLI do projeto (scraper/fleet).
 * Formato: HH:MM:SS [escopo] NÍVEL  mensagem
 *
 * Sem dependências externas — usa apenas códigos ANSI, desligados automaticamente
 * quando a saída não é um terminal interativo (ex.: redirecionada para um arquivo
 * ou capturada por outro processo) ou quando NO_COLOR está definida.
 */

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const useColor = Boolean(process.stdout?.isTTY) && !process.env.NO_COLOR;

function paint(color, text) {
  return useColor ? `${color}${text}${COLORS.reset}` : text;
}

function timestamp() {
  return new Date().toTimeString().slice(0, 8); // HH:MM:SS
}

const LEVELS = {
  info: { label: 'INFO ', color: COLORS.cyan, method: 'log' },
  success: { label: 'OK   ', color: COLORS.green, method: 'log' },
  warn: { label: 'WARN ', color: COLORS.yellow, method: 'warn' },
  error: { label: 'ERRO ', color: COLORS.red, method: 'error' },
};

/**
 * Cria um logger com prefixo fixo de escopo (ex.: "scraper", "fleet", "conta-01").
 * @param {string} scope Nome do escopo exibido entre colchetes em cada linha.
 * @returns {Object} Objeto com os métodos info/success/warn/error.
 */
function createLogger(scope) {
  const tag = paint(COLORS.magenta, `[${scope}]`);

  function write(level, message, ...rest) {
    const { label, color, method } = LEVELS[level];
    const line = `${paint(COLORS.dim, timestamp())} ${tag} ${paint(color, label)} ${message}`;
    console[method](line, ...rest);
  }

  return {
    info: (message, ...rest) => write('info', message, ...rest),
    success: (message, ...rest) => write('success', message, ...rest),
    warn: (message, ...rest) => write('warn', message, ...rest),
    error: (message, ...rest) => write('error', message, ...rest),
    /** Cria um sub-logger com um escopo aninhado (ex.: "fleet" -> "fleet:conta-01"). */
    child: subScope => createLogger(`${scope}:${subScope}`),
  };
}

module.exports = { createLogger };
