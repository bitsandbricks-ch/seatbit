CREATE TABLE `cost_expense` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`title` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_by` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paid_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cost_expense_lan_idx` ON `cost_expense` (`lan_id`);--> statement-breakpoint
CREATE TABLE `cost_settlement` (
	`id` text PRIMARY KEY NOT NULL,
	`lan_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cost_settlement_lan_idx` ON `cost_settlement` (`lan_id`);--> statement-breakpoint
CREATE TABLE `cost_share` (
	`expense_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `cost_expense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_share_uq` ON `cost_share` (`expense_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `cost_share_user_idx` ON `cost_share` (`user_id`);