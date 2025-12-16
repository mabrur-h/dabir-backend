CREATE TABLE "lecture_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lecture_id" uuid NOT NULL,
	"slug" varchar(255) NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"show_transcription" boolean DEFAULT true NOT NULL,
	"show_summary" boolean DEFAULT true NOT NULL,
	"show_key_points" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecture_shares_lecture_id_unique" UNIQUE("lecture_id"),
	CONSTRAINT "lecture_shares_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "lecture_shares" ADD CONSTRAINT "lecture_shares_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lecture_shares_slug_idx" ON "lecture_shares" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "lecture_shares_lecture_idx" ON "lecture_shares" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "lecture_shares_public_idx" ON "lecture_shares" USING btree ("is_public");