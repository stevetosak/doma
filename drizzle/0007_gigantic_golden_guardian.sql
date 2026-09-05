CREATE TABLE "chore_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"chore_id" uuid NOT NULL,
	"offset_days" integer NOT NULL,
	"hour" integer NOT NULL,
	"minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Hand-edited (not drizzle-kit generated): backfills chore_reminders from
-- M8's reminder_lead_minutes so a chore that already had a reminder
-- configured since M8 shipped doesn't silently lose it. 480 = the old
-- nominal 08:00 anchor in minutes-past-midnight. Must floor (not
-- truncate) the day division — Postgres integer "/" truncates toward
-- zero, which is wrong once the value goes negative.
INSERT INTO "chore_reminders" ("household_id", "chore_id", "offset_days", "hour", "minute")
SELECT
	c."household_id",
	c."id",
	d.offset_days,
	(d.total_minutes - d.offset_days * 1440) / 60,
	(d.total_minutes - d.offset_days * 1440) % 60
FROM "chores" c
CROSS JOIN LATERAL (
	SELECT
		(480 - c."reminder_lead_minutes") AS total_minutes,
		floor((480 - c."reminder_lead_minutes")::numeric / 1440)::int AS offset_days
) d
WHERE c."reminder_lead_minutes" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "existence_check_table" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "existence_check_id" text;--> statement-breakpoint
ALTER TABLE "chore_reminders" ADD CONSTRAINT "chore_reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_reminders" ADD CONSTRAINT "chore_reminders_chore_id_chores_id_fk" FOREIGN KEY ("chore_id") REFERENCES "public"."chores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chores" DROP COLUMN "reminder_lead_minutes";