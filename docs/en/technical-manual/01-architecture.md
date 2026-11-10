# 1. Architecture and conventions

## Stack

| Piece          | What is used                                                                         |
| -------------- | ------------------------------------------------------------------------------------ |
| Framework      | Next.js 16 (App Router) with `cacheComponents: true` and `output: "standalone"`      |
| UI             | React 19, Tailwind CSS 4, bundled Geist fonts (no Google Fonts at build time)        |
| Database       | PostgreSQL 18 (`postgres:18-alpine`)                                                 |
| ORM            | Prisma 7 with the `prisma-client` generator and the `@prisma/adapter-pg` adapter     |
| Authentication | Custom: `bcryptjs` for passwords and `jose` (JWT HS256) for the session cookie       |
| Validation     | Zod 4                                                                                |
| Images         | `sharp` (converts to WebP and strips EXIF metadata)                                  |
| Mail           | `nodemailer` over SMTP, configured with env (optional: without SMTP nothing is sent) |
| Tests          | Vitest (unit) and Playwright (end-to-end, Chromium)                                  |
| Tooling        | npm, Node 22, ESLint, Prettier (with the Tailwind plugin), Husky + commitlint        |
| Deployment     | Docker Compose: Postgres, migrator, app, Caddy (HTTPS) and backups                   |

> **Watch out for Next.js 16.** It has important changes compared to earlier versions (`proxy.ts`
> instead of `middleware.ts`, `cacheComponents`, generated global `PageProps`/`LayoutProps`,
> `next/root-params`). Before using an API you do not know, read the guide in
> `app/node_modules/next/dist/docs/`.

## Repository structure

```
/                          root: documentation and non-functional configuration only
├─ .github/workflows/      ci.yml (PR checks) and release.yml (versions and images)
├─ docs/                   es/ and en/: installation guide and this manual
├─ release-please-*.json   versioning configuration
├─ ROADMAP.md, CLAUDE.md
└─ app/                    ALL the code: npm commands are run here
   ├─ prisma/              schema.prisma, migrations/, seed.ts, seed-demo.ts
   ├─ src/
   │  ├─ app/              routes (App Router)
   │  │  ├─ [lang]/        all pages, prerendered in es and en
   │  │  │  ├─ (shop)/     customer shop: catalog, product, cart, checkout, my orders
   │  │  │  ├─ admin/      admin panel (one folder per screen)
   │  │  │  ├─ delivery/   driver's delivery loading (designed for phones)
   │  │  │  ├─ login/, logout/, change-password/
   │  │  │  └─ [...rest]/  404 with the app's design
   │  │  ├─ api/health/    health check (Docker and CI), no session
   │  │  └─ media/         product images (public) and signatures/photos of delivery notes and receipts (with session)
   │  ├─ components/       components shared by domain (orders, catalog, ui, ...)
   │  ├─ i18n/             language: config, es/en dictionaries, formats
   │  ├─ lib/              business logic (pure and server-side) and its tests
   │  ├─ generated/prisma/ generated Prisma client (not versioned)
   │  └─ proxy.ts          per-request filter (optimistic session + language)
   ├─ e2e/                 Playwright tests
   ├─ deploy/              Caddyfiles and backup script
   ├─ Dockerfile, docker-compose.yml, docker-compose.prod.yml
   └─ .husky/              git hooks (commitlint and format/lint)
```

### `lib/`: where the logic lives

`src/lib` has around 140 files. The rule that organizes them is **separate what is pure from what
touches the database**:

- **Pure** (`lib/cart.ts`, `lib/sale-state.ts`, `lib/account.ts`, `lib/customer-price.ts`,
  `lib/sales-report.ts`, ...): functions without side effects, with no Prisma or Next. They validate
  forms, compute totals, decide transitions. They can be imported from Client Components (for example
  to show live totals) and have their `*.test.ts` next to them.
- **Server-side** (`*-queries.ts`, `*-ledger.ts`, `auth.ts`, `audit.ts`, `db.ts`, ...): they start with
  `import "server-only"` and talk to the database. `*-queries` reads; `*-ledger` writes inside a
  transaction received as a parameter (`tx`), with its locks and its audit.

