CREATE TABLE "integration_staff_accesses" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "can_read" BOOLEAN NOT NULL DEFAULT true,
    "can_send" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_staff_accesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_staff_accesses_connection_id_staff_id_key" ON "integration_staff_accesses"("connection_id", "staff_id");
CREATE INDEX "integration_staff_accesses_business_id_staff_id_can_read_idx" ON "integration_staff_accesses"("business_id", "staff_id", "can_read");

ALTER TABLE "integration_staff_accesses" ADD CONSTRAINT "integration_staff_accesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_staff_accesses" ADD CONSTRAINT "integration_staff_accesses_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_staff_accesses" ADD CONSTRAINT "integration_staff_accesses_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
