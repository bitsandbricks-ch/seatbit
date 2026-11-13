ALTER TABLE `attendance` ADD `waitlisted_at` integer;--> statement-breakpoint
ALTER TABLE `lan` ADD `waitlist_auto` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Keep the current line: people already waiting keep the order they had (by first answer).
UPDATE `attendance` SET `waitlisted_at` = `created_at` WHERE `status` = 'waitlist';
