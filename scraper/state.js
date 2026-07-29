'use strict';

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../shared/logger');

const log = createLogger('scraper:state');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

/**
 * Estado persistido por canal, para permitir retomar a raspagem sem repetir
 * trabalho já feito (menos requisições = menos risco de rate limit/ban).
 *
 * Formato:
 * {
 *   "<channelId>": {
 *     "oldest": "<id da mensagem mais antiga já raspada>" | null,
 *     "newest": "<id da mensagem mais nova já raspada>" | null,
 *     "backfillDone": boolean // true quando já chegou ao início do histórico do canal
 *   }
 * }
 */
class ScraperState {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
    } catch (err) {
      log.warn(`Não foi possível ler ${STATE_FILE}, começando do zero. (${err.message})`);
    }
    return {};
  }

  save() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.data, null, 2), 'utf8');
  }

  get(channelId) {
    return this.data[channelId] || { oldest: null, newest: null, backfillDone: false };
  }

  set(channelId, partial) {
    this.data[channelId] = { ...this.get(channelId), ...partial };
    // Salva incrementalmente: se o processo for interrompido, não perdemos o progresso.
    this.save();
  }
}

module.exports = new ScraperState();
