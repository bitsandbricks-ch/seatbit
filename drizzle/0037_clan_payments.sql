CREATE TABLE `charge` (
	`id` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`lan_id` text,
	`kind` text DEFAULT 'other' NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'CHF' NOT NULL,
	`due_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lan_id`) REFERENCES `lan`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `charge_clan_idx` ON `charge` (`clan_id`);--> statement-breakpoint
CREATE INDEX `charge_lan_idx` ON `charge` (`lan_id`);--> statement-breakpoint
CREATE TABLE `charge_item` (
	`id` text PRIMARY KEY NOT NULL,
	`charge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`paid_via` text,
	`paid_at` integer,
	`marked_by` text,
	`reminded_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`charge_id`) REFERENCES `charge`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `charge_item_uq` ON `charge_item` (`charge_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `charge_item_user_idx` ON `charge_item` (`user_id`);--> statement-breakpoint
ALTER TABLE `clan` ADD `payments_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clan` ADD `payment_info` text DEFAULT '' NOT NULL;