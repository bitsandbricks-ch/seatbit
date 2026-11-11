CREATE TABLE `lan_orga` (
	`lan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lan_orga_uq` ON `lan_orga` (`lan_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `attendance` ADD `ticket_bought` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `website_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `ticket_url` text DEFAULT '' NOT NULL;