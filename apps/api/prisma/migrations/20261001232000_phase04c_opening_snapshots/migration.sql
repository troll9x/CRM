ALTER TABLE "opening_stocks"
  ADD COLUMN "sku_snapshot" TEXT,
  ADD COLUMN "product_name_snapshot" TEXT,
  ADD COLUMN "variant_name_snapshot" TEXT,
  ADD COLUMN "unit_code_snapshot" TEXT,
  ADD COLUMN "unit_name_snapshot" TEXT;

UPDATE "opening_stocks" AS opening
SET "sku_snapshot" = variant."sku",
    "product_name_snapshot" = product."name",
    "variant_name_snapshot" = variant."name",
    "unit_code_snapshot" = variant."base_unit_code",
    "unit_name_snapshot" = variant."base_unit_name"
FROM "product_variants" AS variant
JOIN "products" AS product ON product."id" = variant."product_id"
WHERE opening."variant_id" = variant."id";

ALTER TABLE "opening_stocks"
  ALTER COLUMN "sku_snapshot" SET NOT NULL,
  ALTER COLUMN "product_name_snapshot" SET NOT NULL,
  ALTER COLUMN "variant_name_snapshot" SET NOT NULL,
  ALTER COLUMN "unit_code_snapshot" SET NOT NULL,
  ALTER COLUMN "unit_name_snapshot" SET NOT NULL;
