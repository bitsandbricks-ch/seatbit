CREATE TABLE `user_activity` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_activity_user_day_idx` ON `user_activity` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `user_activity_day_idx` ON `user_activity` (`day`);