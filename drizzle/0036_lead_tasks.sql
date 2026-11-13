CREATE TABLE `lan_task` (
	`lan_id` text NOT NULL,
	`task_id` text NOT NULL,
	`assignee_id` text,
	`done_at` integer,
	`done_by_id` text,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `lead_task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`done_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lan_task_uq` ON `lan_task` (`lan_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `lead_contact` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`discord` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `lan_type`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_contact_type_idx` ON `lead_contact` (`type_id`);--> statement-breakpoint
CREATE TABLE `lead_task` (
	`id` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`type_id` text,
	`lan_id` text,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`after` text DEFAULT '[]' NOT NULL,
	`due_days` integer,
	`contact_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `lan_type`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `lead_contact`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lead_task_clan_idx` ON `lead_task` (`clan_id`);--> statement-breakpoint
ALTER TABLE `clan` ADD `lead_tasks_seeded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lan_type` ADD `clan_lead_tasks` integer DEFAULT true NOT NULL;