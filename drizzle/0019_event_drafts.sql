ALTER TABLE `lan` ADD `published_at` integer;--> statement-breakpoint
-- Events that already exist stay published; new ones start as drafts.
UPDATE `lan` SET `published_at` = `created_at`;
