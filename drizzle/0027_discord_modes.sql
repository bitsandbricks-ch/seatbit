ALTER TABLE `discord_message` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `discord_message` ADD `event_channel_id` text;--> statement-breakpoint
ALTER TABLE `lan_type` ADD `discord_mode` text DEFAULT 'channel' NOT NULL;