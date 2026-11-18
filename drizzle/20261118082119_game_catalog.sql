CREATE TABLE `catalog_game` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`steam_app_id` integer,
	`size_gb` integer,
	`url` text DEFAULT '' NOT NULL,
	`cover` text,
	`min_players` integer,
	`max_players` integer,
	`free` integer,
	`lan` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`steam_fetched_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_game_name_uq` ON `catalog_game` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_game_steam_uq` ON `catalog_game` (`steam_app_id`);--> statement-breakpoint
ALTER TABLE `game` ADD `catalog_id` text REFERENCES catalog_game(id);--> statement-breakpoint
CREATE INDEX `game_catalog_idx` ON `game` (`catalog_id`);