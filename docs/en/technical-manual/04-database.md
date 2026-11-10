# 4. Database

PostgreSQL 18 with Prisma 7. The model is in `app/prisma/schema.prisma` and the migrations in
`app/prisma/migrations/`. It is the source of truth of the domain: if anything in this chapter
contradicts the schema, the schema wins.

## Model conventions

| Topic           | Rule                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names           | Tables and columns in `snake_case` with `@@map` / `@map`. Prisma models and fields in camelCase.                                                                                                                                                                                          |
| Ids             | CUID2 (`@default(cuid(2))`), validated with `isCuid` (`lib/ids.ts`). Small catalogs (`measurement_units`, `categories`, `tax_rates`, `states`, `cities`) use autoincrement integers; that is why `categoryId` and `cityId` are `number` in the code and the rest of the ids are `string`. |
| Dates           | `timestamptz` (UTC). The Argentine day is computed in the app (`lib/order-period.ts`).                                                                                                                                                                                                    |
| Money           | `Decimal(12,2)`, net (without VAT) except `total`. Rates (VAT, discount %, adjustment) in `Decimal(5,4)` as a **fraction** (`0.21`, `0.105`, `-0.1`).                                                                                                                                     |
| Quantities      | `Decimal(12,3)` in stock, `Decimal(12,4)` in order items. The unit defines whether they allow decimals (`measurement_units.allows_decimals`).                                                                                                                                             |
| Visible numbers | `number` (autoincrement, unique) in `sales`, `route_sheets`, `purchase_orders`, `goods_receipts`, `supplier_payments` and `picking_lists`: it is what people see (`#12`) and what goes in the URL. The internal id is never shown.                                                        |
| Deletion        | Soft delete with `deleted_at` in `products`, `customers`, `persons`, `users`, `customer_addresses`. Deactivate with `is_active`. Void with a reason (`voided_at`, `annulled_at`, `canceled_at`).                                                                                          |
| Author audit    | `created_by` / `updated_by` in business tables (added when each table is touched; `null` for what the seed loads).                                                                                                                                                                        |
| Snapshots       | What changes over time and has to stay fixed on the voucher is **copied** (see below).                                                                                                                                                                                                    |

### Snapshots: the most important pattern of the model

An order, a PO or an invoice must show what things were worth **when they were made**, even if the
product changes later. That is why the lines store a copy:

- `sale_items`: `unit_price` (net the customer paid), `unit_list_price` (base net, the difference is the
  discount), `unit_weight`, `unit_volume`, `unit_tax_rate`, `unit_cost` (last purchase cost, for the
  margin).
- `purchase_order_items`: cost and VAT of the line. `supplier_invoice_items`: what was invoiced.
- `route_stops.shortages` (JSON): what was missing in the delivery. `credit_hold_reasons` (JSON): why
  an order was held.

Changing a tax rate or a price affects what is sold **from that moment on**, never what is already
done.

## Table map by domain

| Domain               | Tables                                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base catalog         | `measurement_units`, `categories` (tree of up to 3 levels), `tax_rates`, `products`, `warehouses`                                                                                                                                                                                                                  |
| Stock                | `product_stocks` (balance per product and warehouse, with `location`), `stock_lots` (lots with expiry), `stock_counts` + `stock_count_items` (inventory counts), `stock_movements` (ledger)                                                                                                                        |
| People and access    | `customers`, `persons`, `users`, `customer_addresses`, `states`, `cities`, `login_attempts`                                                                                                                                                                                                                        |
| Prices               | `price_lists`, `price_list_items` (and `discounts` / `used_discounts`, inherited, unused)                                                                                                                                                                                                                          |
| Sales                | `cart_items`, `customer_favorites` (favorites per company), `sales`, `sale_items`, `customer_payments` and `customer_credit_notes` (+ `_items`): the customer account; `transfer_settings` (payment details, one row) and `transfer_proofs` (receipts); `order_notifications` (queue and log of the status emails) |
| Picking and delivery | `picking_lists`, `picking_list_items`, `drivers`, `vehicles`, `route_sheets`, `route_stops`                                                                                                                                                                                                                        |
| Purchasing           | `suppliers`, `supplier_products`, `purchase_orders`(+`_items`), `goods_receipts`(+`_items`), `supplier_invoices`(+`_items`)                                                                                                                                                                                        |
| Supplier payments    | `supplier_payments`(+`_lines`), `supplier_credit_notes`, `supplier_allocations`                                                                                                                                                                                                                                    |
| Cross-cutting        | `audit_logs` (insert-only)                                                                                                                                                                                                                                                                                         |

Relationships worth keeping in mind:

