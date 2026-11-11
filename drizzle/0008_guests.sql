ALTER TABLE `user` ADD `is_guest` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `guest_clan_id` text REFERENCES clan(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `user` ADD `claim_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_claim_code_unique` ON `user` (`claim_code`);