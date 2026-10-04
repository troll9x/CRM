ALTER TABLE "stock_movements"
  DROP CONSTRAINT "stock_movements_quantity_positive",
  DROP CONSTRAINT "stock_movements_value_nonnegative";

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_valid_for_type" CHECK (
    ("type" = 'STOCK_ADJUSTMENT' AND "quantity_delta" <> 0)
    OR ("type" <> 'STOCK_ADJUSTMENT' AND "quantity_delta" > 0)
  ),
  ADD CONSTRAINT "stock_movements_value_valid_for_type" CHECK (
    "type" = 'STOCK_ADJUSTMENT' OR "value_delta_vnd" >= 0
  );
