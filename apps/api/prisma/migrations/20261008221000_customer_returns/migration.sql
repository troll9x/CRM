CREATE TYPE "ReturnRequestStatus" AS ENUM ('RECEIVED', 'INSPECTED');

ALTER TABLE "businesses"
  ADD COLUMN "return_window_days" INTEGER,
  ADD COLUMN "policy_version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "businesses_return_window_days_check" CHECK ("return_window_days" IS NULL OR "return_window_days" BETWEEN 1 AND 3650),
  ADD CONSTRAINT "businesses_policy_version_check" CHECK ("policy_version" > 0);

ALTER TABLE "stock_movements" ADD COLUMN "return_line_id" TEXT;
ALTER TABLE "stock_movements"
  DROP CONSTRAINT "stock_movements_source_matches_type",
  ADD CONSTRAINT "stock_movements_source_matches_type" CHECK (
    ("type" = 'PURCHASE_RECEIPT' AND "goods_receipt_line_id" IS NOT NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL AND "shipment_line_id" IS NULL AND "return_line_id" IS NULL)
    OR ("type" = 'OPENING_STOCK' AND "opening_stock_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "stock_adjustment_id" IS NULL AND "shipment_line_id" IS NULL AND "return_line_id" IS NULL)
    OR ("type" = 'STOCK_ADJUSTMENT' AND "stock_adjustment_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL AND "shipment_line_id" IS NULL AND "return_line_id" IS NULL)
    OR ("type" = 'SALE_SHIPMENT' AND "shipment_line_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL AND "return_line_id" IS NULL)
    OR ("type" = 'CUSTOMER_RETURN' AND "return_line_id" IS NOT NULL AND "goods_receipt_line_id" IS NULL AND "opening_stock_id" IS NULL AND "stock_adjustment_id" IS NULL AND "shipment_line_id" IS NULL)
  );
CREATE UNIQUE INDEX "stock_movements_return_line_id_key" ON "stock_movements"("return_line_id");

CREATE TABLE "return_requests" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL, "shipment_id" TEXT NOT NULL, "order_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL, "warehouse_id" TEXT NOT NULL, "received_by_id" TEXT NOT NULL, "inspected_by_id" TEXT,
  "status" "ReturnRequestStatus" NOT NULL DEFAULT 'RECEIVED', "delivered_at" TIMESTAMP(3) NOT NULL,
  "deadline_at" TIMESTAMP(3) NOT NULL, "policy_days" INTEGER NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" TEXT NOT NULL, "request_hash" TEXT NOT NULL, "notes" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL, "inspected_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_requests_policy_days_check" CHECK ("policy_days" > 0),
  CONSTRAINT "return_requests_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "return_requests_business_id_idempotency_key_key" ON "return_requests"("business_id", "idempotency_key");
CREATE INDEX "return_requests_business_id_status_received_at_idx" ON "return_requests"("business_id", "status", "received_at");
CREATE INDEX "return_requests_shipment_id_created_at_idx" ON "return_requests"("shipment_id", "created_at");

CREATE TABLE "return_lines" (
  "id" TEXT NOT NULL, "request_id" TEXT NOT NULL, "shipment_line_id" TEXT NOT NULL, "variant_id" TEXT NOT NULL,
  "product_name_snapshot" TEXT NOT NULL, "sku_snapshot" TEXT NOT NULL, "variant_name_snapshot" TEXT NOT NULL,
  "unit_code_snapshot" TEXT NOT NULL, "unit_name_snapshot" TEXT NOT NULL, "quantity" DECIMAL(20,6) NOT NULL,
  "base_quantity" DECIMAL(20,6) NOT NULL, "saleable_quantity" DECIMAL(20,6), "quarantine_quantity" DECIMAL(20,6),
  "unit_cost_vnd" DECIMAL(20,6) NOT NULL, "inspected_at" TIMESTAMP(3),
  CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "return_lines_base_quantity_check" CHECK ("base_quantity" > 0),
  CONSTRAINT "return_lines_inspection_check" CHECK (("saleable_quantity" IS NULL AND "quarantine_quantity" IS NULL AND "inspected_at" IS NULL) OR ("saleable_quantity" >= 0 AND "quarantine_quantity" >= 0 AND "inspected_at" IS NOT NULL AND "saleable_quantity" + "quarantine_quantity" = "quantity"))
);
CREATE UNIQUE INDEX "return_lines_request_id_shipment_line_id_key" ON "return_lines"("request_id", "shipment_line_id");
CREATE INDEX "return_lines_shipment_line_id_idx" ON "return_lines"("shipment_line_id");

CREATE TABLE "return_inspections" (
  "id" TEXT NOT NULL, "request_id" TEXT NOT NULL, "line_id" TEXT NOT NULL, "inspector_id" TEXT NOT NULL,
  "reason" TEXT, "inspected_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "return_inspections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "return_inspections_line_id_key" ON "return_inspections"("line_id");
CREATE INDEX "return_inspections_request_id_inspected_at_idx" ON "return_inspections"("request_id", "inspected_at");

CREATE TABLE "return_commands" (
  "id" TEXT NOT NULL, "business_id" TEXT NOT NULL, "idempotency_key" TEXT NOT NULL, "request_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL, "created_by_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_commands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "return_commands_business_id_idempotency_key_key" ON "return_commands"("business_id", "idempotency_key");

ALTER TABLE "return_requests"
  ADD CONSTRAINT "return_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_requests_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_requests_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_requests_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_lines"
  ADD CONSTRAINT "return_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_lines_shipment_line_id_fkey" FOREIGN KEY ("shipment_line_id") REFERENCES "shipment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_inspections"
  ADD CONSTRAINT "return_inspections_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_inspections_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "return_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_commands"
  ADD CONSTRAINT "return_commands_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "return_commands_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_line_id_fkey" FOREIGN KEY ("return_line_id") REFERENCES "return_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
