-- Add account_id to users table (short numeric ID for payment providers)
ALTER TABLE "users" ADD COLUMN "account_id" SERIAL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_account_id_idx" ON "users" USING btree ("account_id");--> statement-breakpoint

-- Create payme_transactions table to track Payme-specific transaction states
CREATE TABLE "payme_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
  "payme_id" varchar(255) NOT NULL UNIQUE,
  "time" bigint NOT NULL,
  "amount" integer NOT NULL,
  "state" integer NOT NULL DEFAULT 1,
  "reason" integer,
  "create_time" bigint,
  "perform_time" bigint,
  "cancel_time" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "payme_transactions_payment_idx" ON "payme_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payme_transactions_state_idx" ON "payme_transactions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "payme_transactions_payme_id_idx" ON "payme_transactions" USING btree ("payme_id");
