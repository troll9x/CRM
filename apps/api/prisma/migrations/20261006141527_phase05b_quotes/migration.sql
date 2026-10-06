-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteDiscountMode" AS ENUM ('PERCENTAGE', 'FIXED_VND');

-- CreateEnum
CREATE TYPE "QuoteTaxMode" AS ENUM ('PERCENTAGE', 'FIXED_VND');

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "line_subtotal_vnd" DECIMAL(20,0) NOT NULL,
    "line_discount_vnd" DECIMAL(20,0) NOT NULL,
    "order_discount_mode" "QuoteDiscountMode",
    "order_discount_value" DECIMAL(20,6),
    "order_discount_vnd" DECIMAL(20,0) NOT NULL,
    "shipping_fee_vnd" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "tax_mode" "QuoteTaxMode",
    "tax_value" DECIMAL(20,6),
    "tax_vnd" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "deposit_vnd" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "grand_total_vnd" DECIMAL(20,0) NOT NULL,
    "payment_note" TEXT,
    "internal_note" TEXT,
    "received_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
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

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_revisions" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_commands" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotes_business_id_status_updated_at_idx" ON "quotes"("business_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "quotes_business_id_customer_id_created_at_idx" ON "quotes"("business_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_business_id_quote_number_key" ON "quotes"("business_id", "quote_number");

-- CreateIndex
CREATE INDEX "quote_lines_variant_id_created_at_idx" ON "quote_lines"("variant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_quote_id_line_number_key" ON "quote_lines"("quote_id", "line_number");

-- CreateIndex
CREATE INDEX "quote_revisions_quote_id_sent_at_idx" ON "quote_revisions"("quote_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "quote_revisions_quote_id_revision_number_key" ON "quote_revisions"("quote_id", "revision_number");

-- CreateIndex
CREATE INDEX "quote_commands_business_id_created_at_idx" ON "quote_commands"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quote_commands_business_id_idempotency_key_key" ON "quote_commands"("business_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_commands" ADD CONSTRAINT "quote_commands_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
