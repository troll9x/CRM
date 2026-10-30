CREATE TABLE "product_import_commands" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_import_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_import_commands_business_id_idempotency_key_key" ON "product_import_commands"("business_id", "idempotency_key");
CREATE INDEX "product_import_commands_business_id_created_at_idx" ON "product_import_commands"("business_id", "created_at");

ALTER TABLE "product_import_commands" ADD CONSTRAINT "product_import_commands_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_import_commands" ADD CONSTRAINT "product_import_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
