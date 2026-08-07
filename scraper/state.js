'use strict';

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../shared/logger');

const log = createLogger('scraper:state');
const dataDirectory = path.join(__dirname, 'data');
const stateFile = path.join(dataDirectory, 'state.json');

class ScraperState {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    } catch (error) {
      log.warn(`Estado inválido; iniciando do zero. (${error.message})`);
      return {};
    }
  }

  save() {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temporaryFile = `${stateFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temporaryFile, stateFile);
  }

  get(channelId) {
    return this.data[channelId] || { oldest: null, newest: null, backfillDone: false };
  }

  set(channelId, partial) {
    this.data[channelId] = { ...this.get(channelId), ...partial };
    this.save();
  }
}

module.exports = new ScraperState();
