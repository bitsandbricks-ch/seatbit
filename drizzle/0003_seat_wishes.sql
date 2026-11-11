ALTER TABLE `attendance` ADD `wish_near` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD `wish_avoid` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD `wish_position` text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD `wish_seat` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD `wish_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lan` ADD `seats_published_at` integer;