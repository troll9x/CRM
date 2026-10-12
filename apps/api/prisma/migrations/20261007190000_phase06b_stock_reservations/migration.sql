-- Reserve stock as a separate immutable event ledger; StockBalance remains the projection.
CREATE TYPE "StockReservationEventType" AS ENUM ('RESERVED', 'RELEASED');

ALTER TYPE "SalesOrderStatus" ADD VALUE 'CANCELED';

CREATE TABLE "stock_reservation_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "type" "StockReservationEventType" NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_reservation_events_business_id_event_key_key"
    ON "stock_reservation_events"("business_id", "event_key");
CREATE INDEX "stock_reservation_events_business_id_order_id_occurred_at_idx"
    ON "stock_reservation_events"("business_id", "order_id", "occurred_at");
CREATE INDEX "stock_reservation_events_business_id_warehouse_id_variant_i_idx"
    ON "stock_reservation_events"("business_id", "warehouse_id", "variant_id", "occurred_at");

ALTER TABLE "stock_reservation_events"
    ADD CONSTRAINT "stock_reservation_events_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_events"
    ADD CONSTRAINT "stock_reservation_events_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_events"
    ADD CONSTRAINT "stock_reservation_events_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_events"
    ADD CONSTRAINT "stock_reservation_events_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_events"
    ADD CONSTRAINT "stock_reservation_events_order_line_id_fkey"
    FOREIGN KEY ("order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
