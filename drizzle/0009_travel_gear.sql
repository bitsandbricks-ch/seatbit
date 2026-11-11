CREATE TABLE `gear_need` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`name` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gear_need_lan_idx` ON `gear_need` (`lan_id`);--> statement-breakpoint
CREATE TABLE `gear_packed` (
	`lan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`item` text NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gear_packed_uq` ON `gear_packed` (`lan_id`,`user_id`,`item`);--> statement-breakpoint
CREATE TABLE `gear_pledge` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`need_id` text,
	`name` text DEFAULT '' NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`need_id`) REFERENCES `gear_need`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gear_pledge_lan_idx` ON `gear_pledge` (`lan_id`);--> statement-breakpoint
CREATE TABLE `travel_post` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`town` text DEFAULT '' NOT NULL,
	`places` integer DEFAULT 1 NOT NULL,
	`when_text` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `travel_post_lan_idx` ON `travel_post` (`lan_id`);--> statement-breakpoint
CREATE TABLE `travel_spot` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `travel_post`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `travel_spot_uq` ON `travel_spot` (`post_id`,`user_id`);