Example: a customer's price is computed in `lib/customer-price.ts` (pure, tested) and loaded in
`lib/pricing-queries.ts` (`getPricing`, server-only), which the catalog, the cart and the actions use.

**Money and quantities never as `number`.** Amounts travel as strings (`"1234.50"`) or as
`Prisma.Decimal`, and calculations are done in integers with `BigInt` (cents for money, thousandths for
quantities, ten-thousandths for rates). See `lib/cart.ts`, `lib/price.ts`, `lib/account.ts`.

## How a request travels

```
browser ──► proxy.ts ──► app/[lang]/... (Server Components) ──► lib/*-queries ──► Postgres
                │                    │
                │                    └─ <form action={serverAction}> ──► actions.ts ("use server")
                │                                                        ├─ requirePermission(...)
                │                                                        ├─ validate (pure lib + Zod)
                │                                                        ├─ db.$transaction(tx => ... audit(tx))
                │                                                        └─ revalidatePath / redirect
                └─ no session → /login?next=...
```

### 1. `proxy.ts`

It runs on every request (except assets, files with an extension and `/api/health`). It does two
things:

- **Optimistic session filter** (`proxyRedirect` in `lib/routes.ts`): it only verifies the JWT
  signature, without touching the database. No session → `/login?next=...` (the `next` is validated
  against open redirects with `safeNextPath`). With a password pending change → `/change-password`. A
  non-admin trying `/admin` → their home (`homePathFor`: admin to `/admin`, driver to `/delivery`,
  customer to `/`).
- **Language**: public URLs carry no prefix. The proxy rewrites `/login` to `/es/login` (or `/en/...`)
  according to the `APP_LOCALE` variable. A URL that already carries the prefix ends in a 404.

Real authorization is **not** in the proxy: it is in `lib/auth.ts`, which queries the database on every
page and every action.

### 2. Pages (Server Components) and `cacheComponents`

With `cacheComponents: true`, everything that depends on the request (cookies, `searchParams`,
`params`, the database) has to be **inside a `<Suspense>`**. That is why almost all pages have this
shape:

```tsx
export default async function Page({ searchParams }: PageProps<"/[lang]/admin/xxx">) {
  const t = await getT();                       // static text: it is prerendered
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.xxx.title}</h1>
      <Suspense fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}>
        <Content searchParams={searchParams} />  {/* session, URL and DB in here */}
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: Promise<...> }) {
  await getUserWithPermission("xxx:manage");    // permission first
  const data = await db.xxx.findMany(...);
  ...
}
```

If a Server Component uses the current time (`new Date()`, `Date.now()`), it must call
`await connection()` (from `next/server`) first; otherwise Next warns that the time was read during
prerender.

`PageProps<"/route">` and `LayoutProps<"/route">` are global types generated by `next typegen` (run by
`npm run typecheck`). A new route has no types until they are generated.

### 3. Server Actions

Mutations are Server Actions in an `actions.ts` with `"use server"` next to the page. A `"use server"`
file **can only export async functions**: shared constants and types go in `lib/`. Every action follows
the same steps (see `admin/tax-rates/actions.ts`, the simplest example):

1. `const user = await requirePermission("permission")`: always first. An action can be invoked with a
   direct POST, without going through the page.
2. Do not trust what arrives: bound ids are validated (`isCuid`, `parseXxxId`) and the form with the
   pure functions in `lib/` (Zod), with the messages from the action's dictionary
   (`getActionDictionary()`).
3. `db.$transaction(async (tx) => { ... })` with the appropriate locks, the write and
   `audit(tx, {...})` **inside the same transaction**.
4. Expected errors → form state (`{ errors, values }` or `{ error }`). Known Prisma errors are
   translated (`P2002` duplicate, `P2025` does not exist, `P2003` in use); the rest is rethrown. To
   abort a transaction with a message, a local class is used (`class CheckoutError extends
Error {}`) and caught outside.
5. `revalidatePath("/[lang]/admin/xxx", "page")` (with the **internal** route, so it covers both
   languages) or `revalidatePath("/[lang]", "layout")` if the change is visible on many screens; then
   `redirect(...)` if appropriate.

