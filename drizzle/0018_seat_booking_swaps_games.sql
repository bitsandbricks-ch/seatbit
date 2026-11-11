CREATE TABLE `game` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`name` text NOT NULL,
	`size_gb` integer,
	`url` text DEFAULT '' NOT NULL,
	`added_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `game_lan_idx` ON `game` (`lan_id`);--> statement-breakpoint
CREATE TABLE `game_vote` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` integer DEFAULT false NOT NULL,
	`installed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_vote_uq` ON `game_vote` (`game_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `seat_swap` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seat_swap_lan_idx` ON `seat_swap` (`lan_id`);--> statement-breakpoint
ALTER TABLE `attendance` ADD `seat_booked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `external_plan_url` text DEFAULT '' NOT NULL;