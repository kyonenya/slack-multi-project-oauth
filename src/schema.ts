import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey(),
  slackBotToken: text('slack_bot_token').unique(), // "xoxb-...""
  teamId: text('team_id').unique(), // "T02E6BLNV"
  hfProjectId: text('hf_project_id'), // "kyonenya-help"
});
