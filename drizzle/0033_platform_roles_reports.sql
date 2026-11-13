CREATE TABLE `report` (
	`id` text PRIMARY KEY NOT NULL,
	`clan_id` text,
	`lan_id` text,
	`subject` text DEFAULT '' NOT NULL,
	`reporter_id` text,
	`reason` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`handled_by` text,
	`handled_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`handled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `report` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_clan_idx` ON `report` (`clan_id`);--> statement-breakpoint
ALTER TABLE `clan` ADD `suspended_at` integer;--> statement-breakpoint
ALTER TABLE `clan` ADD `suspended_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `suspended_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `suspended_reason` text;--> statement-breakpoint
-- The old single platform admin flag becomes the owner role, so existing admins keep every right.
UPDATE `user` SET `role` = 'owner' WHERE `role` = 'admin';
