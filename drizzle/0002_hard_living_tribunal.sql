CREATE TABLE "household_modules" (
	"household_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "household_modules_household_id_module_id_pk" PRIMARY KEY("household_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "household_modules" ADD CONSTRAINT "household_modules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;