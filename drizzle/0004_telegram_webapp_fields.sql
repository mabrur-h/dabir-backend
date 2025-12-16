ALTER TABLE "users" ADD COLUMN "telegram_first_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_language_code" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_is_premium" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_photo_url" text;