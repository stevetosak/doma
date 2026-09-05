ALTER TABLE "notifications" RENAME COLUMN "existence_check_id" TO "reminder_id";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "reminder_id" SET DATA TYPE uuid USING "reminder_id"::uuid;--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "existence_check_table";
