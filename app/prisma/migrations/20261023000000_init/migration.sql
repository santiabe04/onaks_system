-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ADMIN', 'CLIENT');

-- CreateEnum
CREATE TYPE "TaxCondition" AS ENUM ('REGISTERED_TAXPAYER', 'SINGLE_TAX_REGIME', 'EXEMPT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD');

-- CreateEnum
CREATE TYPE "SaleState" AS ENUM ('PENDING', 'PREPARING', 'READY_TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED', 'FINISHED');

-- CreateEnum
CREATE TYPE "SalePaymentState" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED');

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "measurement_unit_id" INTEGER NOT NULL,
    "weight" DECIMAL(10,3) NOT NULL,
    "volume" DECIMAL(10,3),
    "stock" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "trade_name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "cuit" VARCHAR(11) NOT NULL,
    "tax_condition" "TaxCondition" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "mail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "state_id" INTEGER NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_addresses" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city_id" INTEGER NOT NULL,
    "zip_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "person_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_must_change" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "percentage" DECIMAL(5,4),
    "value" DECIMAL(12,2),
    "date_from" TIMESTAMPTZ(3),
    "date_to" TIMESTAMPTZ(3),
    "max_uses" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "unit_weight" DECIMAL(10,3) NOT NULL,
    "unit_volume" DECIMAL(10,3),
    "unit_tax_rate" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("sale_id","product_id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "sub_total" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "state" "SaleState" NOT NULL DEFAULT 'PENDING',
    "payment_state" "SalePaymentState" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "used_discounts" (
    "discount_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "used_discounts_pkey" PRIMARY KEY ("discount_id","sale_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_name_key" ON "measurement_units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_name_key" ON "products"("name");

-- CreateIndex
CREATE INDEX "idx_products_measurement_unit_id" ON "products"("measurement_unit_id");

-- CreateIndex
CREATE INDEX "idx_products_deleted_at" ON "products"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_cuit_key" ON "customers"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "persons_mail_key" ON "persons"("mail");

-- CreateIndex
CREATE INDEX "idx_persons_customer_id" ON "persons"("customer_id");

-- CreateIndex
CREATE INDEX "idx_persons_deleted_at" ON "persons"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE INDEX "idx_cities_state_id" ON "cities"("state_id");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_state_id_key" ON "cities"("name", "state_id");

-- CreateIndex
CREATE INDEX "idx_person_addresses_person_id" ON "person_addresses"("person_id");

-- CreateIndex
CREATE INDEX "idx_person_addresses_city_id" ON "person_addresses"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- CreateIndex
CREATE INDEX "idx_users_user_type" ON "users"("user_type");

-- CreateIndex
CREATE INDEX "idx_users_deleted_at" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_name_key" ON "discounts"("name");

-- CreateIndex
CREATE INDEX "idx_discounts_date_from_date_to" ON "discounts"("date_from", "date_to");

-- CreateIndex
CREATE INDEX "idx_sales_user_id" ON "sales"("user_id");

-- CreateIndex
CREATE INDEX "idx_sales_address_id" ON "sales"("address_id");

-- CreateIndex
CREATE INDEX "idx_sales_state" ON "sales"("state");

-- CreateIndex
CREATE INDEX "idx_sales_created_at" ON "sales"("created_at");

-- CreateIndex
CREATE INDEX "idx_used_discounts_sale_id" ON "used_discounts"("sale_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_measurement_unit_id_fkey" FOREIGN KEY ("measurement_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "person_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "used_discounts" ADD CONSTRAINT "used_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "used_discounts" ADD CONSTRAINT "used_discounts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
