-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('POSTED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_RECEIPT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PARTIALLY_RECEIVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'RECEIVED';

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'POSTED',
    "received_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "purchase_order_line_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT NOT NULL,
    "unit_code_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "conversion_factor_snapshot" DECIMAL(20,6) NOT NULL,
    "received_quantity" DECIMAL(20,6) NOT NULL,
    "base_quantity" DECIMAL(20,6) NOT NULL,
    "actual_unit_cost_vnd" DECIMAL(20,0) NOT NULL,
    "line_value_vnd" DECIMAL(20,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "on_hand_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "unavailable_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "average_cost_vnd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "goods_receipt_line_id" TEXT NOT NULL,
    "movement_key" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity_delta" DECIMAL(20,6) NOT NULL,
    "value_delta_vnd" DECIMAL(20,0) NOT NULL,
    "on_hand_after" DECIMAL(20,6) NOT NULL,
    "average_cost_after_vnd" DECIMAL(20,6) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_business_id_status_name_idx" ON "warehouses"("business_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_business_id_code_key" ON "warehouses"("business_id", "code");

-- CreateIndex
CREATE INDEX "goods_receipts_business_id_received_at_idx" ON "goods_receipts"("business_id", "received_at");

-- CreateIndex
CREATE INDEX "goods_receipts_purchase_order_id_received_at_idx" ON "goods_receipts"("purchase_order_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_business_id_receipt_number_key" ON "goods_receipts"("business_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_business_id_idempotency_key_key" ON "goods_receipts"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchase_order_line_id_created_at_idx" ON "goods_receipt_lines"("purchase_order_line_id", "created_at");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_variant_id_created_at_idx" ON "goods_receipt_lines"("variant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_goods_receipt_id_purchase_order_line_id_key" ON "goods_receipt_lines"("goods_receipt_id", "purchase_order_line_id");

-- CreateIndex
CREATE INDEX "stock_balances_business_id_updated_at_idx" ON "stock_balances"("business_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_business_id_warehouse_id_variant_id_key" ON "stock_balances"("business_id", "warehouse_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_goods_receipt_line_id_key" ON "stock_movements"("goods_receipt_line_id");

-- CreateIndex
CREATE INDEX "stock_movements_business_id_warehouse_id_variant_id_occurre_idx" ON "stock_movements"("business_id", "warehouse_id", "variant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_business_id_occurred_at_idx" ON "stock_movements"("business_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_business_id_movement_key_key" ON "stock_movements"("business_id", "movement_key");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_goods_receipt_line_id_fkey" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
