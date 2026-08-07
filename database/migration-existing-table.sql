-- Use uma vez se a tabela discord_messages já existe no banco antigo (sem message_id).
alter table discord_messages add column message_id text;

update discord_messages
set message_id = json_extract(source_info, '$.message_id')
where message_id is null or message_id = '';

-- Descarta somente cópias equivalentes, preservando o registro mais recente.
delete from discord_messages
where rowid not in (
  select max(rowid) from discord_messages where message_id is not null group by message_id
);

create unique index if not exists discord_messages_message_id_key
  on discord_messages (message_id);
