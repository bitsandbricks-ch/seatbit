CREATE TABLE `packing_item` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`packed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `packing_item_lan_user_idx` ON `packing_item` (`lan_id`,`user_id`);--> statement-breakpoint
DROP TABLE `gear_pledge`;--> statement-breakpoint
DROP TABLE `gear_need`;