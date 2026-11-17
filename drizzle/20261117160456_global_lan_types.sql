CREATE TABLE `clan_lan_type` (
	`clan_id` text NOT NULL,
	`type_id` text NOT NULL,
	`capacity` integer,
	`reminder_days` integer DEFAULT 3 NOT NULL,
	`seat_spec` text DEFAULT '' NOT NULL,
	`answer_days_before` integer DEFAULT 30,
	`discord_mode` text DEFAULT 'channel' NOT NULL,
	`clan_lead_tasks` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`clan_id`, `type_id`),
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `lan_type`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clan_lan_type_type_idx` ON `clan_lan_type` (`type_id`);--> statement-breakpoint
-- drizzle-kit leaves out ON DELETE here; added by hand so deleting a clan still removes its contacts.
ALTER TABLE `lead_contact` ADD `clan_id` text REFERENCES clan(id) ON DELETE cascade;--> statement-breakpoint
-- LAN types become global. Types with the same name (case and spaces ignored) merge into the oldest one.
CREATE TABLE `__type_merge` (`old_id` text PRIMARY KEY NOT NULL, `new_id` text NOT NULL);--> statement-breakpoint
INSERT INTO `__type_merge` (`old_id`, `new_id`)
SELECT t.`id`, (
  SELECT k.`id` FROM `lan_type` k WHERE lower(trim(k.`name`)) = lower(trim(t.`name`)) ORDER BY k.`created_at`, k.`id` LIMIT 1
) FROM `lan_type` t;--> statement-breakpoint
-- The kept type takes over details only a duplicate had.
UPDATE `lan_type` SET
  `description` = coalesce(nullif(`description`, ''), (SELECT d.`description` FROM `lan_type` d JOIN `__type_merge` m ON m.`old_id` = d.`id` WHERE m.`new_id` = `lan_type`.`id` AND d.`description` <> '' ORDER BY d.`created_at` LIMIT 1), ''),
  `location` = coalesce(nullif(`location`, ''), (SELECT d.`location` FROM `lan_type` d JOIN `__type_merge` m ON m.`old_id` = d.`id` WHERE m.`new_id` = `lan_type`.`id` AND d.`location` <> '' ORDER BY d.`created_at` LIMIT 1), ''),
  `website_url` = coalesce(nullif(`website_url`, ''), (SELECT d.`website_url` FROM `lan_type` d JOIN `__type_merge` m ON m.`old_id` = d.`id` WHERE m.`new_id` = `lan_type`.`id` AND d.`website_url` <> '' ORDER BY d.`created_at` LIMIT 1), ''),
  `ticket_url` = coalesce(nullif(`ticket_url`, ''), (SELECT d.`ticket_url` FROM `lan_type` d JOIN `__type_merge` m ON m.`old_id` = d.`id` WHERE m.`new_id` = `lan_type`.`id` AND d.`ticket_url` <> '' ORDER BY d.`created_at` LIMIT 1), ''),
  `price` = coalesce(nullif(`price`, ''), (SELECT d.`price` FROM `lan_type` d JOIN `__type_merge` m ON m.`old_id` = d.`id` WHERE m.`new_id` = `lan_type`.`id` AND d.`price` <> '' ORDER BY d.`created_at` LIMIT 1), ''),
  `profile_url` = coalesce(nullif(`profile_url`, ''), (SELECT d.`profile_url` FROM `lan_type` d JOIN `__type_merge` m ON m.`old_id` = d.`id` WHERE m.`new_id` = `lan_type`.`id` AND d.`profile_url` <> '' ORDER BY d.`created_at` LIMIT 1), '')
WHERE `id` IN (SELECT `new_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
-- Each clan keeps its own defaults (seats, spots, reminders, Discord, to-dos) for the types it had.
INSERT OR IGNORE INTO `clan_lan_type` (`clan_id`, `type_id`, `capacity`, `reminder_days`, `seat_spec`, `answer_days_before`, `discord_mode`, `clan_lead_tasks`, `created_at`)
SELECT t.`clan_id`, m.`new_id`, t.`capacity`, t.`reminder_days`, t.`seat_spec`, t.`answer_days_before`, t.`discord_mode`, t.`clan_lead_tasks`, t.`created_at`
FROM `lan_type` t JOIN `__type_merge` m ON m.`old_id` = t.`id`
WHERE t.`clan_id` IS NOT NULL ORDER BY t.`created_at`;--> statement-breakpoint
-- Clans with events of a type they didn't own (types from before clans) get it on their list too.
INSERT OR IGNORE INTO `clan_lan_type` (`clan_id`, `type_id`, `capacity`, `reminder_days`, `seat_spec`, `answer_days_before`, `discord_mode`, `clan_lead_tasks`)
SELECT DISTINCT l.`clan_id`, m.`new_id`, t.`capacity`, t.`reminder_days`, t.`seat_spec`, t.`answer_days_before`, t.`discord_mode`, t.`clan_lead_tasks`
FROM `lan` l JOIN `lan_type` t ON t.`id` = l.`type_id` JOIN `__type_merge` m ON m.`old_id` = t.`id`
WHERE l.`clan_id` IS NOT NULL;--> statement-breakpoint
-- Contacts belonged to the type's clan.
UPDATE `lead_contact` SET `clan_id` = (SELECT t.`clan_id` FROM `lan_type` t WHERE t.`id` = `lead_contact`.`type_id`);--> statement-breakpoint
DELETE FROM `lead_contact` WHERE `clan_id` IS NULL;--> statement-breakpoint
-- A member with a nick or LAN ID for two merged types keeps the newest one.
DELETE FROM `nickname` WHERE `type_id` IS NOT NULL AND `lan_id` IS NULL AND EXISTS (
  SELECT 1 FROM `nickname` o JOIN `__type_merge` mo ON mo.`old_id` = o.`type_id` JOIN `__type_merge` mn ON mn.`old_id` = `nickname`.`type_id`
  WHERE o.`user_id` = `nickname`.`user_id` AND o.`lan_id` IS NULL AND o.`id` <> `nickname`.`id` AND mo.`new_id` = mn.`new_id`
    AND (o.`created_at` > `nickname`.`created_at` OR (o.`created_at` = `nickname`.`created_at` AND o.`id` > `nickname`.`id`))
);--> statement-breakpoint
DELETE FROM `lan_account` WHERE `type_id` IS NOT NULL AND `lan_id` IS NULL AND EXISTS (
  SELECT 1 FROM `lan_account` o JOIN `__type_merge` mo ON mo.`old_id` = o.`type_id` JOIN `__type_merge` mn ON mn.`old_id` = `lan_account`.`type_id`
  WHERE o.`user_id` = `lan_account`.`user_id` AND o.`lan_id` IS NULL AND o.`id` <> `lan_account`.`id` AND mo.`new_id` = mn.`new_id`
    AND (o.`created_at` > `lan_account`.`created_at` OR (o.`created_at` = `lan_account`.`created_at` AND o.`id` > `lan_account`.`id`))
);--> statement-breakpoint
UPDATE `lan` SET `type_id` = (SELECT `new_id` FROM `__type_merge` WHERE `old_id` = `lan`.`type_id`) WHERE `type_id` IN (SELECT `old_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
UPDATE `nickname` SET `type_id` = (SELECT `new_id` FROM `__type_merge` WHERE `old_id` = `nickname`.`type_id`) WHERE `type_id` IN (SELECT `old_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
UPDATE `lan_account` SET `type_id` = (SELECT `new_id` FROM `__type_merge` WHERE `old_id` = `lan_account`.`type_id`) WHERE `type_id` IN (SELECT `old_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
UPDATE `lead_contact` SET `type_id` = (SELECT `new_id` FROM `__type_merge` WHERE `old_id` = `lead_contact`.`type_id`) WHERE `type_id` IN (SELECT `old_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
UPDATE `lead_task` SET `type_id` = (SELECT `new_id` FROM `__type_merge` WHERE `old_id` = `lead_task`.`type_id`) WHERE `type_id` IN (SELECT `old_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
DELETE FROM `lan_type` WHERE `id` IN (SELECT `old_id` FROM `__type_merge` WHERE `old_id` <> `new_id`);--> statement-breakpoint
DROP TABLE `__type_merge`;--> statement-breakpoint
UPDATE `lan_type` SET `clan_id` = NULL;--> statement-breakpoint
ALTER TABLE `lan_type` DROP COLUMN `capacity`;--> statement-breakpoint
ALTER TABLE `lan_type` DROP COLUMN `reminder_days`;--> statement-breakpoint
ALTER TABLE `lan_type` DROP COLUMN `seat_spec`;--> statement-breakpoint
ALTER TABLE `lan_type` DROP COLUMN `answer_days_before`;--> statement-breakpoint
ALTER TABLE `lan_type` DROP COLUMN `discord_mode`;--> statement-breakpoint
ALTER TABLE `lan_type` DROP COLUMN `clan_lead_tasks`;