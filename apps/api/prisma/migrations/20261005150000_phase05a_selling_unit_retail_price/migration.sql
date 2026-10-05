ALTER TABLE "product_variants"
    ADD COLUMN "selling_unit_code" TEXT,
    ADD COLUMN "selling_unit_name" TEXT,
    ADD COLUMN "selling_unit_factor" DECIMAL(20,6);

UPDATE "product_variants"
SET "selling_unit_code" = "base_unit_code",
    "selling_unit_name" = "base_unit_name",
    "selling_unit_factor" = 1;

ALTER TABLE "product_variants"
    ALTER COLUMN "selling_unit_code" SET NOT NULL,
    ALTER COLUMN "selling_unit_name" SET NOT NULL,
    ALTER COLUMN "selling_unit_factor" SET NOT NULL,
    ADD CONSTRAINT "product_variants_selling_unit_factor_check" CHECK ("selling_unit_factor" > 0);

ALTER TABLE "price_tiers" DROP CONSTRAINT "price_tiers_quantity_from_check";
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_quantity_from_check"
    CHECK ("quantity_from" = 1 OR ("quantity_from" >= 5 AND "quantity_from" % 5 = 0));
