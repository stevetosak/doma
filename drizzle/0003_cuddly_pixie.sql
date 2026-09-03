CREATE TYPE "public"."chore_assignment_mode" AS ENUM('fixed', 'rotating');--> statement-breakpoint
CREATE TYPE "public"."chore_occurrence_status" AS ENUM('pending', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."chore_recurrence_kind" AS ENUM('once', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "chore_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"chore_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"assignee_user_id" uuid,
	"status" "chore_occurrence_status" DEFAULT 'pending' NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"recurrence_kind" "chore_recurrence_kind" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"weekdays" integer[],
	"day_of_month" integer,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"assignment_mode" "chore_assignment_mode" NOT NULL,
	"assignee_user_id" uuid,
	"rotation" uuid[],
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chore_occurrences" ADD CONSTRAINT "chore_occurrences_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_occurrences" ADD CONSTRAINT "chore_occurrences_chore_id_chores_id_fk" FOREIGN KEY ("chore_id") REFERENCES "public"."chores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_occurrences" ADD CONSTRAINT "chore_occurrences_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chore_occurrences" ADD CONSTRAINT "chore_occurrences_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chores" ADD CONSTRAINT "chores_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chores" ADD CONSTRAINT "chores_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chore_occurrences_chore_due_on_key" ON "chore_occurrences" USING btree ("chore_id","due_on");