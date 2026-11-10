# 6. Testing

There are two levels, plus the static checks:

| Level            | Tool                         | What it tests                                                                 | Where              | How long |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------- | ------------------ | -------- |
| Static           | TypeScript, ESLint, Prettier | Types, style, common mistakes                                                 | all of `app/`      | seconds  |
| Unit             | Vitest                       | Pure logic in `lib/`: calculations, validations, rules                        | `src/**/*.test.ts` | ~1 s     |
| End-to-end (e2e) | Playwright                   | Full flows with a real browser, the compiled app and a database with the demo | `e2e/`             | ~40 s    |

The philosophy: **business logic lives in pure functions and is tested thoroughly with cheap unit
tests; e2e tests cover the flows end to end** (that the pieces talk to each other properly, the
permissions and the transactions). There are no integration tests of isolated Server Actions and no
Prisma mocks: whatever touches the database is tested in e2e.

## Before opening a PR

From `app/`, the same thing CI runs:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test
npm run build            # if you touched routes, config or something on the server
npm run test:e2e         # if you touched a flow (see "Running them" below)
```

The pre-commit hook already runs `format:check` and `lint`, but only when the commit touches `app/`.

## Unit tests (Vitest)

Configuration: `vitest.config.ts`, `node` environment, includes `src/**/*.test.ts`, with the `@` →
`src/` alias. There are ~60 files and ~470 tests. They are run with `npm test` (one pass) or, while
developing, `npx vitest` (watch mode) or `npx vitest run src/lib/credit.test.ts` (one file).

### What is tested and what is not

- **Tested**: everything in `lib/` that is **pure**: money and quantity calculations (`cart`, `price`,
  `customer-price`, `account`, `credit`, `sales-report`), status rules (`sale-state`), form parsing and
  validation (`tax-rate`, `customer`, `price-list`, `admin-order`, `checkout`, ...), ordering and
  search (`picking`, `catalog`), filters from the URL (`order-filters`, `order-period`), the session
  (`session-token`), CSV, the login lock, permissions (`permissions`).
- **Not unit tested**: the `*-queries.ts` and `*-ledger.ts` files (they talk to Prisma and are marked
  `server-only`), nor pages and actions. e2e covers that. That is why it pays to **extract the
  decision into a pure function** and keep the server file as thin as possible.

### How they are written

The `*.test.ts` goes **next to** the file it tests. Project style:

```ts
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { percentToFraction, validateTaxRateForm } from "./tax-rate";

