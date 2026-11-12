CREATE TABLE `billing_event` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clan` ADD `supporter_until` integer;--> statement-breakpoint
ALTER TABLE `clan` ADD `supporter_plan` text;--> statement-breakpoint
ALTER TABLE `clan` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `clan` ADD `stripe_subscription_id` text;