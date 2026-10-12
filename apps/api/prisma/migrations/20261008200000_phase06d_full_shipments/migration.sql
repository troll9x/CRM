ALTER TYPE "StockMovementType" ADD VALUE 'SALE_SHIPMENT';
CREATE TYPE "ShipmentStatus" AS ENUM ('IN_TRANSIT', 'DELIVERED');

ALTER TABLE "stock_movements"
    ADD COLUMN "shipment_line_id" TEXT;
ALTER TABLE "stock_movements"
    DROP CONSTRAINT "stock_movements_source_matches_type",
    ADD CONSTRAINT "stock_movements_source_matches_type" CHECK (
      ("type" = 'PURCHASE_RECEIPT' AND "goods_receipt_line_id" IS NOT NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL AND "shipment_line_id" IS NULL)
      OR ("type" = 'OPENING_STOCK' AND "opening_stock_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "stock_adjustment_id" IS NULL AND "shipment_line_id" IS NULL)
      OR ("type" = 'STOCK_ADJUSTMENT' AND "stock_adjustment_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL AND "shipment_line_id" IS NULL)
      OR ("type" = 'SALE_SHIPMENT' AND "shipment_line_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL)
    );
CREATE UNIQUE INDEX "stock_movements_shipment_line_id_key"
    ON "stock_movements"("shipment_line_id");

CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "shipment_code" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "shipped_by_id" TEXT NOT NULL,
    "shipped_at" TIMESTAMP(3) NOT NULL,
    "delivered_by_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "recognized_revenue_vnd" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipments_recognized_revenue_vnd_check" CHECK ("recognized_revenue_vnd" >= 0),
    CONSTRAINT "shipments_delivered_status_check" CHECK (
      ("status" = 'IN_TRANSIT' AND "delivered_at" IS NULL AND "delivered_by_id" IS NULL AND "recognized_revenue_vnd" = 0)
      OR ("status" = 'DELIVERED' AND "delivered_at" IS NOT NULL AND "delivered_by_id" IS NOT NULL)
    )
);
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");
CREATE UNIQUE INDEX "shipments_business_id_shipment_code_key"
    ON "shipments"("business_id", "shipment_code");
CREATE INDEX "shipments_business_id_status_shipped_at_idx"
    ON "shipments"("business_id", "status", "shipped_at");
CREATE INDEX "shipments_business_id_delivered_at_idx"
    ON "shipments"("business_id", "delivered_at");
ALTER TABLE "shipments"
    ADD CONSTRAINT "shipments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "shipments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "shipments_shipped_by_id_fkey" FOREIGN KEY ("shipped_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "shipments_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "shipment_lines" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT NOT NULL,
    "unit_code_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "base_quantity" DECIMAL(20,6) NOT NULL,
    "unit_cost_vnd" DECIMAL(20,6) NOT NULL,
    "value_delta_vnd" DECIMAL(20,0) NOT NULL,
    CONSTRAINT "shipment_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipment_lines_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "shipment_lines_base_quantity_check" CHECK ("base_quantity" > 0),
    CONSTRAINT "shipment_lines_unit_cost_vnd_check" CHECK ("unit_cost_vnd" >= 0),
    CONSTRAINT "shipment_lines_value_delta_vnd_check" CHECK ("value_delta_vnd" >= 0)
);
CREATE UNIQUE INDEX "shipment_lines_order_line_id_key" ON "shipment_lines"("order_line_id");
CREATE INDEX "shipment_lines_shipment_id_id_idx" ON "shipment_lines"("shipment_id", "id");
CREATE INDEX "shipment_lines_variant_id_shipment_id_idx" ON "shipment_lines"("variant_id", "shipment_id");
ALTER TABLE "shipment_lines"
    ADD CONSTRAINT "shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "shipment_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "shipment_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_shipment_line_id_fkey" FOREIGN KEY ("shipment_line_id") REFERENCES "shipment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
