# End-to-end tests (Playwright)

> Spanish version: [`README.md`](README.md). Both versions are kept in sync.

They walk through the app the way a person would, with Chromium, against the compiled app and a
database with the **seed demo** (`SEED_DEMO=true`):

| File                  | Flow                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `admin-order.spec.ts` | The admin enters an order for a customer and the customer sees it as "The distributor"              |
| `credit.spec.ts`      | An order that exceeds the credit limit is held, does not advance and the admin approves it          |
| `delivery.spec.ts`    | Picking (with a shortage), route sheet, stop from the phone with partial delivery, and closing      |
| `permissions.spec.ts` | Customer and driver do not enter the admin; a customer does not see another company's orders        |
| `price-lists.spec.ts` | The admin builds a price list with a fixed price, assigns it to a customer and they see their price |
| `purchases.spec.ts`   | Purchase order, receipt of less, invoice without differences and payment order                      |
| `reports.spec.ts`     | Sales and margin report of the month, by customer and no movement, and its CSV                      |
| `favorites.spec.ts`   | Company favorites, what they ordered most and repeating an order                                    |
| `returns.spec.ts`     | Return of the delivered order, adjustment by amount, reports, voids and what the customer sees      |
| `shop.spec.ts`        | The customer builds the cart, confirms the order and sees it in My orders                           |
| `lots.spec.ts`        | Product with expiry: receipt in two lots, FEFO outflow, lot change in picking and notices           |
| `notices.spec.ts`     | Email notice queued with retry (SMTP to a closed port) and WhatsApp button                          |
| `stock-count.spec.ts` | Count of a warehouse: scans that add up, review with a difference and adjustment on approval        |
| `transfer.spec.ts`    | Transfer order with receipt: the admin rejects the first and validates the second                   |

They run one at a time and on a **fresh** database: they depend on the demo's order numbers (#1 to #4)
and each flow leaves data. They run in alphabetical order and some depend on the previous one
(`reports` uses order #3 that `delivery` delivers). In CI the `e2e` job runs them.

## Running them locally

With a Postgres running (for example the one from `docker compose up -d db`), in `app/`:

```bash
# 1. Fresh database with migrations and demo (deletes whatever is in that database).
export DATABASE_URL="postgresql://onaks:admin@localhost:5432/onaks_e2e?schema=public"
npx prisma migrate reset --force
SEED_DEMO=true npx prisma db seed

# 2. Build and run (Playwright starts `npm run start` by itself).
npm run build
SESSION_SECRET=a-key-of-at-least-32-characters APP_LOCALE=es npm run test:e2e
```

The first time you have to download the browser: `npx playwright install chromium`.

The server Playwright starts (`playwright.config.ts`) carries an SMTP pointing to a closed port
(`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`): that way email notices are queued and fail without sending
anything, and `notices.spec.ts` sees them on the order. If you run against an app that is already up
(`E2E_BASE_URL`), it must have that same SMTP.

- To run them against an app that is already up: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
- To watch them in action: `npm run test:e2e -- --headed` or `--ui`.
- If it fails, the report with screenshots and the trace is left in `playwright-report/`
  (`npx playwright show-report`).

## When writing a new one

- Selectors by role and visible text (`getByRole`, `getByLabel`, `getByText`), as a person would use
  them. For a `<select>`, `getByRole("combobox", { name })`: `getByLabel` on a label that wraps the
  select includes the options' text.
- Before touching a form with controlled fields, `await ready(page)` (`helpers.ts`): otherwise React
  hydration overwrites what was typed.
- Users: `login(page, "admin" | "reparto" | "patitas" | "sanroque" | "varela")`; for two users at once,
  `pageAs(browser, ...)` opens another context with its own session.
