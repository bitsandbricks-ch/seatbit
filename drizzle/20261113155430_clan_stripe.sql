ALTER TABLE `charge_item` ADD `stripe_payment_id` text;--> statement-breakpoint
ALTER TABLE `clan` ADD `stripe_account_id` text;--> statement-breakpoint
ALTER TABLE `clan` ADD `stripe_charges_enabled` integer DEFAULT false NOT NULL;