- `customers` 1—N `persons` (each person can have one `users`) and 1—N `customer_addresses`. **Addresses
  belong to the customer**, not to the person: any person of the customer buys to any of them. The
  delivery zone comes from `customer_addresses.city_id`.
- `sales.address_id` points to the address; an order's customer is reached as
  `sale.address.customerId`. That is why almost all customer filters are `address: { customerId }`.
- `sales.user_id` is who entered it: a `CLIENT` or an `ADMIN` (phone order). It decides whether the
  customer sees it as theirs or as "The distributor".
- `persons.customer_id` is `null` for internal users (admin, driver).

## Migrations

They are applied with `prisma migrate deploy` (in development: `npm run db:deploy`; in production the
`migrate` service runs them). One per change, named `YYYYMMDDHHMMSS_name`.

### Creating a migration

```bash
# 1. Edit prisma/schema.prisma.
# 2. Generate the SQL without applying it, so it can be reviewed and completed:
npm run db:migrate -- --create-only --name short_name
# 3. Review the new folder, add what Prisma does not generate (checks, triggers, backfills).
# 4. Apply it and regenerate the client:
npm run db:deploy && npx prisma generate
```

In this project the latest migrations were built with `prisma migrate diff` and written by hand in a
new folder. Any path works as long as the result meets the rules below.

### Rules

