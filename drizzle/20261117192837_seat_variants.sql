CREATE TABLE `seat_variant` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`name` text NOT NULL,
	`seats` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `seat_variant_lan_idx` ON `seat_variant` (`lan_id`);