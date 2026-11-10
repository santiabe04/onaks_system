# 5. How each module works

Each section explains **what a module does**, **where** the code is, **the rules that cannot be
broken** and the **surprising details**. File names are relative to `app/src/`. Before reading, keep in
mind the pattern of [pure vs. server `lib/`](01-architecture.md#lib-where-the-logic-lives) and the
[lock order](04-database.md#lock-order-mandatory).

## Index

1. [Catalog, products and categories](#1-catalog-products-and-categories)
2. [Customer price: lists and discounts](#2-customer-price-lists-and-discounts)
3. [Cart and checkout](#3-cart-and-checkout)
4. [Order entered by the admin](#4-order-entered-by-the-admin)
5. [Order statuses and stock](#5-order-statuses-and-stock)
6. [Customer account and credit](#6-customer-account-and-credit)
7. [Picking](#7-picking)
8. [Delivery](#8-delivery)
9. [Purchasing and suppliers](#9-purchasing-and-suppliers)
10. [Reports](#10-reports)
11. [Customers, users and security](#11-customers-users-and-security)
12. [Uploaded files](#12-uploaded-files)
13. [Admin orders: views, filters and CSV](#13-admin-orders-views-filters-and-csv)

---

## 1. Catalog, products and categories

**What it does.** The customer sees the **current and active** products at `/` (search, category
tree, cards or list, 24 per page) and the detail at `/products/[id]`. The admin manages them at
`/admin/products`, `/admin/categories`, `/admin/measurement-units`, `/admin/tax-rates`,
`/admin/warehouses`.

**Where.** `app/[lang]/(shop)/page.tsx`, `lib/catalog.ts` (pure filters, `VISIBLE_PRODUCT`),
`lib/catalog-queries.ts` (price formatting on the server), `lib/product.ts` (validation),
`lib/category.ts` (tree), `components/catalog/`.

**Rules.**

- **A product is visible if `isActive && deletedAt == null`** (`VISIBLE_PRODUCT`). Stock hides nothing:
  if it is not meant to be sold, the admin pauses it. Everything that shows or sells products filters
  with that constant.
- The price is stored **net** (without VAT). The final one is computed with `lib/price.ts`
  (`finalPrice`, in integers and rounding half up). The tax rate is an FK to `tax_rates`: changing a
  rate affects all the products that use it, not the orders already made (the lines store their copy).
- SKU is required and uppercase; barcode optional; weight in kg and volume in liters; products only in
  **final** categories (leaf of the tree). The product and category actions share a lock on
  `categories` so that a product is not created in a category that is just receiving a child.
- Categories: tree of up to 3 levels (`lib/category.ts`), unique name among siblings (`NULLS NOT
DISTINCT` index, also at the root). The shop menu only shows branches with visible products
  (`visibleCategoryTree`).
- Filtering by a category includes its subcategories (`descendantIds`).
- `measurement_units.allows_decimals` decides whether a product is sold by fraction (kg, liters) or
  only whole (unit).
- A warehouse is only deactivated with no stock; a unit of measure or a tax rate is only deleted when
  unused.

## 2. Customer price: lists and discounts

**What it does.** Each customer pays a price that depends on their **price list** and on their own
**discount**. With no list and no discount, they pay the base price.

**Where.** `lib/customer-price.ts` (pure), `lib/pricing-queries.ts` (`getPricing`), `lib/price-list.ts`
(validation), `app/[lang]/admin/price-lists/`.

**How it is computed** (all in cents with BigInt, half up, in this order):

```
list net     = the product's fixed price in the list          (if it exists)
             | base net × (1 + list adjustment)               (if not)
customer net = list net × (1 − customer discount)
```

- `price_lists.adjustment` is a signed fraction (`-0.1` = 10 % less; `0.15` = 15 % more). It must be
  greater than −1 (CHECK in the database).
- `price_list_items.price` is a fixed net price **that overrides the adjustment** of that list for that
  product.
- `customers.discount_rate` goes from 0 to less than 1 (CHECK).
- `getPricing(customerId, productIds, client?)` returns a `Pricing` `{ adjustment, discount,
overrides }` (fixed prices only for the requested products). It accepts a transaction. Without a
  customer (an admin looking at the shop) it returns `BASE_PRICING`.
- `customerPrice(productId, basePrice, pricing)` is the function everyone uses: catalog
  (`toCatalogItem`), cart (`getCart`), checkout, admin order and the live form
  (`components/orders/new-order-form.tsx`, which receives the lists by props).
- When the customer's price is lower than the base, the shop shows the base **crossed out**.
- When selling, the order stores `sale_items.unit_price` (what they paid), `unit_list_price` (the base)
  and `sales.discount` (the total net discount, `saleDiscount`). Fixed prices have no per-product
  audit: one entry per save is audited with the detail of what changed in `metadata`.

**Gotcha.** Any new place that puts a price on a customer has to go through `getPricing` +
`customerPrice`. If you use `product.price` directly, the customer sees (and pays) a price different
from their list's.

## 3. Cart and checkout

**What it does.** The customer builds a cart (persisted in the database) and confirms it as a cash
order.

**Where.** `app/[lang]/(shop)/cart/`, `checkout/` (`page.tsx`, `checkout-form.tsx`, `actions.ts`),
`lib/cart.ts`, `lib/cart-queries.ts`, `lib/cart-fingerprint.ts`, `lib/checkout.ts`.

**Cart.** `cart_items`, one row per person and product, **with no audit**: it is not business data
until it is confirmed. Only whoever has the `sales:create` permission buys (the `CLIENT`).
`getCart(personId, customerId, tx?)` returns the items with their `price` already computed for that
company, and splits them into `available` and `unavailable` (products paused or deleted after being
added: they do not enter the total). Totals come from `lib/cart.ts` (`lineTotals`, `cartTotals`): each
line's net is rounded to cents and **VAT is computed on that net**, so what is stored matches exactly
what was shown.

**Checkout** (`placeOrder`, one transaction):

1. Validates the form (the **company's** address and comment) and that the address is current.
2. `lockAccount`: locks the customer's account (first lock of the mandatory order).
3. Re-reads the cart with the current prices and compares its **fingerprint** (`cartFingerprint`:
   product, quantity, price, VAT, sorted and hashed) with the one the customer saw. If anything
   changed, it rejects with "the cart changed" and the page shows the new prices.
4. **Empties the cart before creating the order**: if there was a double click, the second
   `deleteMany` finds no rows and fails (`cartChanged`) instead of duplicating.
5. Creates the order (`PENDING`, `CASH`) with its items (`saleItemSnapshot`) and the discount
   (`cartDiscount`).
6. `audit`, `recomputeAccount` and `applyCreditCheck` (see [credit](#credit)).

**The customer can** cancel a `PENDING` order from "My orders". If the admin enables it
(`sales.customer_can_edit`, used once), they can **edit it**: its items go back to their cart
(`sales.editing_person_id`, one per person) and `placeOrder` **replaces that order** (same number)
instead of creating another. While it is being edited, the admin cannot change its status.

"My orders" shows those of the **whole company** (`address.customerId`); someone else's returns 404.

### Repeat order and favorites

**Repeat order** (`repeatOrder` in `app/[lang]/(shop)/orders/actions.ts`, `RepeatOrderButton` in the
list and detail of "My orders"): adds the products and quantities of a company order to the cart
**with today's prices and list**: nothing is copied from the old price. The decision is pure
(`lib/repeat-order.ts`, `planRepeat`): paused or deleted items are skipped and counted, a fractional
quantity of a product whose unit no longer allows fractions is rounded up, and quantities are
**accumulated** with whatever was already in the cart (same as "Add" in the catalog). It redirects to
`/cart?repeated=&omitted=&from=` and the cart shows what was added and what was not. The customer
reviews and confirms in the usual checkout; someone else's order returns "does not exist".

**Favorites** belong to the **company**, not to the person (`customer_favorites`, PK company +
product): all the customer's people see the same ones. Like the cart, they are a preference and **do
not go to the audit log**.

- `setFavorite` (heart, `components/catalog/favorite-button.tsx`, optimistic update) and
  `addFavoritesToCart` (adds **one unit of each favorite that is not already in the cart**; what was
  already there keeps its quantity) live in `app/[lang]/(shop)/favorites/actions.ts`.
- The `?favorites=1` filter is part of `CatalogFilters` (`lib/catalog.ts`): `catalogWhere` receives the
  user's company and, without a company (an admin looking at the shop), the filter returns nothing.
- **"What you order most"** (`getMostOrderedIds` in `lib/favorites-queries.ts`): the 4 products with the
  most orders from the company (`COUNT(DISTINCT order)`, without canceled orders or products that
  cannot be sold; on a tie, the most recent order). Only on the catalog front page, without search,
  category or favorites filter.

### Payment by transfer

Checkout offers **cash** or **transfer** (`paymentMethod` in `lib/checkout.ts`; if not chosen it is
cash). Transfer is only offered if **payment details** are loaded (`transfer_settings`, a single row
with `id = 1` and CHECKs in the migration: bank, holder, valid CUIT and CBU or alias). The admin loads
them at `/admin/payment-settings` (permission `payment-settings:manage`, audited as
`TRANSFER_SETTINGS`); validations are pure in `lib/transfer.ts` (`isValidCbu` with the two check
digits, `isValidAlias`). `placeOrder` checks again on the server that there are details
(`transferAvailable`) and does not trust the form.

A transfer order follows its normal course (it is not held waiting for the payment): the payment is
validated separately. The customer attaches the **receipt** when confirming (optional) or later from
their order (`uploadTransferProof` in `(shop)/orders/actions.ts`). `canUploadProof` decides whether it
can be done: transfer order, not canceled or paid, and with no other receipt under review. The file is
processed and saved **before** the transaction (`lib/transfer-proof-files.ts`: image → WebP without
EXIF, PDF as is, up to 5 MB) and deleted if the transaction fails.

In the order detail (admin) each pending receipt has two forms (`proof-actions.ts`, permission
`sales:manage`):

- **Validate** (`validateTransferProof`): the admin confirms amount and date (what is left to collect
  is suggested) and a transfer `createCustomerPayment` is recorded, allocated to the order, so the
  customer account, credit and debtors do not change. Lock order: customer account and then the
  receipt (`FOR UPDATE`, which must still be PENDING: two validations at once do not pass). It stores
  the payment in `payment_id`.
- **Reject** (`rejectTransferProof`): with a reason (up to 200 characters) that the customer sees; they
  can upload another one.

Receipts are **never deleted** (order history) and everything is audited as `TRANSFER_PROOF`. The
dashboard shows how many are waiting for validation and "All orders" filters them with `proof=1`
(`transferProofs: { some: { state: "PENDING" } }` in `lib/order-filters.ts`).

## 4. Order entered by the admin

**What it does.** Orders that come in by phone or WhatsApp: at `/admin/orders/new` (or from the
customer's page, with `?customer=`) the admin chooses customer and address, searches products (name,
SKU or barcode) and confirms. It **does not touch the customer's cart.**

**Where.** `app/[lang]/admin/orders/new/` (`page.tsx`, `actions.ts`),
`components/orders/new-order-form.tsx`, `lib/admin-order.ts` (`searchProducts`, `parseAdminOrder`,
`saleItemSnapshot`).

**Rules.** Permission `sales:manage`. It uses **the chosen customer's prices** (`getPricing`), cash,
and ends up `PENDING` with the admin as author (`sales.user_id`): the customer sees it as "The
distributor" (`orders.placedByDistributor`) and can cancel it or ask to change it like any other. It
reuses `saleItemSnapshot` (shared with checkout) and the same lock order; on confirmation it also runs
`recomputeAccount` and `applyCreditCheck`. Line quantities arrive as `qty_<productId>`.

## 5. Order statuses and stock

**Two independent state machines** in `sales`:

- `SaleState` (logistics): `PENDING → PREPARING → READY_TO_SHIP → OUT_FOR_DELIVERY → DELIVERED →
FINISHED`, and `CANCELED`.
- `SalePaymentState` (payment): `PENDING`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`. It is **computed**
  from the customer account, not edited by hand.

**Where.** `lib/sale-state.ts` (pure rules), `lib/sale-state-change.ts` (`applySaleStateChange`, the
core), `lib/sale-state-form.ts`, `app/[lang]/admin/orders/actions.ts` (`changeSaleState`,
`changeSalesStateBulk`), `components/orders/bulk-state-bar.tsx`.

**Transition rules** (`allowedTransitions`): forward (steps can be skipped), **one step back** to
correct, and cancel as long as it is not delivered. `CANCELED` is final.

**`applySaleStateChange(tx, saleId, input, userId, t)`** is the only thing that changes the status. It
is used by the individual change, the bulk change (one order per transaction, reports each one's
result), picking and route sheets. Inside the caller's transaction:

1. `lockAccount` of the customer and then `SELECT ... FOR UPDATE` of the order.
2. Rejects if the status is no longer the one that was seen (`stale`), if the customer is editing it
   (`beingEdited`) or if it is **held for credit** and is not being canceled (`creditHold`).
3. **Effect on stock** (`stockEffect`): on reaching `PREPARING` (or later, if steps were skipped) it is
   **deducted** (`SALE`) from the chosen warehouse; on going back to `PENDING` or canceling after it
   was deducted, it is **returned** (`SALE_RETURN`). The return is the net of the order's movements
   (`pendingReturns`), so an order that was prepared, returned and prepared again returns only what is
   missing. The warehouse is one for the whole order or one per product.
4. Updates `state`, turns off `customer_can_edit` and handles `delivered_at` (set on moving to
   Delivered, cleared if it goes back; it is the sale date for the reports).
5. `audit` with `before`/`after` and the comment; `recomputeAccount` (delivering changes the debt).

**Reserved stock.** Orders in `RESERVED_SALE_STATES` (today only `PENDING`) count as reserved:
`/admin/stock` shows Reserved and Available = total − reserved. From `PREPARING` on, the stock has
really been deducted.

**Lots and expiry.** A product with `tracks_expiry` also carries its stock by lot (`stock_lots`:
product, warehouse, code and expiry, `quantity >= 0`); the `product_stocks` balance is still the total
and the difference is stock "without lot". Everything goes through the ledger
(`lib/stock-ledger.ts`): an outflow (`SALE`, write-offs, inventory adjustments and `TRANSFER_OUT`) is
split into legs with `allocateFefo` (`lib/lots.ts`, pure: first the lot that expires first and, on the
same date, by code) and each leg is a `stock_movements` row with its `lot_id`, plus a leg without lot
if the lots are not enough. `SALE_RETURN` returns to the lots that order's goods came from
(`saleReturnParts`, the net of its movements with a lot). A receipt brings the lot and date of each
line (`parseReceiptLines`: rows `lot_/exp_/lq_<product>_<n>`, up to `MAX_LOTS_PER_LINE` lots that add
up to what arrived; stored in `goods_receipt_lots`) and enters into each lot; voiding the report takes
from them (`reversalParts`). Transfers carry each leg to the same lot of the destination warehouse. A
manual entry of a tracked product requires lot and date. A customer return goes back to the lots the
order's goods came from, deducting what other notes already returned (`noteReturnParts`); writing it
off or voiding it takes from the lots where that note left the goods (`noteHeldParts`). In the
picking list (`getSaleLots`) you can see which lot each product comes from and, with the list open,
`changePickingLot` → `reassignSaleLot` moves a quantity from one lot to another with two movements of
the order (`SALE_RETURN` to the source and `SALE` to the destination), without changing the balance.
`/admin/stock/lots` lists lots with stock (expired and expiring within 30 days, `expiryStatus`) and
the dashboard warns. Lot dates are calendar dates: they are read with `dayOf` and shown with
`format.day` (with `format.date` they would shift a day because of the time zone).

**Customer notices.** When an order is confirmed or moves forward to In preparation, On the road or
Delivered, the customer receives an email. `noticeFor` (`lib/order-notice`, pure) decides whether the
change is notified; `enqueueOrderNotice` (`lib/order-notice-ledger`) inserts the `order_notifications`
row inside the same transaction as the change (if it is rolled back, the notice does not remain
either; it is unique per order and status, so going back and forward again does not repeat it) with
the subject and body already built with the installation's dictionary. After responding, `after()`
runs `flushOrderNotices`: it takes up to 20 notices with `FOR UPDATE SKIP LOCKED`, counts the attempt,
sends over SMTP (`lib/mailer`, configured by env; without `SMTP_HOST` and `SMTP_FROM` nothing is
queued) and marks `SENT`; if it fails it stays `PENDING` with the error until `NOTICE_MAX_ATTEMPTS` is
exhausted and becomes `FAILED`. Those left in the queue are picked up again on the next send, and the
admin can retry them by hand from the order detail (`retryOrderNotice`). There too, `OrderNotices`
builds the WhatsApp button: a `wa.me` link with the message of the current status
(`buildWhatsappText`) for the person's phone (`whatsappLink`), without an API. To test locally without
a real SMTP, point `SMTP_PORT` to a closed port (the notice stays in the queue with its error) or to a
test SMTP server.

**Inventory count.** `/admin/stock/counts` opens a warehouse's count (`stock_counts`, only one `OPEN`
per warehouse: partial unique index in the migration). Whoever counts (`stock:count`) loads it blind
from the phone at `/admin/stock/counts/[number]`: `ScanForm` reads the code with the camera
(`BarcodeDetector`, if the browser has it) or receives it typed or from a reader, and `scanCountEntry`
looks it up by barcode or SKU (`matchProductByCode`) and adds the quantity to
`stock_count_items.counted`; on a product's first scan it stores `expected`, the warehouse balance at
that moment. An admin (`stock:manage`) reviews at `/review` (there the balance is visible) and
`approveStockCount` records each difference (`countDifference`: counted − expected) with
`recordStockCorrection`, products in id order and everything in one transaction; what was not scanned
is not touched. Measuring against the balance at the first scan avoids overwriting what was sold or
received while counting. Discarding does not move stock.

**History.** The order detail is built by reading that order's audit log (`History` in
`app/[lang]/admin/orders/[number]/page.tsx`): statuses, edit permissions, customer changes, holds and
credit approvals.

## 6. Customer account and credit

### Customer account

**What it is.** A customer's debt is **not stored: it is computed**. `lib/account.ts`
(`summarizeAccount`, pure, in cents) receives the orders, payments and credit notes and returns the
balance and the allocation per order:

- An order is a **debt when delivered** (`CHARGED_SALE_STATES`: `DELIVERED`, `FINISHED`).
- What was collected (non-voided `customer_payments`: `PAYMENT` adds, `REFUND` subtracts) is allocated
  to the **oldest order first**: first to the delivered ones (the debt) and, with what is left, to the
  ones not yet delivered (advance payment). Canceled orders receive no allocation.
- Valid **credit notes** (see below) lower the debt just like a payment: they are added to what was
  collected and allocated the same way.
- Balance = delivered − collected − credited. Positive, owes; negative, credit balance. A **refund**
  can only be up to the credit balance (`maxRefund`), whether it comes from an overpayment or from a
  credit note.

**Writing.** `lib/account-ledger.ts`: `loadAccount` (reads orders and payments and summarizes),
`lockAccount`, `recomputeAccount` (stores the result in `sales.payment_state` and `sales.paid_at`,
**in the same transaction**, so lists and filters use it directly) and `createCustomerPayment`
(payment or refund with audit; used by the customer account, the order detail and the driver's stop).
Payments are **voided with a reason**, never deleted.

**Screens.** `/admin/customers/[id]/account`, `/admin/debtors` (the same account, but in SQL for all
customers: `lib/debtors.ts`) and "My orders" for the customer (they see their balance and latest
payments, without voided ones or who entered them).

### Credit notes and returns

**What it does.** When a customer returns goods from a delivered order, or an amount has to be
credited to them, the admin enters a **credit note**. It lowers what the customer owes (or leaves them
a credit balance).

**Where.** `lib/customer-credit.ts` (pure: `parseReturn`, `parseAdjustment`, `returnAmount`,
`remainingQuantity`), `lib/customer-credit-ledger.ts` (`createReturn`, `createAdjustment`,
`voidCreditNote`), `lib/customer-credit-queries.ts` (`returnableLines`),
`app/[lang]/admin/orders/[number]/return/` (the return screen), the adjustment and void actions in
`app/[lang]/admin/customers/[id]/account/credit-note-actions.ts` and the components in
`components/account/credit-note-*.tsx`.

**Two kinds** (`CustomerCreditNoteKind`):

- **Return** (`RETURN`): comes from a **delivered** order (from its detail, "Record return").
  Quantities are chosen per product (up to what was delivered minus what was already returned in valid
  notes), a warehouse and a reason. The amount is **what the customer paid on that order**: the line's
  `unit_price` and `unit_tax_rate`, with VAT (`returnAmount`), not today's price. Each line has a
  destination (`ReturnDestination`): `RESTOCK` enters the warehouse and can be sold again;
  `WRITE_OFF` enters and is written off right away (expired, broken), so the stock ledger shows both
  legs and the balance does not change.
- **Adjustment** (`ADJUSTMENT`): an amount with VAT and a reason, with no products or stock (from the
  customer's account).

**Rules.**

- `createReturn` locks **the customer's account first and then the order** and recomputes what was
  already returned with those locks in place: two simultaneous returns cannot exceed what was
  delivered.
- Voiding (`voidCreditNote`, with a reason) leaves the note in the history and removes it from the
  account. A return **takes from the warehouse only what it had restocked**
  (`CUSTOMER_RETURN_REVERSAL`); what was written off is not touched, because it was no longer there.
  Stock can end up negative if what was restocked has already been sold: it is a balance to review.
- A credit note does **not** change the order or its total: the order is still worth what it was and
  the note appears separately, both in the order detail and in the customer account.
- The customer sees their valid notes in "My account" and the returns in their order detail, **without
  the reason or the destination** (internal data) and without voided ones.
- Sales and margin reports **subtract returns** (see [Reports](#10-reports)).

### Credit

**What it does.** The admin can set a **credit limit** and a **payment term** (days from delivery) for
a customer. Nothing blocks the customer: if on confirming an order they exceed the limit or have
overdue debt, the order is confirmed anyway and stays **held** until the admin approves or cancels it.

**Where.** `lib/credit.ts` (pure: `creditExposure`, `checkCredit`, `isOnCreditHold`),
`lib/credit-ledger.ts` (`applyCreditCheck`), `releaseCreditHold` in
`app/[lang]/admin/orders/actions.ts`, `app/[lang]/admin/orders/[number]/credit-hold-control.tsx`.

**Rules.**

- **Exposure** = what is pending collection on all the customer's non-canceled orders (delivered
  **and** open), already net of what was paid. It is compared with `customers.credit_limit` (null = no
  limit).
- **Overdue debt** = a delivered order with a pending balance whose `delivered_at` is earlier than
  `payment_term_days` days ago (null = not checked).
- `applyCreditCheck(tx, ...)` runs **after** `recomputeAccount`, with the account locked, on
  confirmation (shop or admin). If it fails, it stores `credit_hold_at` and the reasons
  (`credit_hold_reasons`, JSON with `limit` and/or `overdue`). If the order was already held without
  approval and now fits (because it was edited), the hold is removed.
- A **held order can only be canceled** (required by `applySaleStateChange`) until the admin approves
  it with `releaseCreditHold` (stores who, when and an optional comment). Approving it does not change
  the customer's limit.
- Visibility: dashboard notice, "Held" mark in the order list and `held=1` filter.

## 7. Picking

**What it does.** Before dispatch, a **picking list** is built per warehouse with `PENDING` orders: the
system gathers what has to be taken out and sorts it by location to walk through the warehouse.

**Where.** `/admin/picking`, `lib/picking.ts` (`pickingRoute`, `parsePicked`, `compareLocations`),
`lib/picking-queries.ts`, `components/picking/`, and the actions in `app/[lang]/admin/picking/`.

**Flow.**

1. A set of orders is chosen with the checkboxes of "All" or "By zone" (`PickingFromSelection`).
2. `createPickingList`: one warehouse per list, only `PENDING` orders; it moves them to `PREPARING`
   with `applySaleStateChange` (deducts from the warehouse), **sorted by customer, all or nothing**.
3. It is prepared and confirmed (`confirmPickingList`): each order moves to `READY_TO_SHIP`. What was
   missing or not found is applied with `applyShortages` (`lib/partial-delivery-ledger.ts`, shared
   with partial delivery): it returns the shortage to the warehouse (`SALE_RETURN`), and depending on
   the reason writes off (`WRITE_OFF`: broken or expired) or corrects by difference
   (`recordStockCorrection`, `ADJUSTMENT`).
4. Removing an order from the list, or voiding the list, returns it to `PENDING`.

**Location.** `product_stocks.location` (e.g. `A-03-2`), editable at `/admin/stock/[product]`.
`pickingRoute` groups by product and sorts by location in **natural order** (`A-2` before `A-10`),
with those without location at the end.

**Lock.** Picking list first, then customer account and order.

## 8. Delivery

**Entities.** `drivers` (name, phone, optional linked user), `vehicles` (plate in uppercase, optional
capacity in kg and liters), `route_sheets` and `route_stops`. No deletion: they are deactivated.
Validation in `lib/fleet.ts`; permission `routes:manage`.

### Route sheet

States (`RouteSheetState`): **Preparing (`DRAFT`) → On the road (`OUT`) → Closed (`CLOSED`)**.

- It is built at `/admin/routes` (or from "By zone" with the checkboxes). Stops are `READY_TO_SHIP`
  orders **without another open sheet** (the check is done with the orders locked). They are reordered
  (`moveStop`) and the vehicle's capacity is checked (`checkCapacity`).
- **Departing** moves all the orders to `OUT_FOR_DELIVERY` with `applySaleStateChange` in **one
  transaction (all or nothing)**, sorted by customer. "Back to preparing" returns them.
- Printing at `[number]/print`, with the **amount to collect per stop** (`amountsToCollect`: the order
  plus the previous debt, the latter only once per customer, only pending stops).

### Loading the delivery (phone)

`app/[lang]/delivery/` (driver's home), `[number]/[position]/` (one stop, designed for the phone). It
can be loaded by the **linked driver** or an admin (`routes:deliver`).

- **Delivered**: on-screen signature with name, or a photo of the delivery note; optional payment that
  is recorded in the customer account with `createCustomerPayment`; time and GPS if the phone gives
  them (`lib/stop-record.ts`). The order moves to `DELIVERED` (it becomes debt).
- **Not delivered**: with a reason; the order goes back to `READY_TO_SHIP` and is free for another
  sheet once this one is closed.
- **Partial delivery** (at the same stop): `lib/partial-delivery.ts` validates how much was delivered
  and the reason; `applyShortages` (inside the transaction, **before** moving to Delivered) returns
  the shortage to the warehouse it came from, writes off what is broken or expired, adjusts the
  order's quantities and totals (`discount` included) and audits. The shortage stays in
  `route_stops.shortages`. **A partial delivery cannot be undone from the stop.**
- An admin can **undo** a load while the sheet is on the road.
- Signatures and photos: `lib/delivery-files.ts` converts them to WebP in `UPLOADS_DIR/deliveries` and
  they are served **with a session** by `app/media/deliveries/[file]` (seen by whoever has
  `sales:read-all`; the driver, only those of their own sheets).

### Closing and cash count

`closeRouteSheet` (admin only), with **all** stops loaded: the expected cash is computed
(`summarizeCollections`: sum of the cash payments of the non-voided stops, with the sheet locked). If
what was handed in does not match, the **comment is mandatory**. Expected, received, comment and who
closed are stored. With the sheet closed, undelivered orders are free for another one.

## 9. Purchasing and suppliers

The whole purchasing circuit, from the order to the debt with the supplier. Permission
`purchases:manage`.

**Suppliers** (`/admin/suppliers`): data and the list of products bought from them
(`supplier_products` with supplier code and net **last cost**).

**Purchase order (PO)** (`/admin/purchases`, `lib/purchase-order.ts`): states `DRAFT → SENT →
PARTIALLY_RECEIVED / RECEIVED`, or `CANCELED` (only with nothing received). It is built per supplier;
the cost is preloaded with the supplier's last one and the lines store a **cost and VAT snapshot**.
The suggested quantity (`suggestQuantity`) is _minimum + reserved − stock − pending on other sent
POs_, rounded up if the unit does not allow decimals (uses `products.min_stock`). There is printing
and a text for WhatsApp **without prices**.

**Receiving report (RR)** (`/admin/receipts`, `lib/goods-receipt.ts`): loaded from the PO. One
warehouse per report, optional delivery note, what arrived per product (more is accepted with a
warning). It enters the stock with `recordReceiptMovements` (`PURCHASE_RECEIPT`), adds to
`received_quantity` and recomputes the PO's state (`orderStateFor`). It is **voided with a reason**
(`PURCHASE_RECEIPT_REVERSAL`, reopens the PO). A partially received PO can be **closed with a
shortage**. Locks: PO, report, balances.

**Supplier invoice** (`/admin/invoices`, `lib/supplier-invoice.ts`): loaded from the PO with the
voucher (type A/B/C, point of sale, number; **a duplicate per supplier is rejected**), the lines with
the PO's tax rate, perceptions and the printed total. `matchInvoice` does the **3-way check**: cost
different from the PO's, quantity greater than what was received and not invoiced, or printed total
different from the computed one. Without differences → `APPROVED`; with differences → `FLAGGED` until
an admin approves it with a comment. On approval, the cost becomes the supplier's last one
(`updateLastCosts`) if there is no newer one; that cost feeds the margin of future sales. An invoice
with valid allocations cannot be voided.

**Supplier account** (`/admin/suppliers/[id]/account`, `/admin/supplier-debts`,
`lib/supplier-account.ts`): approved invoices − payment orders − credit notes, without voided ones
(`summarizeSupplierAccount`, in cents). _Overdue_ = with a balance and a due date before today
(without a due date, the invoice date counts).

- **Payment order (PmtOrd)** (`supplier_payments` + `supplier_payment_lines`): several methods (cash,
  transfer, check, withholding of VAT / gross income / income tax). With printing.
- **Credit note (CN)** by amount (`supplier_credit_notes`).
- Both are **allocated** to approved invoices with a balance (`supplier_allocations`): the admin
  chooses and `autoAllocate` preloads from the oldest to the newest; what is left over stays "on
  account" and is allocated later. Voiding a PmtOrd or CN leaves its allocations without effect (the
  rows remain).
- Everything with the supplier locked (`lockSupplier`). Order: PO, invoice, supplier.

## 10. Reports

`/admin/reports` (permission `reports:read`). See the code in `lib/sales-report.ts` (pure) and
`lib/sales-report-queries.ts`.

- **What counts as a sale** (selector): _delivered_, by `sales.delivered_at` (default), or _confirmed
  not canceled_, by order date.
- **Period**: from / to (default the current month, maximum one year). Days are Argentine days.
- **Breakdowns** (tabs, `tab` parameter): products (with quantity), categories (with full path),
  customers, zones (city) and **no movement** (active products without sales in the period, with their
  stock). Totals on top: net sales, cost, margin, margin % and number of orders. Chart of the last 12
  months (hand-made SVG in `components/reports/monthly-chart.tsx`, summed in SQL).
- **Margin**: against `sale_items.unit_cost`, the **snapshot of the last purchase cost** when the order
  was made (`latestCosts` in `lib/cost-queries.ts`, the most recent among the product's suppliers).
  This way a month's margin does not move when a cost goes up. Lines without a cost add to the sale
  but **not to the margin** and are reported separately ("no cost").
- **Returns**: non-voided return credit notes subtract as `kind: "return"` lines (`getReportLines`, by
  the **note's date**, not the order's, so closed months do not move), with the original order's price
  and cost. `RESTOCK` reverses sale **and** cost (the margin only drops by the profit that is lost);
  `WRITE_OFF` reverses the sale but **not the cost**: the goods were lost and the loss stays in the
  margin (it can give a negative margin). They do not add orders, do not count as a sale in "no
  movement", and a return of an order from another period also subtracts. Rows, totals, chart and CSV
  are **net of returns**; in the totals a "Returns" card shows what was subtracted.
- **CSV** at `reports/export` (same period and tab).
- Calculations are integers; the margin % is the only floating-point value, and only for display.

## 11. Customers, users and security

**Customer** = the company (CUIT validated with its check digit, legal name, VAT status, price list,
discount, credit limit, term). It has **people** (each can have a user; the email is the login) and
**delivery addresses**. Deactivating a customer also deactivates its people and addresses (soft
delete). Screen: `/admin/customers` and each customer's page.

**Users.** There is no public sign-up. The admin creates a person's user (`CLIENT` if they have a
customer, `ADMIN` if not; drivers and internal admins at `/admin/users`) with a generated password
(`lib/temp-password.ts`) that is shown **only once** and must be changed on first login. The admin also
resets, deactivates or reactivates and unlocks login. An admin does not reset or deactivate
themselves. Changing or resetting the password and deactivating **increment `session_version`**, which
revokes open sessions.

**Defenses, in summary** (each explained in its place):

| Defense                                      | Where                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Login lock (5 failures email+IP, 20 email)   | `lib/login-throttle.ts`, `login_attempts`                                                                      |
| Signed, revocable session, role from the DB  | `lib/session-token.ts`, `lib/auth.ts`                                                                          |
| Permission in every action and route handler | `requirePermission` ([ch. 1](01-architecture.md))                                                              |
| Ownership (the customer only sees their own) | `address.customerId` filters, 404 on others'                                                                   |
| Immutable audit                              | trigger on `audit_logs`                                                                                        |
| Open redirect in `?next=`                    | `safeNextPath`                                                                                                 |
| Formula injection in CSV                     | `lib/csv.ts` prepends `'` to texts starting with `= + - @`                                                     |
| Security headers                             | `next.config.ts` (no iframe, nosniff, HSTS in production; **no CSP yet**, the theme script would need a nonce) |
| Sensitive files behind a session             | `app/media/deliveries/[file]`, `app/media/transfers/[file]`                                                    |

## 12. Uploaded files

- **Product images**: `lib/product-image.ts` (sharp → WebP up to 1200 px, **without EXIF**) in
  `UPLOADS_DIR/products`, served by `app/media/products/[file]`. Up to 5 MB. They are **public**
  (no session: they are the catalog's) and cached forever (`immutable`): each image change generates a
  file with another name.
- **Delivery note signatures and photos**: `lib/delivery-files.ts` in `UPLOADS_DIR/deliveries`. Phone
  photos arrive unshrunk (up to 8 MB); that is why Server Actions accept up to 10 MB (`bodySizeLimit`
  in `next.config.ts`).
- **Transfer receipts**: `lib/transfer-proof-files.ts` in `UPLOADS_DIR/transfers` (image → WebP
  without EXIF, or PDF; up to 5 MB). They are served **with a session** by
  `app/media/transfers/[file]`: the admin sees all of them; a customer only those of their company
  (otherwise, 404). PDFs are downloaded as an attachment.
- In Docker, `UPLOADS_DIR` is the `uploads` volume. **It must be included in the backups** (the backup
  service already does it).
- Names are a random UUID with a `.webp` extension, generated on the server (`randomUUID`), and when
  serving they are validated against a strict pattern (`/^[0-9a-f-]{36}\.webp$/`): a name with `../`
  or anything else returns 404 without touching the disk.

## 13. Admin orders: views, filters and CSV

The admin looks at orders in three ways, all date-range queries (there are no scheduled jobs):

- **By zone** (`/admin/orders`): the orders of the **period** (by default the **Saturday to Friday**
  week, `lib/order-period.ts`, or a free range of up to 93 days) without canceled ones, **grouped by
  city** (`lib/orders-by-zone.ts`, in integers) with totals of weight, volume, payment method and
  amount. The query is `getPeriodOrders` (`lib/orders-by-zone-queries.ts`), **shared** with the CSV
  (`/admin/orders/export`: `;` and decimal comma in Spanish, with a BOM for Excel) and with the
  dashboard widget.
- **All** (`/admin/orders/list`): paginated, with URL filters (`lib/order-filters.ts`): multiple
  statuses, payment, customer, city, product, number, dates and "held for credit". With a chosen
  product, it shows how much of it was ordered.
- **Detail** (`/admin/orders/[number]`): delivery data, items with the snapshot of the time, the
  customer's account with payment collection in the same place, status change and history.

The by-zone view and the CSV accept the same filters except number and dates (`zoneOrderWhere`:
without chosen statuses, it **excludes canceled ones**); the form fields are a shared component
(`components/orders/order-filter-fields.tsx`). The tables' checkboxes are linked to the bulk actions
bar (change status, build picking, build route sheet) with the HTML `form` attribute, so there is no
nested `<form>`.

**Dashboard** (`/admin`): summary of the week, counters, orders held for credit and security events of
the last 24 hours (failed logins, locked, denied access) plus recent audit activity. Permission
`dashboard:read`.
