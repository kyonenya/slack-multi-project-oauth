CREATE TABLE `projects` (
	`id` integer PRIMARY KEY NOT NULL,
	`slack_bot_token` text,
	`team_id` text,
	`hf_project_id` text
);
