ALTER TABLE `lan` ADD `profile_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lan_type` ADD `profile_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `socials` text DEFAULT '{}' NOT NULL;