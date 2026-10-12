CREATE TABLE "customer_notes" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "customer_notes_business_id_customer_id_created_at_id_idx"
  ON "customer_notes"("business_id", "customer_id", "created_at", "id");
