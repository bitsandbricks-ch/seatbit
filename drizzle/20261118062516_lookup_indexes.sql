CREATE INDEX `attendance_user_idx` ON `attendance` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target_user_id`);--> statement-breakpoint
CREATE INDEX `lan_clan_ends_idx` ON `lan` (`clan_id`,`ends_at`);--> statement-breakpoint
CREATE INDEX `lan_orga_user_idx` ON `lan_orga` (`user_id`);--> statement-breakpoint
CREATE INDEX `seat_user_idx` ON `seat` (`user_id`);