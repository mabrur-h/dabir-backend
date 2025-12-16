ALTER TABLE "lectures" ADD COLUMN "content_hash" varchar(32);--> statement-breakpoint
CREATE INDEX "lectures_content_hash_idx" ON "lectures" USING btree ("content_hash");