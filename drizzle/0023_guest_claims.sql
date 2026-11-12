CREATE TABLE `guest_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`match` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_claim_guest_user` ON `guest_claim` (`guest_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `guest_claim_clan_idx` ON `guest_claim` (`clan_id`,`status`);--> statement-breakpoint
ALTER TABLE `clan` ADD `guest_claims` text DEFAULT 'approval' NOT NULL;