const t = es.taxRates.errors; // messages come from the real dictionary

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("percentToFraction", () => {
  it("convierte porcentajes con coma o punto", () => {
    expect(percentToFraction("10,5")).toBe("0.1050");
  });

  it("rechaza lo que no entra en la columna", () => {
    expect(percentToFraction("100,01")).toBeNull();
  });
});
```

Conventions:

- Descriptions **in Spanish, as a sentence** (`it("retiene si lo que debe con el pedido nuevo supera el
límite")`): it reads like a specification.
- **Money edge cases**: rounding (half up), quantities with 3 decimals, the sign, zero, the column's
  maximum. Results are compared as a **string** (`"1234.50"`), never with `toBeCloseTo`: if an amount
  needs tolerance, there is a bug.
- **Validation tests use the real dictionary** (`es.xxx.errors`), so if a message changes or a key is
  renamed, the test notices.
- **Domain example data**: a distributor of food and pet supplies (15 kg dog food, cat litter, rubber
  ball, "Pet Shop Patitas"). Use those same names so tests read alike.
- For functions that depend on time, **receive `now` as a parameter** (with default `new Date()`) and
  fix it in the test. The only exception is session expiry (`session-token.test.ts`), which uses
  `vi.useFakeTimers()` because expiry is resolved by the `jose` library.
- No mocks: if a function needs to mock something, it is a sign that it mixes logic and data access.

## End-to-end tests (Playwright)

They walk through the app like a person, with **Chromium**, against the **compiled** app (`next
start`) and a **fresh database with the seed demo**. Each file is a flow:

| File                  | Flow                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-order.spec.ts` | The admin enters an order for a customer (with their price list) and the customer sees it as "The distributor"                                            |
| `credit.spec.ts`      | A customer exceeds the credit limit: the order is held, does not advance and the admin approves it                                                        |
| `delivery.spec.ts`    | Picking with a shortage, route sheet, stop from the phone with partial delivery and payment, and closing                                                  |
| `permissions.spec.ts` | Customer and driver do not enter the admin; a customer does not see another company's orders; without a session, to the login                             |
| `price-lists.spec.ts` | The admin builds a list with a fixed price, assigns it to a customer with a discount and the customer sees their price                                    |
| `purchases.spec.ts`   | Purchase order, receipt of less, invoice without differences and payment order                                                                            |
| `reports.spec.ts`     | Sales and margin report of the month, by customer, "no movement" and CSV                                                                                  |
| `favorites.spec.ts`   | Company favorites with the heart and the filter, "add all", what they ordered most and repeating an order (from the list and from the detail)             |
| `returns.spec.ts`     | Return of the delivered order (one bag to stock and another written off), adjustment by amount, what reports subtract, voids and what the customer sees   |
| `shop.spec.ts`        | The customer builds the cart, confirms the order and sees it in "My orders"                                                                               |
| `lots.spec.ts`        | Product with expiry: receipt split into two lots, order leaving from the one that expires first, lot change in picking, manual entry with lot and notices |
| `notices.spec.ts`     | Email notice when an order is entered (SMTP to a closed port: it stays queued with its error and is retried) and WhatsApp button with the message built   |
| `stock-count.spec.ts` | Count of a warehouse: unknown code, scans that add up, whole unit, review with a difference and adjustment in the history                                 |
| `transfer.spec.ts`    | Payment details, transfer order with receipt, rejection with a reason, second receipt and payment validation                                              |

### Rules of the game

- **They run one at a time** (`workers: 1`, no parallelism) and **on a fresh database**: they share the
  database and each flow leaves data. They depend on the demo orders (**#1 to #4**) and on the users
  `admin`, `reparto`, `patitas`, `sanroque`, `varela` (`demo1234`).
- **Order matters**: Playwright runs files in alphabetical order. `reports.spec.ts` expects
  `delivery.spec.ts` to have already delivered order #3 (the month's sale comes from there),
  `returns.spec.ts` also starts from #3 already delivered and with its payment, and `credit.spec.ts`
  sets a limit on Mascotas Varela. If you add a spec, think about what data it leaves and what data it
  needs.
- **A spec that modifies something in the demo** (a limit, a list) does not undo it: it assumes a fresh
  database per run.

### Running them locally

With a Postgres running (for example `docker compose up -d db`), in `app/`:

```bash
# 1. Fresh database with migrations and demo (deletes whatever is in that database).
export DATABASE_URL="postgresql://onaks:admin@localhost:5432/onaks_e2e?schema=public"
npx prisma migrate reset --force
SEED_DEMO=true npx prisma db seed

# 2. Build and run (Playwright starts `npm run start` by itself).
npm run build
SESSION_SECRET=a-key-of-at-least-32-characters APP_LOCALE=es npm run test:e2e
```

The first time: `npx playwright install chromium`. Variants:

- Against an app that is already running: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
- See the browser: `npm run test:e2e -- --headed` or `--ui`. A single file:
  `npm run test:e2e -- e2e/credit.spec.ts`.
- If it fails, the report with screenshots and the trace is left in `playwright-report/` and
  `test-results/` (`npx playwright show-report`).
- **Before repeating a full run, recreate the database**: the flows are not repeatable on the same
  database (an order already delivered, a limit already set).

### How to write a new one

The configuration is in `playwright.config.ts` (locale `es-AR`, Argentina time zone, trace and
screenshot on failure, one retry only in CI). The helpers are in `e2e/helpers.ts`:

| Helper                  | What it is for                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `login(page, user)`     | Logs in with the login form as a demo user.                                                    |
| `pageAs(browser, user)` | Another page with its own context and session: to test two users at once (admin and customer). |
| `numberFromUrl(url)`    | The order number from a URL (`/orders/12`).                                                    |
| `ready(page)`           | Waits for `networkidle`: **mandatory before touching a form with controlled fields**.          |

Rules that avoid flaky tests:

1. **Selectors by role and visible text** (`getByRole`, `getByLabel`, `getByText`), as a person would
   use them. No CSS classes or `data-testid`.
2. For a `<select>`: `getByRole("combobox", { name })`. `getByLabel` on a label that wraps the select
   includes the options' text and does not find what you are looking for.
3. **`await ready(page)` before typing** in forms with controlled state (the ones that use
   `useFieldValues`): otherwise React hydration overwrites what was typed.
4. **The `$` and the number are separated by a non-breaking space** (U+00A0) in the money format. To
   match text with a regex, use `\s` between `$` and the amount (`/de \$\s100\.000,00/`); with
   `toContainText("$ 1.633,50")` it works because Playwright normalizes spaces.
5. A `role="alert"` **replaces** a link's role: if a `<Link>` has `role="alert"`, it is no longer
   found with `getByRole("link")`.
6. **With an optimistic UI** (the favorites heart changes instantly), wait for the server response
   before navigating or the request is canceled: `const saved = page.waitForResponse((r) =>
r.request().method() === "POST"); await button.click(); await saved;`.
7. **Navigation between screens.** Next keeps the previous screen mounted, hidden, and a click that
   Playwright resolved on a link of the screen that is leaving **sticks to that element**: if
   navigation completes in the middle of the click, it retries until the test timeout (60 s) with
   "element is not visible". It happens when the next step looks for something that exists on both
   screens (for example "View customer account", which is on the order and on the customer). To chain
   screens, navigate with `page.goto(href)` (full load, no hidden screens) or first wait for something
   **unique to the new screen** (`toHaveURL` and a heading) before the next click.
8. Assertions use the demo's numbers; if you change the demo, review the specs.
9. Each spec tells **one flow**, with comments that explain which demo data it uses and why.

## Continuous integration

PRs to `main` run, in this dependency order (see [chapter 3](03-production.md#github-actions)):

1. `conventional-commits`: commitlint on commits and PR title.
2. `app-checks`: `format:check`, `lint`, `typecheck`, `test`, **migrations + seed** against a Postgres
   18, schema **drift check** and `build`.
3. `docker`: validates the production compose and the Caddyfiles, builds the images, starts the stack
   and waits for the health check.
4. `e2e`: Postgres 18 as a service, migrations and seed **with the demo**, `build`, `playwright
install --with-deps chromium` and `npm run test:e2e`. If it fails, it uploads `playwright-report/`
   and `test-results/` as an artifact (7 days).
5. `ci-ok`: the only **required** check; it fails if any of the previous ones failed.

The `app/` jobs only run if the PR touches `app/`. A documentation PR goes only through the two checks
that do not depend on the code.

## Testing by hand

To validate a UI change, besides the tests:

- Start the demo (`SEED_DEMO=true`) and log in with the `*@demo.onaks.local` users.
- Test **on a phone** (375 px width) the customer and delivery screens, **in both themes** (light and
  dark) and **in both languages** (`APP_LOCALE`).
- Print (or the print preview) the screens with `print:hidden`.
- For the shop, a customer with a price list (Mascotas Varela) and another without one (Patitas) see
  different prices: it is a good contrast for any price change.
