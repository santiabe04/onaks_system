# Onaks System technical manual

This manual is for whoever is going to program on the system. It explains what it is, how it is built,
how to run it in development and in production, how it is tested and how each part works inside. By the
end you should be able to add a screen, a flow or a table following the same rules as the rest of the
code.

Onaks System is a B2B ordering system for a distributor in the south zone of Greater Buenos Aires (the
first customer sells food and pet supplies). Customers are companies that buy from a web catalog; the
distributor prepares, delivers, collects payments and restocks from an admin panel; drivers load their
deliveries from their phones.

> The Spanish version of this manual lives in [`docs/es/manual-tecnico/`](../../es/manual-tecnico/README.md).
> Both versions are kept in sync: when something changes, update both.

## Chapters

1. [Architecture and conventions](01-architecture.md): stack, repository structure, how a request
   travels, authentication, permissions, auditing, languages, UI and the code rules.
2. [Development environment](02-development.md): requirements, environment variables, local database,
   demo data and day-to-day commands.
3. [Production, versions and CI/CD](03-production.md): Docker images, production compose, HTTPS,
   backups, updates, release-please and the GitHub workflows.
4. [Database](04-database.md): model, conventions, migrations, constraints, insert-only ledgers,
   transactions and lock order.
5. [How each module works](05-modules.md): catalog and prices, cart and orders, statuses, stock,
   customer account and credit, picking, delivery, purchasing, reports, users and security.
6. [Testing](06-testing.md): unit tests, end-to-end tests and what CI runs.
7. [How to program on the system](07-development-guide.md): step-by-step recipes (new screen,
   migration, Server Action, form, permission, text) and the PR checklist.

## Other documents

- [`docs/en/installation.md`](../installation.md): operational guide to install on a server (for whoever
  installs, not for whoever programs). Chapter 3 summarizes it and explains what is behind it.
- [`app/e2e/README.en.md`](../../../app/e2e/README.en.md): how to run and write the end-to-end tests.
- [`ROADMAP.md`](../../../ROADMAP.md): project phases, what is done and the definitions of each one
  (Spanish only).
- [`CLAUDE.md`](../../../CLAUDE.md): dense summary of the project context (used by code assistants; also
  a quick reference for file and function names; Spanish only).

## Quick glossary

| Term               | What it is                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Customer / company | `customers`: the company that buys (CUIT, legal name). Has people and addresses.          |
| Person             | `persons`: someone from the customer (or an internal user). May have a user to log in.    |
| Order              | `sales`: what a customer confirms (or the admin enters for them), with its number `#N`.   |
| Zone               | The city (`cities`) of the delivery address.                                              |
| Picking            | List to take the goods out of the warehouse before dispatch.                              |
| Route sheet        | `route_sheets`: a driver's run with its stops (`route_stops`).                            |
| PO / RR            | Purchase order to the supplier / receiving report of what arrived.                        |
| PmtOrd / CN        | Payment order to the supplier / supplier credit note.                                     |
| Ledger             | Insert-only table that records movements (stock, audit).                                  |
| Credit hold        | Confirmed order waiting for the admin to approve it (over the limit or has overdue debt). |
