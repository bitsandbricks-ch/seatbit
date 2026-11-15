-- Interest check answers become normal attendance answers (yes -> going, maybe -> maybe, no -> declined).
INSERT OR IGNORE INTO `attendance` (`id`, `lan_id`, `user_id`, `status`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `lan_id`, `user_id`,
  CASE `answer` WHEN 'yes' THEN 'going' WHEN 'no' THEN 'declined' ELSE 'maybe' END,
  `created_at`, `created_at`
FROM `lan_interest`
WHERE `lan_id` IN (SELECT `id` FROM `lan` WHERE `interest_check` = 1);--> statement-breakpoint
DROP TABLE `lan_interest`;--> statement-breakpoint
ALTER TABLE `lan` ADD `signup_opens_at` integer;
