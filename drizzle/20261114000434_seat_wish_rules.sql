ALTER TABLE `attendance` ADD `wish_rules` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Existing wishes become ranked rules in the order the form showed them: near, not next to, position, seat.
UPDATE `attendance` SET `wish_rules` = (
  SELECT json_group_array(json(r) ORDER BY g, k) FROM (
    SELECT json_object('kind', 'near', 'userId', n.value) AS r, 0 AS g, n.key AS k FROM json_each(`attendance`.`wish_near`) AS n
    UNION ALL
    SELECT json_object('kind', 'avoid', 'userId', a.value), 1, a.key FROM json_each(`attendance`.`wish_avoid`) AS a
      WHERE a.value NOT IN (SELECT value FROM json_each(`attendance`.`wish_near`))
    UNION ALL
    SELECT json_object('kind', `attendance`.`wish_position`), 2, 0 WHERE `attendance`.`wish_position` IN ('edge', 'middle')
    UNION ALL
    SELECT json_object('kind', 'seat', 'seat', upper(`attendance`.`wish_seat`)), 3, 0 WHERE `attendance`.`wish_seat` != ''
  )
) WHERE `wish_near` != '[]' OR `wish_avoid` != '[]' OR `wish_position` != 'any' OR `wish_seat` != '';--> statement-breakpoint
ALTER TABLE `attendance` DROP COLUMN `wish_near`;--> statement-breakpoint
ALTER TABLE `attendance` DROP COLUMN `wish_avoid`;--> statement-breakpoint
ALTER TABLE `attendance` DROP COLUMN `wish_position`;--> statement-breakpoint
ALTER TABLE `attendance` DROP COLUMN `wish_seat`;