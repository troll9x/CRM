-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT');

-- CreateEnum
CREATE TYPE "AdminAlertType" AS ENUM ('QUOTE_CONVERTED');

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "source_quote_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "source_revision" INTEGER NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "line_subtotal_vnd" DECIMAL(20,0) NOT NULL,
    "line_discount_vnd" DECIMAL(20,0) NOT NULL,
    "order_discount_mode" "QuoteDiscountMode",
    "order_discount_value" DECIMAL(20,6),
    "order_discount_vnd" DECIMAL(20,0) NOT NULL,
    "shipping_fee_vnd" DECIMAL(20,0) NOT NULL,
    "tax_mode" "QuoteTaxMode",
    "tax_value" DECIMAL(20,6),
    "tax_vnd" DECIMAL(20,0) NOT NULL,
    "deposit_vnd" DECIMAL(20,0) NOT NULL,
    "grand_total_vnd" DECIMAL(20,0) NOT NULL,
    "payment_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT NOT NULL,
    "unit_code_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "selling_unit_factor" DECIMAL(20,6) NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "quantity_from" INTEGER NOT NULL,
    "unit_price_vnd" DECIMAL(20,0) NOT NULL,
    "line_subtotal_vnd" DECIMAL(20,0) NOT NULL,
    "discount_mode" "QuoteDiscountMode",
    "discount_value" DECIMAL(20,6),
    "discount_vnd" DECIMAL(20,0) NOT NULL,
    "line_total_vnd" DECIMAL(20,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_alerts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "AdminAlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_source_quote_id_key" ON "sales_orders"("source_quote_id");

-- CreateIndex
CREATE INDEX "sales_orders_business_id_status_updated_at_idx" ON "sales_orders"("business_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "sales_orders_business_id_customer_id_created_at_idx" ON "sales_orders"("business_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_business_id_order_number_key" ON "sales_orders"("business_id", "order_number");

-- CreateIndex
CREATE INDEX "sales_order_lines_variant_id_created_at_idx" ON "sales_order_lines"("variant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_lines_order_id_line_number_key" ON "sales_order_lines"("order_id", "line_number");

-- CreateIndex
CREATE INDEX "admin_alerts_business_id_recipient_id_read_at_created_at_idx" ON "admin_alerts"("business_id", "recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_alerts_business_id_recipient_id_type_order_id_key" ON "admin_alerts"("business_id", "recipient_id", "type", "order_id");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_source_quote_id_fkey" FOREIGN KEY ("source_quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
