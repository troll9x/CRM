CREATE TABLE "price_tiers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity_from" INTEGER NOT NULL,
    "price_vnd" DECIMAL(20,0),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "price_tiers_quantity_from_check" CHECK ("quantity_from" >= 5 AND "quantity_from" % 5 = 0),
    CONSTRAINT "price_tiers_price_vnd_check" CHECK ("price_vnd" IS NULL OR "price_vnd" > 0)
);

CREATE TABLE "price_tier_commands" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_tier_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "price_tiers_business_id_variant_id_quantity_from_key"
    ON "price_tiers"("business_id", "variant_id", "quantity_from");
CREATE INDEX "price_tiers_business_id_updated_at_idx"
    ON "price_tiers"("business_id", "updated_at");
CREATE UNIQUE INDEX "price_tier_commands_business_id_idempotency_key_key"
    ON "price_tier_commands"("business_id", "idempotency_key");
CREATE INDEX "price_tier_commands_business_id_created_at_idx"
    ON "price_tier_commands"("business_id", "created_at");

ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "price_tier_commands" ADD CONSTRAINT "price_tier_commands_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