Route Handlers (`route.ts`) are used only for what is not a page: CSV (`orders/export`,
`reports/export`), files (`media/...`) and the health check. They also verify the permission with
`requirePermission`.

## Authentication and session

- **Login** (`[lang]/login`): email (lowercase, unique) and password with bcrypt. Every attempt is
  recorded in `login_attempts`. With 5 failures for the same email and IP, or 20 for the email from any
  IP, login is locked for 15 minutes (`lib/login-throttle.ts`). The admin can unlock.
- **Cookie** `onaks_session`: JWT HS256 signed with `SESSION_SECRET` (minimum 32 characters), httpOnly,
  7 days. It carries the user id, the role, whether the password must be changed and `sv` =
  `users.session_version`.
- **Revocation**: incrementing `session_version` invalidates all of that user's sessions. It is done
  when changing or resetting the password and when deactivating the user.
- **There is no public sign-up**: the admin creates users with a temporary password that is shown only
  once (`lib/temp-password.ts`) and must be changed on first login (`password_must_change`).

`lib/auth.ts` has four functions; use the right one:

| Function                      | Where                         | What it does                                                      |
| ----------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `getCurrentUser(role?)`       | Server Components             | Session user (cached per request), optionally with a role         |
| `getUserWithPermission(perm)` | Server Components             | Same, requiring a permission                                      |
| `requireUser(role?)`          | Server Actions, Route Handler | Always against the database, no cache                             |
| `requirePermission(perm)`     | Server Actions, Route Handler | Same, requiring a permission; if it fails, audits `ACCESS_DENIED` |

All four query the database: a user who is deleted, deactivated or has another `session_version` is
left out even if their cookie is still valid (they are sent to `/logout`, which deletes it).
`ACCESS_DENIED` is only recorded from actions: when rendering, link prefetches would fill the audit log.

## Roles and permissions

Three fixed roles (`UserType`): `ADMIN`, `CLIENT` and `DRIVER`. Permissions are strings and the role →
permissions map is in code, in `lib/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`, `can`). Today:

- **ADMIN**: all the `*:manage`, `sales:read-all`, `catalog:read`, `audit:read`, `dashboard:read`,
  `routes:deliver` (an admin can also deliver), `purchases:manage`, `price-lists:manage`,
  `reports:read`, `payment-settings:manage`, `stock:count` (count inventory from the phone).
- **CLIENT**: `catalog:read` and `sales:create` (buy).
- **DRIVER**: `routes:deliver` (only the stops of their sheets).

Besides the permission, there is **ownership**: a customer only sees orders and addresses of their own
company (`canAccessCustomer`, and queries filter by `address.customerId`). Someone else's order gives a
404, not "access denied", so as not to reveal that it exists.

## Audit

Every data change is recorded with `audit(tx, {...})` (`lib/audit.ts`) **inside the same
transaction**: if the change fails there is no record, and if the record fails the change is rolled
back.

```ts
await audit(tx, {
  action: "UPDATE", // CREATE | UPDATE | DELETE | LOGIN_* | PASSWORD_* | ACCESS_DENIED ...
  actorUserId: user.id,
  entityType: "SALE", // AuditEntity enum: add the value with a migration if it is new
  entityId: sale.id,
  before, // row before (or the part that changes)
  after, // row after
  metadata: { comment }, // free context (reason, stock moved, etc.)
});
```

- It stores the request's IP and user agent (`lib/request-context.ts`: the IP comes from the first
  `x-forwarded-for`, trustworthy only behind Caddy).
