ALTER TABLE "lectures" ADD COLUMN "summarization_type" varchar(20) DEFAULT 'lecture' NOT NULL;--> statement-breakpoint
ALTER TABLE "summaries" ADD COLUMN "summarization_type" varchar(20) DEFAULT 'lecture' NOT NULL;--> statement-breakpoint
ALTER TABLE "summaries" ADD COLUMN "custdev_data" jsonb;