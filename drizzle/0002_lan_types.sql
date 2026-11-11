CREATE TABLE `lan_type` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`ticket_url` text DEFAULT '' NOT NULL,
	`price` text DEFAULT '' NOT NULL,
	`capacity` integer,
	`reminder_days` integer DEFAULT 3 NOT NULL,
	`seat_spec` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `lan` ADD `type_id` text REFERENCES lan_type(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `nickname` ADD `type_id` text REFERENCES lan_type(id) ON DELETE cascade;