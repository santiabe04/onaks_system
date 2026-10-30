-- Reportes de ventas y margen: fecha de entrega del pedido y foto del costo
-- de compra en cada ítem.

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "unit_cost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "delivered_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "idx_sales_delivered_at" ON "sales"("delivered_at");

-- Pedidos ya entregados: la fecha del último pase a Entregado en la auditoría
-- (o la última modificación si no hay registro).
UPDATE "sales" s
SET "delivered_at" = COALESCE(
  (
    SELECT max(a."created_at") FROM "audit_logs" a
    WHERE a."entity_type" = 'SALE' AND a."entity_id" = s."id"
      AND a."after" ->> 'state' = 'DELIVERED'
  ),
  s."updated_at"
)
WHERE s."state" IN ('DELIVERED', 'FINISHED');

-- Ítems anteriores: el último costo actual del producto (el más reciente entre
-- sus proveedores).
UPDATE "sale_items" i
SET "unit_cost" = (
  SELECT sp."last_cost" FROM "supplier_products" sp
  WHERE sp."product_id" = i."product_id" AND sp."last_cost" IS NOT NULL
  ORDER BY sp."last_cost_at" DESC NULLS LAST, sp."updated_at" DESC
  LIMIT 1
);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_item_unit_cost_not_negative_chk" CHECK ("unit_cost" >= 0);