- `toAuditJson` (`lib/audit-data.ts`) strips sensitive fields: `passwordHash` is never stored.
- `audit_logs` is **insert-only**: a database trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`. It is
  kept indefinitely. Viewer at `/admin/audit` (permission `audit:read`).
- An order's history (`/admin/orders/[number]`) is built by reading that order's audit.
- Business tables carry `created_by` / `updated_by` (added when each table is touched).

## Languages (i18n)

- One per installation: `APP_LOCALE=es|en`, read at runtime (no rebuild needed). Spanish by default.
  Pages live in `app/[lang]/` and are prerendered for both (`generateStaticParams`).
- Texts in `src/i18n/dictionaries/es.ts` and `en.ts`. **`es.ts` defines the type**: if you add a key
  in `es` and not in `en`, it does not compile. Strings only; variable values with `{x}` and
  `interpolate(t.x, { x })`.
- How to get the texts:
  - Server Components: `getT()` and `getLocale()` from `@/i18n/server` (they read the `[lang]` segment
    with `next/root-params`).
  - Server Actions and Route Handlers: `getActionDictionary()` from `@/i18n/dictionary` (reads
    `APP_LOCALE`).
  - Client Components: they receive the dictionary slice by props (`t={t.priceLists}`).
- Formats for money, numbers, percentages and dates: `formatters(locale)` (`@/i18n/format`). In
  Spanish, decimal comma and `$ 1.234,50`; note that between `$` and the number there is a
  non-breaking space (it does not wrap).
- Zod messages come from the dictionary (the validation functions receive `t`).
- Data (products, units, names) and the app name (`lib/app.ts`) are not translated.

## UI

- **Admin**: side menu by sections defined in `app/[lang]/admin/layout.tsx` (a section appears if it
  has any screen). On phones it is a panel with ☰. The installed version is shown at the bottom.
- **Theme** light / dark / system (system by default), stored per browser in `localStorage`. An inline
  script (`lib/theme.ts`) sets `data-theme` on `<html>` before painting. For per-theme styles: the
  Tailwind `dark:` variant.
- **Phones**: screens use `p-4 sm:p-8`; every table goes inside
  `<div className="overflow-x-auto print:overflow-visible">`. Voucher numbers, with
  `whitespace-nowrap`.
- **Printing**: `print:hidden` on what does not go on paper (menu, filters, buttons). On paper the theme
  is always light. There are dedicated print views (`[number]/print`) for route sheets, POs and
  payment orders.
- Base components in `components/ui/`: `Field`, `Input`, `FormError`, `SubmitButton` (`form.tsx`),
  `buttonClass()` (`button.ts`), `DeleteButton` (delete with confirmation), `PrintButton`.
- `usePathname()` returns the internal route (`/es/...`) when prerendering: normalize with
  `stripLocalePrefix`.

### Forms: the detail that causes the most mistakes

React resets a `<form action={...}>` after every action. Consequences:

- **Simple forms** (text, no live calculations): `<form action={formAction}>` with `useActionState` and
  `defaultValue`. If the action returns an error, it also returns `values` and the form shows them
  again (`state.values ?? defaultValues`). For an uncontrolled `<select>`, add `key={value}` so that it
  takes the new value. Example: `admin/tax-rates/tax-rate-form.tsx`.
- **Forms with selects that change other fields or live totals**: **controlled** fields with
  `useFieldValues` and `onSubmit={submitWithoutReset(action)}` (`components/ui/use-field-values.ts`),
  which submits the form without the reset. Otherwise an error wipes what was typed and a controlled
  select goes back to its first option. Examples: `components/orders/new-order-form.tsx`,
  `admin/price-lists/fixed-prices-form.tsx`.

## Code conventions

- **Language**: code, comments, names, commits and PRs in English; UI texts in Spanish.
- **Comments**: they explain the why (a business rule, a lock, an odd case), they do not repeat the
  code. Look at how the surrounding ones are written and follow the same density.
- **Table names** in snake_case with `@@map`/`@map`; Prisma models and fields in camelCase.
- **No physical deletion** of business data: soft delete (`deleted_at`), deactivate (`is_active`) or
  void with a reason (`voided_at`/`annulled_at`). What is really deleted is what was never used (a tax
  rate with no products, a price list with no customers).
- **Format**: Prettier (with Tailwind class ordering) and ESLint; the pre-commit hook runs them.
- **Commits**: Conventional Commits (commitlint). See [chapter 3](03-production.md#versions).
- **Documentation**: it is kept in two languages, Spanish in `docs/es/` and English in `docs/en/`, with
  the same structure. When something changes in a document, update both versions in the same PR.
