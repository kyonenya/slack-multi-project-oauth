CREATE TABLE `projects` (
	`id` integer PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`slack_bot_token` text NOT NULL,
	`project_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_team_id_unique` ON `projects` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slack_bot_token_unique` ON `projects` (`slack_bot_token`);