CREATE TABLE `clan` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`avatar` text,
	`join_policy` text DEFAULT 'approval' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clan_slug_unique` ON `clan` (`slug`);--> statement-breakpoint
CREATE TABLE `clan_invite` (
	`code` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `clan_member` (
	`clan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clan_member_uq` ON `clan_member` (`clan_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `clan_member_user_idx` ON `clan_member` (`user_id`);--> statement-breakpoint
ALTER TABLE `lan` ADD `clan_id` text REFERENCES clan(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `lan_type` ADD `clan_id` text REFERENCES clan(id) ON DELETE cascade;