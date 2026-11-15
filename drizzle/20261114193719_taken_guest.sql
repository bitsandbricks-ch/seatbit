CREATE TABLE `taken_guest` (
	`guest_id` text PRIMARY KEY NOT NULL,
	`claim_code` text,
	`user_id` text NOT NULL,
	`guest_name` text DEFAULT '' NOT NULL,
	`clan_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taken_guest_claim_code_unique` ON `taken_guest` (`claim_code`);--> statement-breakpoint
CREATE INDEX `taken_guest_user_idx` ON `taken_guest` (`user_id`);