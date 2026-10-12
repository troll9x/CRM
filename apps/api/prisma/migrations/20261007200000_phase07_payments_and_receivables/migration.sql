ALTER TYPE "SalesOrderStatus" ADD VALUE 'CONFIRMED';
CREATE TYPE "CustomerCreditEventType" AS ENUM ('OVERPAYMENT');

ALTER TABLE "sales_orders"
    ADD COLUMN "confirmed_by_id" TEXT,
    ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "sales_orders"
    ADD CONSTRAINT "sales_orders_confirmed_by_id_fkey"
    FOREIGN KEY ("confirmed_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "amount_vnd" DECIMAL(20,0) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_receipts_amount_vnd_check" CHECK ("amount_vnd" > 0)
);
CREATE UNIQUE INDEX "payment_receipts_business_id_idempotency_key_key"
    ON "payment_receipts"("business_id", "idempotency_key");
CREATE INDEX "payment_receipts_business_id_customer_id_received_at_idx"
    ON "payment_receipts"("business_id", "customer_id", "received_at");
ALTER TABLE "payment_receipts"
    ADD CONSTRAINT "payment_receipts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts"
    ADD CONSTRAINT "payment_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts"
    ADD CONSTRAINT "payment_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount_vnd" DECIMAL(20,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_vnd_check" CHECK ("amount_vnd" > 0)
);
CREATE UNIQUE INDEX "payment_allocations_payment_id_order_id_key"
    ON "payment_allocations"("payment_id", "order_id");
CREATE INDEX "payment_allocations_order_id_created_at_idx"
    ON "payment_allocations"("order_id", "created_at");
ALTER TABLE "payment_allocations"
    ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations"
    ADD CONSTRAINT "payment_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "amount_vnd" DECIMAL(20,0) NOT NULL,
    "balance_vnd" DECIMAL(20,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receivables_amount_vnd_check" CHECK ("amount_vnd" > 0),
    CONSTRAINT "receivables_balance_vnd_check" CHECK ("balance_vnd" >= 0 AND "balance_vnd" <= "amount_vnd")
);
CREATE UNIQUE INDEX "receivables_order_id_key" ON "receivables"("order_id");
CREATE INDEX "receivables_business_id_customer_id_created_at_idx"
    ON "receivables"("business_id", "customer_id", "created_at");
ALTER TABLE "receivables"
    ADD CONSTRAINT "receivables_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables"
    ADD CONSTRAINT "receivables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables"
    ADD CONSTRAINT "receivables_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables"
    ADD CONSTRAINT "receivables_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "receivable_settlements" (
    "id" TEXT NOT NULL,
    "receivable_id" TEXT NOT NULL,
    "payment_allocation_id" TEXT NOT NULL,
    "amount_vnd" DECIMAL(20,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receivable_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receivable_settlements_amount_vnd_check" CHECK ("amount_vnd" > 0)
);
CREATE UNIQUE INDEX "receivable_settlements_payment_allocation_id_key"
    ON "receivable_settlements"("payment_allocation_id");
CREATE INDEX "receivable_settlements_receivable_id_created_at_idx"
    ON "receivable_settlements"("receivable_id", "created_at");
ALTER TABLE "receivable_settlements"
    ADD CONSTRAINT "receivable_settlements_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_settlements"
    ADD CONSTRAINT "receivable_settlements_payment_allocation_id_fkey" FOREIGN KEY ("payment_allocation_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "customer_credit_balances" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "balance_vnd" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_credit_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_credit_balances_balance_vnd_check" CHECK ("balance_vnd" >= 0)
);
CREATE UNIQUE INDEX "customer_credit_balances_customer_id_key" ON "customer_credit_balances"("customer_id");
CREATE UNIQUE INDEX "customer_credit_balances_business_id_customer_id_key"
    ON "customer_credit_balances"("business_id", "customer_id");
ALTER TABLE "customer_credit_balances"
    ADD CONSTRAINT "customer_credit_balances_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_balances"
    ADD CONSTRAINT "customer_credit_balances_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "customer_credit_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "type" "CustomerCreditEventType" NOT NULL,
    "amount_vnd" DECIMAL(20,0) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_credit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_credit_events_amount_vnd_check" CHECK ("amount_vnd" > 0)
);
CREATE UNIQUE INDEX "customer_credit_events_business_id_event_key_key"
    ON "customer_credit_events"("business_id", "event_key");
CREATE INDEX "customer_credit_events_business_id_customer_id_occurred_at_idx"
    ON "customer_credit_events"("business_id", "customer_id", "occurred_at");
ALTER TABLE "customer_credit_events"
    ADD CONSTRAINT "customer_credit_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_events"
    ADD CONSTRAINT "customer_credit_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_events"
    ADD CONSTRAINT "customer_credit_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
