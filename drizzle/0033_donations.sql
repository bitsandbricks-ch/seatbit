CREATE TABLE `donation` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_session_id` text NOT NULL,
	`payment_intent_id` text,
	`user_id` text,
	`clan_id` text,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`show_badge` integer DEFAULT true NOT NULL,
	`refunded_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donation_stripe_session_id_unique` ON `donation` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `donation_user_idx` ON `donation` (`user_id`);--> statement-breakpoint
CREATE INDEX `donation_clan_idx` ON `donation` (`clan_id`);