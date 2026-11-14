ALTER TABLE `lan` ADD `seat_near_range` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
-- Simpler seat wishes: near/avoid lose their distance. "Right next to" (near within 1) becomes "next"
-- (only the first one; later ones become "near"), every "away from" becomes "not right next to",
-- at most four "near" stay, and "not right next to" goes after the ranked wishes.
UPDATE `attendance` SET `wish_rules` = (
  SELECT json_group_array(json(x.r) ORDER BY x.g, x.k) FROM (
    SELECT
      CASE
        WHEN w.kind = 'avoid' THEN json_object('kind', 'avoid', 'userId', w.uid)
        WHEN w.kind = 'near' AND w.within = 1 AND w.nexts = 1 THEN json_object('kind', 'next', 'userId', w.uid)
        WHEN w.kind = 'near' THEN json_object('kind', 'near', 'userId', w.uid)
        ELSE w.value
      END AS r,
      (w.kind = 'avoid') AS g,
      w.k AS k,
      w.kind = 'near' AND NOT (IFNULL(w.within, 0) = 1 AND w.nexts = 1) AS isNear,
      SUM(w.kind = 'near' AND NOT (IFNULL(w.within, 0) = 1 AND w.nexts = 1)) OVER (ORDER BY w.k) AS nears
    FROM (
      SELECT
        j.value AS value,
        j.key AS k,
        json_extract(j.value, '$.kind') AS kind,
        json_extract(j.value, '$.userId') AS uid,
        json_extract(j.value, '$.within') AS within,
        SUM(json_extract(j.value, '$.kind') = 'near' AND json_extract(j.value, '$.within') = 1) OVER (ORDER BY j.key) AS nexts
      FROM json_each(`attendance`.`wish_rules`) AS j
    ) AS w
  ) AS x WHERE NOT x.isNear OR x.nears <= 4
) WHERE `wish_rules` != '[]';
