CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Hand-edited, not drizzle-kit generated. Backfills items from the
-- chores/shopping_items rows that already exist, reusing their ids
-- exactly so nothing that already stores a chore/item id anywhere else
-- (occurrences, notifications, the outbox) needs to change.
INSERT INTO "items" ("id", "household_id", "item_type", "created_at")
SELECT "id", "household_id", 'chore', "created_at" FROM "chores";
--> statement-breakpoint
INSERT INTO "items" ("id", "household_id", "item_type", "created_at")
SELECT "id", "household_id", 'shopping_item', "created_at" FROM "shopping_items";
--> statement-breakpoint
ALTER TABLE "chores" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "shopping_items" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "chores" ADD CONSTRAINT "chores_id_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_id_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"offset_days" integer,
	"hour" integer,
	"minute" integer,
	"fire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_mode_check" CHECK (("reminders"."offset_days" is not null and "reminders"."hour" is not null and "reminders"."minute" is not null and "reminders"."fire_at" is null)
       or ("reminders"."offset_days" is null and "reminders"."hour" is null and "reminders"."minute" is null and "reminders"."fire_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Hand-edited: backfill reminders from the existing chore_reminders rows
-- before that table is dropped below. Reuses each row's id exactly, since
-- any not-yet-fired pg-boss job already carries that id as its
-- existenceCheck.id (src/core/notify/existence.ts) and must still resolve
-- correctly against the new table.
INSERT INTO "reminders" ("id", "household_id", "item_id", "offset_days", "hour", "minute", "created_at")
SELECT "id", "household_id", "chore_id", "offset_days", "hour", "minute", "created_at" FROM "chore_reminders";
--> statement-breakpoint
DROP TABLE "chore_reminders";
