ALTER TYPE "StockMovementType" ADD VALUE 'OPENING_STOCK';

ALTER TABLE "stock_movements"
  ADD COLUMN "opening_stock_id" TEXT,
  ALTER COLUMN "goods_receipt_line_id" DROP NOT NULL;

CREATE TABLE "opening_stocks" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "document_number" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unit_cost_vnd" DECIMAL(20,0) NOT NULL,
  "value_vnd" DECIMAL(20,0) NOT NULL,
  "notes" TEXT,
  "posted_at" TIMESTAMP(3) NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opening_stocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opening_stocks_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "opening_stocks_cost_nonnegative" CHECK ("unit_cost_vnd" >= 0),
  CONSTRAINT "opening_stocks_value_nonnegative" CHECK ("value_vnd" >= 0)
);

CREATE INDEX "opening_stocks_business_id_posted_at_idx" ON "opening_stocks"("business_id", "posted_at");
CREATE UNIQUE INDEX "opening_stocks_business_id_document_number_key" ON "opening_stocks"("business_id", "document_number");
CREATE UNIQUE INDEX "opening_stocks_business_id_idempotency_key_key" ON "opening_stocks"("business_id", "idempotency_key");
CREATE UNIQUE INDEX "opening_stocks_business_id_warehouse_id_variant_id_key" ON "opening_stocks"("business_id", "warehouse_id", "variant_id");
CREATE UNIQUE INDEX "stock_movements_opening_stock_id_key" ON "stock_movements"("opening_stock_id");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_matches_type"
  CHECK (("type" = 'PURCHASE_RECEIPT' AND "goods_receipt_line_id" IS NOT NULL AND "opening_stock_id" IS NULL)
      OR ("type" = 'OPENING_STOCK' AND "opening_stock_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL));

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_opening_stock_id_fkey"
  FOREIGN KEY ("opening_stock_id") REFERENCES "opening_stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_stocks" ADD CONSTRAINT "opening_stocks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
