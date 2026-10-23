ALTER TABLE "customers"
  ADD CONSTRAINT "customer_cuit_format_chk" CHECK ("cuit" ~ '^[0-9]{11}$');

ALTER TABLE "discounts"
  ADD CONSTRAINT "discount_percentage_or_value_chk" CHECK (
    ("percentage" IS NOT NULL AND "value" IS NULL)
    OR ("percentage" IS NULL AND "value" IS NOT NULL)
  ),
  ADD CONSTRAINT "discount_percentage_over_zero_under_one_chk" CHECK (
    "percentage" > 0 AND "percentage" <= 1
  ),
  ADD CONSTRAINT "discount_value_positive_chk" CHECK ("value" > 0),
  ADD CONSTRAINT "discount_limit_mechanism_chk" CHECK (
    ("date_from" IS NOT NULL OR "date_to" IS NOT NULL) OR ("max_uses" IS NOT NULL)
  ),
  ADD CONSTRAINT "discount_date_range_chk" CHECK (
    "date_from" IS NULL OR "date_to" IS NULL OR "date_from" < "date_to"
  );

ALTER TABLE "products"
  ADD CONSTRAINT "product_tax_rate_range_chk" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 1),
  ADD CONSTRAINT "product_price_non_negative_chk" CHECK ("price" >= 0),
  ADD CONSTRAINT "product_stock_non_negative_chk" CHECK ("stock" >= 0);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_item_quantity_positive_chk" CHECK ("quantity" > 0);