1. **The schema and the migrations must match.** CI runs
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` against
   an already migrated database: if there is a difference, it fails. Verify it locally before the PR.
2. **A `NOT NULL` without default on a table with data** is done in three steps inside the same
   migration: add the nullable column, fill it (`UPDATE ... SET`) and only then `SET NOT NULL`.
   Example: `20261030120000_price_lists` (`unit_list_price`).
3. **Backfill with business criteria**, not arbitrary values: `delivered_at` is filled from the audit
   log (`20261030180000_sales_reports`), `unit_cost` from the supplier's last cost.
4. **New enum values** (`ALTER TYPE ... ADD VALUE`): `AuditEntity` grows with each audited entity.
5. **No "down" migrations**: to go back, a backup is restored. A migration must not break the previous
   version of the app while it is being deployed (see
   [chapter 3](03-production.md#updating-a-server)).
6. **Never edit an already merged migration**: add another one.
7. The `init` migration was written by hand (no Prisma engine available); there is no need to imitate
   it.

### What Prisma does not support: written by hand in the SQL

- **CHECK constraints**: they are in `20261023000001_checks` and at the end of each later migration
  (for example `customer_credit_limit_not_negative_chk`, `price_list_adjustment_over_minus_one_chk`).
  They are a safety net: the app validates first, but the database rejects the impossible even if
  there is a bug.
- **Insert-only triggers** on `audit_logs` and `stock_movements`: they reject `UPDATE`, `DELETE` and
  `TRUNCATE`. A ledger that can be edited is not a ledger.
- **Partial indexes or with `NULLS NOT DISTINCT`**: e.g. the unique name among sibling categories,
  including the root (`categories`).

## Transactions and locks

Every business write goes in `db.$transaction(async (tx) => { ... })`. Inside:

- The rows that will decide the outcome are read and locked first (`SELECT ... FOR UPDATE` with
  `tx.$queryRaw`).
- Validation is done against what is **locked** (not against what was seen when rendering the page).
- It writes and audits (`audit(tx, ...)`).

### The problem it solves

Two admins change the status of the same order at once, or the customer confirms twice: without a
lock, the stock is deducted twice or the order is duplicated. With `FOR UPDATE`, the second
transaction waits for the first and only then reads the already updated status (and, for example,
fails with "the status changed while you were looking").

### Lock order (mandatory)

So that two transactions do not block each other (deadlock), **locks are always taken in the same
order**:

| Flow                               | Order                                         | Helper                                         |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Payments, status changes, checkout | **customer account, then the order**          | `lockAccount` (`lib/account-ledger`)           |
| Picking                            | picking list, then customer account and order | `createPickingList`, `confirmPickingList`      |
| Route sheet                        | orders sorted by customer (all or nothing)    | `applySaleStateChange` in a loop               |
| Stock                              | product-warehouse balances, in a fixed order  | `recordMovement` (`lib/stock-ledger`)          |
| Purchase receiving                 | PO, receiving report, balances                | `lockPurchaseOrder` (`lib/purchase-lock`)      |
| Supplier invoices and payments     | PO, invoice, supplier                         | `lockSupplier` (`lib/supplier-account-ledger`) |

Practical rule: **if your code touches a customer's account and an order, lock the account first**
(`lockAccount`). If you process several orders in one transaction, sort them by customer.

`FOR SHARE` is used to prevent someone from deactivating a warehouse while stock is moving
(deactivation asks for the row's exclusive lock to check that it has no balance).

### Idempotency against double submissions

- Checkout **empties the cart before creating the order**: a double click finds the cart already empty
  and fails instead of duplicating (`deleteMany` and a count check).
- A cart fingerprint (`lib/cart-fingerprint.ts`: products, quantities, customer prices, VAT) travels
  in the form; if it changed between being shown and being confirmed, it is rejected so that the
  customer reviews the total.
- The expected status (`from`) travels in the status change form and is compared with the locked one.

## Insert-only ledgers

### `stock_movements` and `product_stocks`

`product_stocks.quantity` is the balance per product and warehouse (it can be negative: goods are sold
before being received). `stock_movements` is the ledger. **The balance is only changed with
`recordMovement`** (or its variants `recordSaleMovements`, `recordReceiptMovements`,
`recordStockCorrection` in `lib/stock-ledger.ts`), which in a transaction:

1. validates the product and active warehouses,
2. locks the balances (`FOR UPDATE`, in order),
3. computes the movement's "legs" (`lib/stock.ts`, in thousandths with BigInt),
4. writes balance + movement + audit.

Movement types (`StockMovementType`): `ENTRY`, `ADJUSTMENT`, `WRITE_OFF`, `TRANSFER_OUT/IN`, `SALE`,
`SALE_RETURN`, `PURCHASE_RECEIPT`, `PURCHASE_RECEIPT_REVERSAL`, `CUSTOMER_RETURN`,
`CUSTOMER_RETURN_REVERSAL`. Order ones carry `sale_id`; receiving ones, `goods_receipt_id`; those of a
customer return, `customer_credit_note_id`.

**Every new type has to be added to the CHECK `stock_movement_direction_chk`**, which fixes the sign:
the ones that bring stock in (`ENTRY`, `TRANSFER_IN`, `SALE_RETURN`, `PURCHASE_RECEIPT`,
`CUSTOMER_RETURN`) are positive and the ones that take it out (`WRITE_OFF`, `TRANSFER_OUT`, `SALE`,
`PURCHASE_RECEIPT_REVERSAL`, `CUSTOMER_RETURN_REVERSAL`) negative. It is done with `DROP CONSTRAINT` +
`ADD CONSTRAINT` in the migration, comparing `"type"::text` (new values of an enum cannot be used in
the same transaction that creates them). If it is forgotten, the first movement fails at runtime with
`violates check constraint "stock_movement_direction_chk"`. A transfer is two legs (out and in).
Fixing a mistake never edits a movement: another one that compensates it is recorded.

### `audit_logs`

See [chapter 1](01-architecture.md#audit). It is always written in the same transaction as the change.
The order history, the `/admin/audit` viewer and the dashboard notices come from here.

### `customer_payments` and `customer_credit_notes`

Customer payments (`PAYMENT`) and refunds (`REFUND`), and their credit notes (returns and adjustments).
They are not deleted: they are **voided with a reason** (`voided_at`). Debt is not stored: it is
computed (see [chapter 5](05-modules.md#6-customer-account-and-credit)).

## Seed

`prisma/seed.ts` (idempotent) loads provinces, districts of the south of Greater Buenos Aires, units of
measure, tax rates (21 / 10.5 / 27 / 0 %) and the first admin (with a mandatory password change). With
`SEED_DEMO=true` it adds the demo (see [chapter 2](02-development.md#demo-data)). It runs with `tsx`
via `prisma db seed` (configured in `prisma.config.ts`).

## Prisma 7: surprising details

- The generator is `prisma-client` and the client is generated in `src/generated/prisma` (**not
  versioned**; created by `postinstall` or `npx prisma generate`). After changing the schema it has to
  be regenerated so that TypeScript sees the new fields.
- The connection uses the `@prisma/adapter-pg` adapter (`lib/db.ts`). `db` is a singleton that
  survives hot reload in development.
- `prisma.config.ts` defines the database URL **without `env()`** on purpose: `prisma generate` (in
  `postinstall`) has to work without `DATABASE_URL`.
- Prisma's `Decimal` values arrive as `Prisma.Decimal` objects; for calculations they are converted to
  `string` and operated on as integers (see `lib/cart.ts`). Never `Number(...)` for money.
- Raw SQL queries (`tx.$queryRaw`) return `Decimal` as `Prisma.Decimal` or `string` depending on the
  column: cast in the SQL (`"quantity"::text`) when needed.
- To clear a JSON in a column you must use `Prisma.DbNull`, not `null` or `undefined`.
