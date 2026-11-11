CREATE TABLE `channel_reminder_log` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_reminder_log_uq` ON `channel_reminder_log` (`lan_id`,`channel_id`,`kind`);--> statement-breakpoint
CREATE TABLE `discord_channel` (
	`id` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text DEFAULT '' NOT NULL,
	`added_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_channel_channel_id_unique` ON `discord_channel` (`channel_id`);--> statement-breakpoint
CREATE INDEX `discord_channel_clan_idx` ON `discord_channel` (`clan_id`);--> statement-breakpoint
CREATE INDEX `discord_channel_guild_idx` ON `discord_channel` (`guild_id`);--> statement-breakpoint
CREATE TABLE `discord_message` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_message_lan_channel_uq` ON `discord_message` (`lan_id`,`channel_id`);