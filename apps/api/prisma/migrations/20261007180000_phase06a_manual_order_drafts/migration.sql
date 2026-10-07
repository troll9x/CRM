ALTER TABLE "sales_orders"
  ALTER COLUMN "source_quote_id" DROP NOT NULL,
  ALTER COLUMN "source_revision" SET DEFAULT 0;

ALTER TYPE "AdminAlertType" ADD VALUE 'MANUAL_ORDER_CREATED';

CREATE TABLE "order_commands" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_commands_business_id_idempotency_key_key"
  ON "order_commands"("business_id", "idempotency_key");
CREATE INDEX "order_commands_business_id_created_at_idx"
  ON "order_commands"("business_id", "created_at");
ALTER TABLE "order_commands"
  ADD CONSTRAINT "order_commands_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
