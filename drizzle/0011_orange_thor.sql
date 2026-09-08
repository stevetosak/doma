ALTER TABLE "shopping_items" ADD COLUMN "sort" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-edited (not drizzle-kit generated): seed a stable initial order per
-- bucket from creation time, so existing lists don't all collapse to sort=0.
WITH ranked AS (
	SELECT id, row_number() OVER (
		PARTITION BY household_id, list_id, category_id ORDER BY created_at
	) - 1 AS rn
	FROM shopping_items
	WHERE is_checked = false
)
UPDATE shopping_items s SET sort = ranked.rn FROM ranked WHERE ranked.id = s.id;