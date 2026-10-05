ALTER TYPE "StockMovementType" ADD VALUE 'STOCK_ADJUSTMENT';
CREATE TYPE "StockAdjustmentStatus" AS ENUM ('POSTED');

CREATE TABLE "stock_adjustments" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "sku_snapshot" TEXT NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "variant_name_snapshot" TEXT NOT NULL,
  "unit_code_snapshot" TEXT NOT NULL,
  "unit_name_snapshot" TEXT NOT NULL,
  "document_number" TEXT NOT NULL,
  "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'POSTED',
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "system_quantity" DECIMAL(20,6) NOT NULL,
  "counted_quantity" DECIMAL(20,6) NOT NULL,
  "quantity_delta" DECIMAL(20,6) NOT NULL,
  "unit_cost_vnd" DECIMAL(20,0),
  "value_delta_vnd" DECIMAL(20,0) NOT NULL,
  "average_cost_after_vnd" DECIMAL(20,6) NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "posted_at" TIMESTAMP(3) NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_counted_nonnegative" CHECK ("counted_quantity" >= 0),
  CONSTRAINT "stock_adjustments_system_nonnegative" CHECK ("system_quantity" >= 0),
  CONSTRAINT "stock_adjustments_nonzero_delta" CHECK ("quantity_delta" <> 0),
  CONSTRAINT "stock_adjustments_delta_matches_count" CHECK ("counted_quantity" - "system_quantity" = "quantity_delta"),
  CONSTRAINT "stock_adjustments_value_delta_sign" CHECK (("quantity_delta" > 0 AND "value_delta_vnd" >= 0) OR ("quantity_delta" < 0 AND "value_delta_vnd" <= 0)),
  CONSTRAINT "stock_adjustments_unit_cost_nonnegative" CHECK ("unit_cost_vnd" IS NULL OR "unit_cost_vnd" >= 0),
  CONSTRAINT "stock_adjustments_average_cost_nonnegative" CHECK ("average_cost_after_vnd" >= 0),
  CONSTRAINT "stock_adjustments_reason_nonempty" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "stock_adjustments_status_posted" CHECK ("status" = 'POSTED')
);

CREATE INDEX "stock_adjustments_business_id_posted_at_idx" ON "stock_adjustments"("business_id", "posted_at");
CREATE INDEX "stock_adjustments_business_id_warehouse_id_variant_id_posted_at_idx" ON "stock_adjustments"("business_id", "warehouse_id", "variant_id", "posted_at");
CREATE UNIQUE INDEX "stock_adjustments_business_id_document_number_key" ON "stock_adjustments"("business_id", "document_number");
CREATE UNIQUE INDEX "stock_adjustments_business_id_idempotency_key_key" ON "stock_adjustments"("business_id", "idempotency_key");

ALTER TABLE "stock_movements" ADD COLUMN "stock_adjustment_id" TEXT;
CREATE UNIQUE INDEX "stock_movements_stock_adjustment_id_key" ON "stock_movements"("stock_adjustment_id");
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_quantity_positive";
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_value_nonnegative";
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_source_matches_type";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("quantity_delta" <> 0),
  ADD CONSTRAINT "stock_movements_value_delta_sign" CHECK (("quantity_delta" > 0 AND "value_delta_vnd" >= 0) OR ("quantity_delta" < 0 AND "value_delta_vnd" <= 0)),
  ADD CONSTRAINT "stock_movements_source_matches_type" CHECK (
    ("type" = 'PURCHASE_RECEIPT' AND "goods_receipt_line_id" IS NOT NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL)
    OR ("type" = 'OPENING_STOCK' AND "opening_stock_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "stock_adjustment_id" IS NULL)
    OR ("type" = 'STOCK_ADJUSTMENT' AND "stock_adjustment_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL)
  );

ALTER TABLE "stock_adjustments"
  ADD CONSTRAINT "stock_adjustments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_adjustments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_adjustment_id_fkey"
  FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
