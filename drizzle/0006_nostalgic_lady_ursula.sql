CREATE TABLE "minute_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"display_name_uz" varchar(100),
	"price_uzs" integer NOT NULL,
	"minutes" integer NOT NULL,
	"description" text,
	"description_uz" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minute_packages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "minute_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"lecture_id" uuid,
	"package_id" uuid,
	"type" varchar(30) NOT NULL,
	"minutes" integer NOT NULL,
	"video_duration_seconds" integer,
	"plan_minutes_after" integer,
	"bonus_minutes_after" integer,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_type" varchar(30) NOT NULL,
	"plan_id" uuid,
	"package_id" uuid,
	"amount_uzs" integer NOT NULL,
	"provider" varchar(30) DEFAULT 'payme',
	"provider_transaction_id" varchar(255),
	"provider_response" jsonb,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"display_name_uz" varchar(100),
	"price_uzs" integer DEFAULT 0 NOT NULL,
	"minutes_per_month" integer NOT NULL,
	"description" text,
	"description_uz" text,
	"features" jsonb,
	"features_uz" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_cycle_start" timestamp with time zone NOT NULL,
	"billing_cycle_end" timestamp with time zone NOT NULL,
	"minutes_included" integer NOT NULL,
	"minutes_used" integer DEFAULT 0 NOT NULL,
	"bonus_minutes" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "lectures" ADD COLUMN "minutes_charged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lectures" ADD COLUMN "minutes_refunded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "minute_transactions" ADD CONSTRAINT "minute_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_transactions" ADD CONSTRAINT "minute_transactions_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_transactions" ADD CONSTRAINT "minute_transactions_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_transactions" ADD CONSTRAINT "minute_transactions_package_id_minute_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."minute_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_minute_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."minute_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "minute_packages_name_idx" ON "minute_packages" USING btree ("name");--> statement-breakpoint
CREATE INDEX "minute_packages_active_idx" ON "minute_packages" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "minute_transactions_user_idx" ON "minute_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "minute_transactions_subscription_idx" ON "minute_transactions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "minute_transactions_lecture_idx" ON "minute_transactions" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "minute_transactions_type_idx" ON "minute_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "minute_transactions_created_at_idx" ON "minute_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_provider_tx_idx" ON "payments" USING btree ("provider_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_name_idx" ON "subscription_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "subscription_plans_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_user_idx" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_status_idx" ON "user_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_subscriptions_cycle_end_idx" ON "user_subscriptions" USING btree ("billing_cycle_end");