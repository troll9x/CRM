ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_line_number_positive" CHECK ("line_number" > 0),
  ADD CONSTRAINT "goods_receipt_lines_factor_positive" CHECK ("conversion_factor_snapshot" > 0),
  ADD CONSTRAINT "goods_receipt_lines_quantity_positive" CHECK ("received_quantity" > 0),
  ADD CONSTRAINT "goods_receipt_lines_base_quantity_positive" CHECK ("base_quantity" > 0),
  ADD CONSTRAINT "goods_receipt_lines_cost_nonnegative" CHECK ("actual_unit_cost_vnd" >= 0),
  ADD CONSTRAINT "goods_receipt_lines_value_nonnegative" CHECK ("line_value_vnd" >= 0);

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_on_hand_nonnegative" CHECK ("on_hand_quantity" >= 0),
  ADD CONSTRAINT "stock_balances_reserved_nonnegative" CHECK ("reserved_quantity" >= 0),
  ADD CONSTRAINT "stock_balances_unavailable_nonnegative" CHECK ("unavailable_quantity" >= 0),
  ADD CONSTRAINT "stock_balances_average_cost_nonnegative" CHECK ("average_cost_vnd" >= 0);

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity_delta" > 0),
  ADD CONSTRAINT "stock_movements_value_nonnegative" CHECK ("value_delta_vnd" >= 0),
  ADD CONSTRAINT "stock_movements_on_hand_nonnegative" CHECK ("on_hand_after" >= 0),
  ADD CONSTRAINT "stock_movements_average_cost_nonnegative" CHECK ("average_cost_after_vnd" >= 0);
