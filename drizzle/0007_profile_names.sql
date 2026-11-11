ALTER TABLE `user` ADD `first_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `last_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `user` SET `first_name` = CASE WHEN instr(trim(`name`), ' ') > 0 THEN substr(trim(`name`), 1, instr(trim(`name`), ' ') - 1) ELSE trim(`name`) END, `last_name` = CASE WHEN instr(trim(`name`), ' ') > 0 THEN trim(substr(trim(`name`), instr(trim(`name`), ' ') + 1)) ELSE '' END;
