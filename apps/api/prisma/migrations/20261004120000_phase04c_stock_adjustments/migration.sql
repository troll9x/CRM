ALTER TYPE "StockMovementType" ADD VALUE 'STOCK_ADJUSTMENT';

ALTER TABLE "stock_movements"
  ADD COLUMN "stock_adjustment_id" TEXT;

CREATE TABLE "stock_adjustments" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "document_number" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "sku_snapshot" TEXT NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "variant_name_snapshot" TEXT NOT NULL,
  "unit_code_snapshot" TEXT NOT NULL,
  "unit_name_snapshot" TEXT NOT NULL,
  "system_quantity" DECIMAL(20,6) NOT NULL,
  "counted_quantity" DECIMAL(20,6) NOT NULL,
  "quantity_delta" DECIMAL(20,6) NOT NULL,
  "valuation_cost_vnd" DECIMAL(20,6) NOT NULL,
  "value_delta_vnd" DECIMAL(20,0) NOT NULL,
  "reason_code" TEXT NOT NULL,
  "notes" TEXT,
  "posted_at" TIMESTAMP(3) NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_quantities_valid" CHECK (
    "system_quantity" >= 0 AND "counted_quantity" >= 0 AND
    "quantity_delta" = "counted_quantity" - "system_quantity"
  ),
  CONSTRAINT "stock_adjustments_cost_nonnegative" CHECK ("valuation_cost_vnd" >= 0),
  CONSTRAINT "stock_adjustments_reason_valid" CHECK (
    "reason_code" IN ('COUNT_VARIANCE', 'DAMAGE', 'LOSS', 'FOUND', 'OTHER')
  ),
  CONSTRAINT "stock_adjustments_reason_matches_delta" CHECK (
    ("reason_code" NOT IN ('DAMAGE', 'LOSS') OR "quantity_delta" < 0) AND
    ("reason_code" <> 'FOUND' OR "quantity_delta" > 0)
  )
);

CREATE INDEX "stock_adjustments_business_id_posted_at_idx"
  ON "stock_adjustments"("business_id", "posted_at");
CREATE INDEX "stock_adjustments_business_id_warehouse_id_posted_at_idx"
  ON "stock_adjustments"("business_id", "warehouse_id", "posted_at");
CREATE UNIQUE INDEX "stock_adjustments_business_id_document_number_key"
  ON "stock_adjustments"("business_id", "document_number");
CREATE UNIQUE INDEX "stock_adjustments_business_id_idempotency_key_key"
  ON "stock_adjustments"("business_id", "idempotency_key");
CREATE UNIQUE INDEX "stock_movements_stock_adjustment_id_key"
  ON "stock_movements"("stock_adjustment_id");

ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_source_matches_type";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_matches_type"
  CHECK (
    ("type" = 'PURCHASE_RECEIPT' AND "goods_receipt_line_id" IS NOT NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL)
    OR ("type" = 'OPENING_STOCK' AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NOT NULL AND "stock_adjustment_id" IS NULL)
    OR ("type" = 'STOCK_ADJUSTMENT' AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NOT NULL AND "quantity_delta" <> 0)
  );

ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_adjustment_id_fkey"
  FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
