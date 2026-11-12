CREATE TABLE `food_item` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`user_id` text NOT NULL,
	`item` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`price_cents` integer,
	`note` text DEFAULT '' NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `food_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `food_item_order_idx` ON `food_item` (`order_id`);--> statement-breakpoint
CREATE TABLE `food_order` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`title` text NOT NULL,
	`shop` text DEFAULT '' NOT NULL,
	`menu_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`closes_at` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `food_order_lan_idx` ON `food_order` (`lan_id`);