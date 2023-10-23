import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey(),
  teamId: text('team_id').unique(), // "T02E6BLNV"
  slackBotToken: text('slack_bot_token').unique(), // "xoxb-...""
  projectId: text('project_id'), // "kyonenya-help"
});
