# 7. How to program on the system

Step-by-step recipes for the most common changes, the PR checklist and the mistakes that repeat the
most. Each recipe names a **real model file** in the repository: open it and copy its structure
instead of inventing a new one.

## Workflow

```bash
git switch main && git pull
git switch -c feat/what-i-am-doing    # trunk-based: never work on main
cd app && npm install                 # if package-lock.json changed
# ... program ...
npm run format && npm run lint && npm run typecheck && npm test
git commit -m "feat(orders): add something"   # Conventional Commits, in English
```

One PR = one coherent change, with squash merge (the PR title is the commit). Titles that start with
`feat` or `fix` (and touch `app/`) produce a release; `docs`, `test`, `chore`, `ci` and `refactor` do
not.

## Recipe 1: a new admin screen (CRUD)

**Model to copy:** `app/[lang]/admin/tax-rates/` (the simplest) or `admin/price-lists/` (with detail).

Files, in this order:

1. **Schema** (`prisma/schema.prisma`) and migration. See [recipe 3](#recipe-3-a-migration).
2. **Permission** if a new one is needed. See [recipe 4](#recipe-4-a-new-permission).
3. **Pure validation** in `lib/<thing>.ts` + `lib/<thing>.test.ts`:

   ```ts
   export type TaxRateValues = { name: string; percent: string; isActive: boolean };   // what was typed
   export type TaxRateFormState = {
     errors?: Partial<Record<keyof TaxRateValues | "form", string[]>>;
     values?: TaxRateValues;                                // to show the form again
   };

   export function validateTaxRateForm(formData: FormData, t: Messages) {
     const values = { name: get("name"), ... };
     const parsed = taxRateSchema(t).safeParse(values);     // Zod, with dictionary messages
     if (parsed.success) return { ok: true as const, data: parsed.data, values };
     return { ok: false as const, state: { errors: z.flattenError(parsed.error).fieldErrors, values } };
   }
   ```

4. **`actions.ts`** (`"use server"`): `create`, `update`, `delete`. Each one follows the recipe in
   [chapter 1](01-architecture.md#3-server-actions): `requirePermission` → validate →
   `db.$transaction` with `audit(tx, ...)` → translate Prisma errors → `revalidatePath` + `redirect`.
5. **Form** (`<thing>-form.tsx`, `"use client"`) with `useActionState` (see "Forms" in
   [chapter 1](01-architecture.md#forms-the-detail-that-causes-the-most-mistakes)). Texts arrive by
   props (`t={t.taxRates}`).
6. **Pages**: `page.tsx` (list), `new/page.tsx`, `[id]/edit/page.tsx`. The shape of each is the one in
   [chapter 1](01-architecture.md#2-pages-server-components-and-cachecomponents): static shell +
   `<Suspense>` + an async component that asks for the permission (`getUserWithPermission`) and reads
   the database. `generateMetadata` with the title from the dictionary.
7. **Menu** (`app/[lang]/admin/layout.tsx`): a `{ href, label }` in the right section, with the text
   in `t.adminNav`.
8. **Texts** in `es.ts` **and** `en.ts` (see [recipe 5](#recipe-5-a-new-text-or-a-language)).
9. **Audit entity**: if it is a business table, add the value to the `AuditEntity` enum
   (`ALTER TYPE "AuditEntity" ADD VALUE '...'` in the migration) **and** its label in
   `audit.entities` of both dictionaries; if it is missing, `tsc` fails (the audit viewer and the
   dashboard index that object with the enum).
10. **Tests**: unit tests of the validation and, if it is an important flow, an e2e spec.
11. **Docs**: an entry in `CLAUDE.md` and the status in `ROADMAP.md`.

**CRUD rules:** no physical deletion of what has history (deactivate or void with a reason); delete
only what was never used, translating the `P2003` error (foreign key in use) into a message. Show the
"Delete" button disabled with the reason when it is already known that it cannot be done
(`DeleteButton`, `disabledReason`).

## Recipe 2: a business operation with a transaction

It is what a "ledger" does: it changes data that depends on other data and cannot be left half done.
Models to copy: `lib/credit-ledger.ts` (short), `lib/stock-ledger.ts` and
`lib/sale-state-change.ts` (complete).

```ts
// lib/something-ledger.ts   ("server-only"; receives the transaction, does not open one)
export async function doSomething(tx: Prisma.TransactionClient, input, userId: string) {
  await lockAccount(tx, customerId);                       // 1. lock, in the order from chapter 4
  const [row] = await tx.$queryRaw<...>`SELECT ... FOR UPDATE`;
  if (!row) throw new SomethingError("notFound");          // 2. validate against what is LOCKED
  await tx.thing.update({ ... });                          // 3. write
  await audit(tx, { action: "UPDATE", actorUserId: userId, entityType: "THING", entityId, before, after, metadata });
  await recomputeAccount(tx, customerId);                  // 4. recompute what is derived
}
```

```ts
// actions.ts
try {
  await db.$transaction((tx) => doSomething(tx, parsed.data, user.id));
} catch (error) {
  if (error instanceof SomethingError) return { error: t[error.code] };
  throw error; // the unexpected is rethrown
}
revalidatePath("/[lang]", "layout");
```

Rules:

- The ledger function **receives `tx`**: that way another operation can call it inside its own
  transaction (picking calls `applySaleStateChange`; checkout calls `applyCreditCheck`).
- **A single function changes each derived datum**: the stock balance is changed only by
  `recordMovement`; an order's status, only by `applySaleStateChange`; the payment status, only by
  `recomputeAccount`. If you need to do the same from somewhere else, **call the existing function**.
- If the calculation is not trivial, **the decision goes in a pure function** (`lib/credit.ts`) and the
  ledger only applies the result.
- A transaction can fail with a deadlock if you break the lock order: check the table in
  [chapter 4](04-database.md#lock-order-mandatory).

## Recipe 3: a migration

```bash
# 1. Edit prisma/schema.prisma
# 2. See the SQL Prisma would generate against your local database:
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# 3. Create the folder prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql with that SQL,
#    plus what Prisma does not generate (checks, backfills, triggers, enum values).
# 4. Apply and regenerate the client:
npm run db:deploy && npx prisma generate
# 5. Verify there is no drift left (it must finish with no differences):
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

(`npm run db:migrate -- --create-only --name x` does steps 2-3 for you if you have permission to create
the shadow database.) The migration rules are in [chapter 4](04-database.md#rules).

Always think: **what happens to the rows that already exist?** A new `NOT NULL` column is added
nullable, filled with an `UPDATE` that makes business sense and only then made `NOT NULL`. Try it on
the demo and on a database with real orders (or at least with the demo ones already processed).

If you add a column that the seed or the demo insert, **update `prisma/seed-demo.ts`** (it uses
relative paths, not the `@/` alias, because it runs in the `migrator` image).

## Recipe 4: a new permission

1. `lib/permissions.ts`: add the string to `PERMISSIONS` and to the `ROLE_PERMISSIONS` of the right
   role. Convention: `<resource>:<action>` (`price-lists:manage`, `reports:read`).
2. `lib/permissions.test.ts`: adjust the expectations. It has tests that list **exactly** the
   permissions of `CLIENT` and `DRIVER`; if you add one to those roles, they have to be updated on
   purpose.
3. Use it: `getUserWithPermission("...")` in the page and `requirePermission("...")` in every action
   and route handler. **Both**: the page protects the view, the action protects the operation.

## Recipe 5: a new text or a language

1. Add the key in `src/i18n/dictionaries/es.ts` (it defines the type) **and** in `en.ts` (it does not
   compile if missing).
2. Use it: `t.section.key` with `const t = await getT()` in a Server Component; `getActionDictionary()`
   in actions and route handlers; by props in Client Components (pass only the slice they use).
3. With variable values: `"Pedido {number}"` and `interpolate(t.x, { number })`.
4. Money, numbers, percentages and dates: **always** `formatters(locale)`; no loose `toLocaleString`.
5. Business data (products, units, names) and the app name are **not translated**.

To add a language (today `es` and `en`): add it to `LOCALES` and to `INTL_LOCALE` in `i18n/config.ts`,
create the dictionary with the type of `es` and register it in `DICTIONARIES` of
`i18n/dictionary.ts`. An invalid `APP_LOCALE` **breaks on purpose** (it does not fall back to the
default language) so that the configuration error is noticed.

## Recipe 6: a new query or report

- **Build the query** in `lib/<thing>-queries.ts` (`"server-only"`) and the calculations in
  `lib/<thing>.ts` (pure).
- Sums of money or quantities: **in SQL with `SUM(ROUND(...))`** if there are many rows (like the
  12-month chart) or **in the app with BigInt** if there are few (like `summarizeBy`). Never with
  `number`.
- Period dates: `parseOrderPeriod` / `parseReportParams` convert `?from=&to=` into a `[start, end)`
  range in Argentine time. A `to` is **inclusive** in the URL and **exclusive** in the query.
- **CSV**: a route handler (`route.ts`) with `requirePermission`, which reuses **the same query** as
  the screen (so the screen and the file do not contradict each other) and builds the file with
  `toCsv` / `csvNumber` (`;` and decimal comma in Spanish; BOM for Excel; neutralizes formulas). Model:
  `admin/reports/export/route.ts`.
- A printable view: a `[number]/print/` folder with `print:hidden` on what does not go on paper.

## Recipe 7: a customer screen

They go in `app/[lang]/(shop)/`. Differences with the admin:

- Permission `catalog:read` (view) or `sales:create` (buy).
- **Ownership**: always filter by the user's company (`user.customerId`) and return 404, not 403, for
  something that is not theirs.
- Prices: `getPricing` + `customerPrice` (see
  [module 2](05-modules.md#2-customer-price-lists-and-discounts)).
- Think **phone first**: big buttons, tables with their own scroll, `p-4 sm:p-8`.

## Recipe 8: an e2e spec

See [chapter 6](06-testing.md#how-to-write-a-new-one). Summary: one flow per file, demo users, selectors
by role, `ready(page)` before touching controlled forms, and think about what data it leaves for the
specs that run afterwards (alphabetical order).

## PR checklist

- [ ] The branch starts from an up-to-date `main` and the PR title is a Conventional Commit in English.
- [ ] `npm run format:check`, `lint`, `typecheck` and `npm test` pass; `build` and e2e if you touched
      routes or flows.
- [ ] Every action starts with `requirePermission`; every page with `getUserWithPermission` /
      `getCurrentUser`.
- [ ] Every data change is audited **in the same transaction**.
- [ ] Money and quantities without `number` (BigInt or `Decimal` as string).
- [ ] If you touch orders, customer account or stock: **lock order** respected and the datum's "owner"
      function used (not a loose `update`).
- [ ] Texts in both dictionaries; formats with `formatters`.
- [ ] A new table: migration + `AuditEntity` + labels + seed/demo if applicable; no drift.
- [ ] Tested on a phone, in dark theme and (if there is new text) in English.
- [ ] Unit tests for what is pure; e2e if a flow changes.
- [ ] `CLAUDE.md` and `ROADMAP.md` up to date; this manual if something it explains changes (both
      languages: `docs/es/` and `docs/en/`).

## Frequent mistakes

| Symptom                                                                                  | Cause and fix                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc` does not see a new Prisma field                                                    | `npx prisma generate` is missing after changing the schema.                                                                                                     |
| `PageProps<"/[lang]/admin/xxx">` "does not satisfy the constraint"                       | The route is new: run `npm run typecheck` (it runs `next typegen`).                                                                                             |
| Next warns that the time is read during prerender                                        | A `new Date()` in a Server Component: call `await connection()` first.                                                                                          |
| "Uncached data was accessed outside of `<Suspense>`"                                     | Reading the session, `searchParams`, `params` or the database has to be inside a `<Suspense>`.                                                                  |
| A `"use server"` file breaks the build                                                   | It can only export async functions: constants and types go to `lib/`.                                                                                           |
| The form loses what was typed or the select goes back to the first option after an error | A form with controlled fields without `submitWithoutReset` (see chapter 1).                                                                                     |
| The e2e spec types and the field stays empty                                             | `await ready(page)` is missing: hydration overwrote what was typed.                                                                                             |
| An amount shows as `1234.5` or with extra decimals                                       | It went through `number`: use `format.money(...)` with the original string/`Decimal`.                                                                           |
| `Unique constraint failed` when creating something                                       | Catch `P2002` in the action and return the field's message (do not let it be a 500).                                                                            |
| `violates check constraint "stock_movement_direction_chk"` when moving stock             | A new movement type that is not in that CHECK: see [chapter 4](04-database.md#insert-only-ledgers).                                                             |
| An e2e spec hangs 60 s on a click ("element is not visible"), only in CI                 | Click tied to the previous screen's link, which Next leaves hidden: navigate with `page.goto(href)` or wait for something unique to the new screen (chapter 6). |
| An e2e spec fails with "strict mode violation" on a label that looks unique              | Next keeps the previous screen mounted (hidden): filter with `.filter({ visible: true })`.                                                                      |
| Deadlock between two operations                                                          | Different lock order: follow the table in chapter 4.                                                                                                            |
| The seed fails in the `migrator` image but works locally                                 | It imports something with the `@/` alias or something outside `prisma/` and `src/lib/`.                                                                         |
| A `revalidatePath` change "is not seen" in English                                       | Use the internal route with `[lang]` (`"/[lang]/admin/xxx"`), not the public URL.                                                                               |
| CI fails with "drift"                                                                    | The schema and the migrations do not match: run step 5 of [recipe 3](#recipe-3-a-migration).                                                                    |

## Where to keep reading

- The **code of an already built module** is the best documentation: pick the one most similar to what
  you are going to do (table in [recipe 1](#recipe-1-a-new-admin-screen-crud)) and follow it.
- [`ROADMAP.md`](../../../ROADMAP.md) has the context and definitions of each phase: why each thing
  was decided (Spanish only).
- The system's audit (`/admin/audit`) is a good way to understand what each screen does: try the
  action on the demo and look at what was recorded.
