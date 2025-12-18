CREATE TABLE "payme_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"payme_id" varchar(255) NOT NULL,
	"time" bigint NOT NULL,
	"amount" integer NOT NULL,
	"state" integer DEFAULT 1 NOT NULL,
	"reason" integer,
	"create_time" bigint,
	"perform_time" bigint,
	"cancel_time" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payme_transactions_payme_id_unique" UNIQUE("payme_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "payme_transactions" ADD CONSTRAINT "payme_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payme_transactions_payment_idx" ON "payme_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payme_transactions_state_idx" ON "payme_transactions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "payme_transactions_payme_id_idx" ON "payme_transactions" USING btree ("payme_id");--> statement-breakpoint
CREATE INDEX "payme_transactions_time_idx" ON "payme_transactions" USING btree ("time");--> statement-breakpoint
CREATE UNIQUE INDEX "users_account_id_idx" ON "users" USING btree ("account_id");