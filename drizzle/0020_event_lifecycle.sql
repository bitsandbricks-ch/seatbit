CREATE TABLE `lan_interest` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lan_interest_uq` ON `lan_interest` (`lan_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `lan_news` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`author_id` text,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lan_news_lan_idx` ON `lan_news` (`lan_id`);--> statement-breakpoint
ALTER TABLE `attendance` ADD `arrived_at` integer;--> statement-breakpoint
ALTER TABLE `clan_member` ADD `interest_types` text;--> statement-breakpoint
ALTER TABLE `lan` ADD `publish_at` integer;--> statement-breakpoint
ALTER TABLE `lan` ADD `interest_check` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `date_tbd` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `date_hint` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `lan` ADD `cancel_reason` text DEFAULT '' NOT NULL;