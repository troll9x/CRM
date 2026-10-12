CREATE TABLE "customer_credit_applications" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "amount_vnd" DECIMAL(20,0) NOT NULL,
    "status" "CustomerCreditApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_credit_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_credit_applications_amount_vnd_check" CHECK ("amount_vnd" > 0)
);
CREATE UNIQUE INDEX "customer_credit_applications_business_id_idempotency_key_key"
    ON "customer_credit_applications"("business_id", "idempotency_key");
CREATE INDEX "customer_credit_applications_business_id_customer_id_create_idx"
    ON "customer_credit_applications"("business_id", "customer_id", "created_at");
CREATE INDEX "customer_credit_applications_order_id_status_idx"
    ON "customer_credit_applications"("order_id", "status");
ALTER TABLE "customer_credit_applications"
    ADD CONSTRAINT "customer_credit_applications_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications"
    ADD CONSTRAINT "customer_credit_applications_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications"
    ADD CONSTRAINT "customer_credit_applications_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications"
    ADD CONSTRAINT "customer_credit_applications_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivable_settlements"
    ALTER COLUMN "payment_allocation_id" DROP NOT NULL,
    ADD COLUMN "credit_application_id" TEXT;
CREATE UNIQUE INDEX "receivable_settlements_credit_application_id_key"
    ON "receivable_settlements"("credit_application_id");
ALTER TABLE "receivable_settlements"
    ADD CONSTRAINT "receivable_settlements_credit_application_id_fkey"
    FOREIGN KEY ("credit_application_id") REFERENCES "customer_credit_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "receivable_settlements_exactly_one_source_check"
    CHECK (("payment_allocation_id" IS NOT NULL) <> ("credit_application_id" IS NOT NULL));

ALTER TABLE "customer_credit_events"
    ALTER COLUMN "payment_id" DROP NOT NULL,
    ADD COLUMN "application_id" TEXT;
CREATE INDEX "customer_credit_events_application_id_idx"
    ON "customer_credit_events"("application_id");
ALTER TABLE "customer_credit_events"
    ADD CONSTRAINT "customer_credit_events_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "customer_credit_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "customer_credit_events_source_matches_type_check"
    CHECK (
        ("type" = 'OVERPAYMENT' AND "payment_id" IS NOT NULL AND "application_id" IS NULL)
        OR
        ("type" IN ('APPLICATION', 'REVERSAL') AND "payment_id" IS NULL AND "application_id" IS NOT NULL)
    );
