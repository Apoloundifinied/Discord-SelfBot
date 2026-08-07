'use strict';

const config = require('./config');
const { createTursoClient, assertValidTableName, isTursoConfigured } = require('../shared/turso');

if (!isTursoConfigured(config)) {
  throw new Error('TURSO_DATABASE_URL (e TURSO_AUTH_TOKEN para bancos remotos) devem ser configuradas em fleet/.env.');
}
assertValidTableName(config.tursoTable);

const client = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });

async function upsertMessages(rows) {
  if (!rows.length) return;

  const statements = rows.map(row => ({
    sql: `INSERT INTO ${config.tursoTable} (message_id, author_name, message_content, source_info)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (message_id) DO UPDATE SET
            author_name = excluded.author_name,
            message_content = excluded.message_content,
            source_info = excluded.source_info`,
    args: [row.message_id, row.author_name, row.message_content ?? '', JSON.stringify(row.source_info)],
  }));

  await client.batch(statements);
}

module.exports = { upsertMessages };
