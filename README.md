# Northwoods — Invoice Readiness CRM

Northwoods is an internal CRM and deal-management platform that bridges the gap between the sales team and the finance team. Its core purpose is to ensure every closed deal has all the information finance needs before an invoice is generated — replacing ad-hoc spreadsheet handoffs with a structured, auditable workflow.

The system ingests won-opportunity data from the CRM, enriches it with contract and billing details, runs an automated readiness check, and surfaces the results through four purpose-built views: an Action Center dashboard, a Deals list, a Sales Pipeline, and an Invoice register.

---

## Table of Contents

1. [The Problem It Solves](#1-the-problem-it-solves)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [The Core Workflow](#5-the-core-workflow)
6. [The Readiness Checker](#6-the-readiness-checker)
7. [Application Pages](#7-application-pages)
8. [API Reference](#8-api-reference)
9. [Running the Project](#9-running-the-project)
10. [Environment Variables](#10-environment-variables)

---

## 1. The Problem It Solves

When a sales rep closes a deal in the CRM, the information finance needs to send an invoice is rarely all in one place. A typical handoff is missing one or more of:

- When does the contract start?
- What is the exact contracted value (after discounts)?
- Has the customer signed the contract?
- Who should the invoice be sent to?
- What specific products and quantities were sold?

Without a system to enforce completeness, deals sit in limbo, invoices are delayed, and disputes arise because finance reconstructed billing details from incomplete notes.

Northwoods solves this by giving every closed deal a **readiness score** based on six mandatory fields, automatically surfacing what is missing, and blocking a deal from moving to the invoicing stage until it is complete.

---

## 2. Architecture Overview

```
+-------------------------------------+
|   Frontend  (Vite + React 19)       |
|   Apptrack-frontend/                |
|   - Refine data framework           |
|   - React Router v7                 |
|   - Radix UI + Tailwind CSS         |
|   - TanStack Table                  |
+------------------+------------------+
                   | HTTP / REST  (port 5173 -> 8000)
+------------------v------------------+
|   Backend   (Express 5 + TypeScript)|
|   Apptrack-backend/src/             |
|   - Routes: deals, invoices,        |
|     contacts, accounts              |
|   - Readiness checker library       |
|   - Zod request validation          |
+------------------+------------------+
                   | Drizzle ORM + postgres driver
+------------------v------------------+
|   Database  (Neon -- PostgreSQL)    |
|   Tables: accounts, contacts,       |
|   deals, deal_line_items,           |
|   invoices, invoice_issues,         |
|   product_catalog                   |
+-------------------------------------+
```

The frontend and backend are separate Node.js projects under the same repository root. The backend runs on port **8000** and the frontend dev server runs on port **5173** (or the next available port). CORS is configured to allow any `localhost` origin during development and a configurable `FRONTEND_URL` in production.

---

## 3. Tech Stack

### Frontend (`Apptrack-frontend/`)

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| Data / state | Refine v5 (`@refinedev/core`, `@refinedev/react-table`, `@refinedev/react-router`) |
| Routing | React Router v7 |
| UI components | Radix UI primitives + shadcn/ui |
| Styling | Tailwind CSS |
| Table | TanStack Table v8 (via `@refinedev/react-table`) |
| Icons | Lucide React |
| Notifications | Sonner |
| Animations | GSAP (used on the Create Deal form) |
| Form validation | Zod + React Hook Form |

### Backend (`Apptrack-backend/`)

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 + TypeScript |
| ORM | Drizzle ORM v0.45 |
| DB driver | `postgres` (node-postgres compatible) |
| Validation | Zod v4 |
| Dev runner | `tsx --watch` |

### Database

| Property | Value |
|---|---|
| Engine | PostgreSQL (hosted on Neon serverless) |
| Schema management | Drizzle Kit migrations (`npm run db:generate` / `npm run db:migrate`) |
| Connection | `DATABASE_URL` environment variable |

---

## 4. Database Schema

### `accounts`
The canonical customer record. One account can have many deals and many contacts.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `account_name` | text | Company name |
| `account_city` / `account_state` | text | Location |
| `account_industry` | text | Industry vertical |
| `account_size` | text | Free text (e.g. "50-100") |
| `account_status` | text | e.g. "active", "churned" |
| `account_product` | text | Primary product purchased |
| `total_seats` | integer | Total licensed seats |
| `original_purchase_date` | date | First purchase |
| `next_renewal_date` | date | Upcoming renewal |

### `contacts`
People associated with an account. A contact can be flagged as `is_primary_contact` and/or `is_billing_contact`. The billing contact flag is a hard requirement for deal readiness. Contacts carry name, title, email, location, and role.

### `deals`
The central table. Every CRM opportunity becomes a deal row. The deal has two parallel status dimensions:

- **`deal_stage`** — the workflow stage controlled by users (enum: `closed_won`, `needs_info`, `ready_for_invoice`, `invoiced`, `disputed`)
- **`readiness_status`** — computed by the readiness checker after every update (enum: `blocked`, `warning`, `ready`)

Key field groups on the `deals` table:

| Group | Fields |
|---|---|
| CRM opportunity | `opportunity_id`, `opportunity_name`, `opportunity_owner`, `opportunity_type`, `opp_close_date`, `opp_stage_raw` |
| Contract | `contract_start_date`, `contract_term_text`, `total_contract_value`, `contract_attached` |
| Financial | `opportunity_amount_rollup`, `opportunity_term` |
| Snapshots | `account_product_snapshot`, `primary_contact_name_snapshot` (frozen at deal time for audit stability) |
| Pipeline (sales-only) | `pipeline_stage`, `probability`, `next_step`, `forecast_category`, `campaign` |
| Tracker enrichment | `tracker_discount`, `tracker_year_1_price`, `tracker_notes` |
| Readiness diagnostics | `missing_fields` (JSONB array), `warnings` (JSONB array), `finance_research` |

### `deal_line_items`
Normalized line items, one row per purchased product per deal. At least one line item is required for readiness. Each row stores a snapshot of product name and price at deal time so catalog changes do not invalidate historical records. Key fields: `product_name_snapshot`, `sku_id`, `quantity`, `unit_price`, `line_total`, `billing_frequency`, `line_type`, `discount_amount`.

### `invoices`
Actual invoice records, linked back to a deal via `deal_id` and `opportunity_id`. Kept separate from deals because the billed amount and invoice date may differ from the contracted amount and close date. Includes billing address, contact, PO number, payment status and date, and a boolean `is_disputed` flag.

### `invoice_issues`
Disputes or finance review findings tied to an invoice. Has a summary, detail text, source (`customer_email`, `finance_review`, `manual`), and a free-text status field.

### `product_catalog`
SKU catalog with base pricing, seat counts, billing frequency, and discount approval requirements. Used to link deal line items to canonical product records.

---

## 5. The Core Workflow

A deal moves through five **Deal Stages** in order:

```
[Closed Won] --> readiness checker --> [Needs Info]  <-- most deals start here
                                            |
                                   all 6 fields present
                                            |
                                            v
                                   [Ready for Invoice]
                                            |
                                   finance sends invoice
                                            |
                                            v
                                       [Invoiced]
                                            |
                                   customer disputes
                                            |
                                            v
                                       [Disputed]
```

**Stage descriptions:**

1. **Closed Won** — The CRM closed-won state. The deal exists but readiness is not yet verified.
2. **Needs Info** — Default stage for all imported deals. The readiness checker runs and identifies what is missing. This is also where manually created deals begin.
3. **Ready for Invoice** — The system auto-advances a `needs_info` deal here the moment all six readiness requirements are met. A deal can also be manually promoted, but only if readiness is `ready`. The backend enforces a **stage gate** that returns HTTP 400 if you attempt to set `ready_for_invoice` on a `blocked` deal.
4. **Invoiced** — Finance has sent the invoice. An invoice record is linked to the deal.
5. **Disputed** — A customer dispute or finance review finding has been raised against the invoice.

**Readiness status** is re-computed on every write to the deals table. It is also re-computed for all deals on an account whenever a contact on that account changes (add, update, or delete).

---

## 6. The Readiness Checker

The readiness checker lives in `Apptrack-backend/src/lib/readiness.ts`. It is a pure function:

```
computeReadiness(deal, contacts, lineItems) => { readinessStatus, missingFields, warnings }
```

### Blocking Requirements — all six must be met

| # | Requirement | Field(s) checked |
|---|---|---|
| 1 | **Contract start date** | `contract_start_date` must be set |
| 2 | **Contract term** | `contract_term_text` OR `opportunity_term` — at least one must be set |
| 3 | **Contract value** | `total_contract_value` OR `opportunity_amount_rollup` — at least one must be a non-zero number |
| 4 | **Signed contract** | `contract_attached` must be `true` |
| 5 | **Billing contact** | At least one contact on the account must have `is_billing_contact = true` |
| 6 | **Line items** | At least one line item must be attached to the deal |

If any blocking requirement is unmet, `readiness_status = 'blocked'` and the deal cannot move to `ready_for_invoice`.

### Advisory Warnings — deal can proceed, but finance should review

| Warning | Trigger |
|---|---|
| Missing pricing context | `pricing_context` is empty AND the deal has a tracker discount > 0 OR notes contain keywords like "discount", "pilot", "promo", "special pricing" |
| Missing rollout context | `rollout_context` is empty AND a line item name contains "implementation", "migration", or "training" OR notes mention "rollout", "phase", "deployment" |
| Incomplete line item pricing | One or more line items are missing `unit_price` or `line_total` |

Warnings result in `readiness_status = 'warning'`. A deal with only warnings can still be promoted to `ready_for_invoice`.

### Auto-Advance Logic

When the readiness checker is called after an update and the deal transitions from `blocked` to `ready`, the backend automatically promotes the deal's `deal_stage` from `needs_info` to `ready_for_invoice` in the same database write:

```typescript
// autoAdvanceStage() in readiness.ts
if (readinessStatus === 'ready' && currentStage === 'needs_info') {
    return 'ready_for_invoice';
}
return currentStage;
```

No manual action is needed — filling in the last missing field automatically clears the deal from the Needs Info queue and moves it to Ready for Invoice.

---

## 7. Application Pages

### Action Center (Home) — `/`

The first screen users see. A three-column priority inbox that shows exactly what needs attention right now.

```
+------------------+------------------+------------------+
|  Needs Info      |  Ready for       |  Overdue         |
|  (stale)         |  Invoice         |  Invoices        |
|                  |                  |                  |
|  Sorted by how   |  All fields done |  Past due date,  |
|  long the deal   |  -- waiting for  |  still unpaid    |
|  has been stuck  |  finance to act  |                  |
+------------------+------------------+------------------+
```

- **Needs Info column** — deals stuck in `needs_info`, sorted oldest-updated first. Each card shows company, owner, deal value, and up to two missing field name tags (e.g. "contractStartDate", "billingContact"). A `+N` overflow badge appears when more than two fields are missing. Clicking a card navigates to the Deal Detail page.
- **Ready for Invoice column** — deals with all fields complete and waiting for finance to act. Shows the close date and how many days the deal has been waiting since its last update.
- **Overdue Invoices column** — invoices where the due date has passed and payment status is not "paid". Shows the invoice number, account name, billing contact, and how many days overdue. Clicking navigates to the linked deal.

The dark header strip shows live counts for all three categories. Each column has an "All →" link that navigates to the relevant filtered list.

---

### Deals List — `/deals`

A paginated, sortable, filterable table of all deal records. Built with TanStack Table v8 and Refine's server-side data provider.

**Columns:**

| Column | Notes |
|---|---|
| Company | Account name |
| Owner | Opportunity owner (rep name) |
| Close Date | Sortable ascending/descending via the column header dropdown |
| Status | Deal stage badge. Click to open an inline stage-change dropdown |
| Readiness | `blocked` / `warning` / `ready` badge with issue count |
| Value | Total contract value |
| View | Button to open the Deal Detail page |

**Filters:**
- **Search by company** — text input, triggers a server-side `ILIKE` search on account names.
- **Status dropdown** — filter to a specific `deal_stage` or "All Statuses" to see all records.

**Stage transitions:** Selecting a new stage from the inline dropdown calls `PUT /deals/:id`. The backend re-runs the readiness checker and enforces the stage gate. If a blocked deal is moved to `ready_for_invoice`, the request fails, a toast is shown explaining the block, and the badge reverts to its previous state.

---

### Deal Detail — `/deals/:id`

The full record for a single deal. All editable sections write back to the API and re-run the readiness checker.

**Sections:**

**Opportunity** — CRM fields: opportunity name, owner, type, close date, raw CRM stage (`opp_stage_raw`), opportunity notes.

**Contract** — the six finance-critical fields the readiness checker validates: start date, term, signed contract flag (`contract_attached`), and total contract value.

**Account** — company name, location, industry, size, status, primary product, total seats, renewal date.

**Contacts** — all contacts for the account in a table. Actions per contact row:
- Edit name, title, email, location, role
- Toggle **billing contact** flag — immediately triggers `syncReadinessForAccount()` which re-runs readiness for every deal on that account
- Toggle **primary contact** flag
- Delete contact

**Line Items** — what was sold. Each row: product name, SKU, quantity, unit price, line total, billing frequency, line type, discount amount, discount approval notes, description. Add, edit, and delete actions. Every save re-runs the readiness checker.

**Readiness Diagnostics** — shows the current `readiness_status` badge and the full list of `missing_fields` and `warnings` from the last checker run. Each missing field is displayed with its plain-language explanation (e.g. `"billingContact — no contact marked as billing contact for this account"`).

**Finance Research** — a free-text field for the finance team to record investigation notes specific to this deal.

**Invoice History** — all invoices linked to this deal (matched by `deal_id` or `opportunity_id`). Shows invoice number, date, amount, payment status, and due date.

**Pipeline Context (sales-side)** — pipeline stage, probability %, forecast category, next step, campaign. These fields are visible in the detail page but are not used in readiness calculations. They are edited inline on the Pipeline page.

---

### Create Deal — `/deals/create`

A multi-section animated form to add a new deal manually (for deals not in the CRM, or test entries).

**Only the company name is required at creation time.** The readiness checker runs immediately after creation and marks the deal `blocked` until the other fields are filled in — this is expected and correct for a newly created deal.

**Form sections:**

1. **Company** — type-ahead search against existing accounts. If no match, the account is created automatically before the deal is saved.
2. **Opportunity** — name, owner, type, CRM amount (`opportunity_amount_rollup`), close date, CRM stage.
3. **Contract** — start date, term, signed contract flag, total contract value (`total_contract_value`).
4. **Pipeline context** — pipeline stage, probability %, forecast category, next step, campaign.

On submit, the frontend:
1. Searches for an existing account by company name
2. Creates the account if not found
3. Posts the deal with the resolved `account_id`
4. Redirects to the Deals List on success

---

### Sales Pipeline — `/pipeline`

A sales-team-focused view showing pipeline health from a sales funnel perspective. Not tied to finance readiness.

**KPI Cards (top row):** Closed Won total value and count; Open Pipeline value and count; Win Rate (won / (won + lost) × 100); Closed Lost count.

**Owner Leaderboard** — an expandable panel showing each rep's closed-won count, won value, open pipeline count, and whether they have tracker data enriched. Clickable rows filter the deals table to that owner.

**Pipeline Stage Filter Buttons** — six funnel stages displayed as a flow:
```
Prospecting (10%) --> Discovery (20%) --> Demo (40%) --> Proposal (60%) --> Negotiation (80%) --> Closed (100%)
```
Clicking a stage shows only deals in that stage. The filtering is client-side so that deals without a stored pipeline stage (which are assigned one deterministically) are included correctly.

**How deterministic stage assignment works:**
Every deal always shows a coloured pipeline stage badge. If `pipeline_stage` is stored in the database and matches one of the six funnel stages, that value is used. If not — for legacy deals imported from the CRM with no funnel stage set — a simple hash of the deal UUID deterministically picks one of the six stages. The same deal always gets the same stage on every render and every page load. When a rep explicitly sets the stage via inline editing, the saved value takes over permanently and the deterministic fallback is no longer used.

**Search and Owner filter** — text search filters by account name (server-side); owner dropdown filters by opportunity owner (server-side). Both filters send query parameters to the backend and reset the page to 1. The pipeline stage filter is applied after the data is returned, on the client.

**Deals Table** — paginated at 25 rows per page with next/previous navigation. Shows: Company, Owner, Pipeline Stage badge, Prob%, Forecast Category badge, Value, Close Date, Next Step.

**Inline Editing — click any of these cells to edit:**

| Field | Behaviour |
|---|---|
| Pipeline Stage | Dropdown with six funnel stages. Selecting saves immediately. |
| Prob% | Number input (0–100). Saved on Enter or click away. Escape cancels. |
| Forecast Category | Dropdown (Commit / Best Case / Pipeline / Omitted + clear option). Saves immediately on selection. |
| Next Step | Text input. Empty cells show "Click to add…". Saved on Enter or click away. Escape cancels. |

All edits are optimistic — the UI updates instantly before the server responds. A subtle row dim while the PUT request is in flight signals that a save is pending.

---

### Invoices — `/invoices`

The invoice register — a view of all invoice records.

**Stats Strip (top):**

| Stat | Description |
|---|---|
| Total | All invoice records |
| Paid | Invoices with payment status "paid" |
| Outstanding | Invoices that are unpaid and overdue |
| Pending | Invoices not yet due |
| Disputed | Invoices with `is_disputed = true` |

Dollar amounts for paid, outstanding, and total are shown alongside the counts.

**Filters:**
- **Search** — searches invoice number and account name simultaneously
- **Payment status** — dropdown filter for "paid", "unpaid", "overdue", "disputed"
- **Disputed** — toggle to show only disputed invoices

**Invoice Table:** Invoice #, Account, Date, Amount, Payment Status, Due Date, Payment Date, Owner, Billing Contact, PO #.

**Invoice Detail Sheet** — clicking a row opens a slide-over panel with the full invoice record including billing/shipping address, CRM contact info, payment terms, special terms, and any linked `invoice_issues` records with their status.

**Dispute Toggle** — a toggle on each row and in the detail sheet sets `is_disputed` via `PATCH /invoices/:id`. Disputed invoices are highlighted in the table.

**Create Invoice Dialog** — a dialog form to manually create an invoice record, linked to an existing deal by opportunity ID.

---

## 8. API Reference

All routes are prefixed with the base URL (default: `http://localhost:8000`).

### Deals

| Method | Path | Description |
|---|---|---|
| `GET` | `/deals` | Paginated deal list. Params: `page`, `limit`, `search`, `stage`, `owner`, `sort`, `order` |
| `GET` | `/deals/stats` | Counts by `deal_stage` and `readiness_status` |
| `GET` | `/deals/action-center` | Top stale `needs_info` + top `ready_for_invoice` deals for the dashboard |
| `GET` | `/deals/pipeline-stats` | Owner leaderboard, stage breakdown, type breakdown for the Pipeline page |
| `GET` | `/deals/:id` | Full deal with nested account, contacts, and line items |
| `POST` | `/deals` | Create deal. Runs readiness checker. Auto-advances stage if ready. |
| `PUT` | `/deals/:id` | Update deal. Re-runs readiness checker. Enforces stage gate. |
| `POST` | `/deals/:id/line-items` | Add a line item. Re-runs readiness checker. |
| `PATCH` | `/deals/:id/line-items/:lineItemId` | Update a line item. Re-runs readiness checker. |
| `DELETE` | `/deals/:id/line-items/:lineItemId` | Delete a line item. Re-runs readiness checker. |

**Stage Gate on `PUT /deals/:id`:** If `dealStage: 'ready_for_invoice'` is sent and the computed `readiness_status` is `'blocked'`, the server returns:
```json
HTTP 400
{
  "error": "Stage gate: deal cannot move to ready_for_invoice while blocked",
  "missingFields": ["contractStartDate — finance cannot determine billing start", "..."],
  "warnings": []
}
```

### Accounts

| Method | Path | Description |
|---|---|---|
| `GET` | `/accounts` | Search accounts. Param: `search` (matches account name) |
| `POST` | `/accounts` | Create account |
| `PATCH` | `/accounts/:id` | Update account fields |

### Contacts

| Method | Path | Description |
|---|---|---|
| `GET` | `/contacts` | List contacts. Param: `accountId` to filter by account |
| `POST` | `/contacts` | Create contact. Re-runs readiness for all deals on the account. |
| `PATCH` | `/contacts/:id` | Update contact (including billing/primary flags). Re-runs readiness for all deals on the account. |
| `DELETE` | `/contacts/:id` | Delete contact. Re-runs readiness for all deals on the account. |

**Readiness cascade:** Any contact change calls `syncReadinessForAccount()`, which re-runs `computeReadiness()` for every deal on that account and writes the updated `readiness_status` and `missing_fields` back to the database. Adding a billing contact immediately clears the "no billing contact" block on all associated deals.

### Invoices

| Method | Path | Description |
|---|---|---|
| `GET` | `/invoices` | Paginated invoice list. Params: `search`, `status`, `disputed`, `page`, `limit` |
| `GET` | `/invoices/stats` | Aggregated payment stats |
| `GET` | `/invoices/overdue` | Invoices past due date and unpaid (for the dashboard) |
| `GET` | `/invoices/by-deal/:dealId` | All invoices linked to a specific deal |
| `POST` | `/invoices` | Create invoice. Links to deal via `opportunity_id` join. |
| `PATCH` | `/invoices/:id` | Update invoice (status, dispute flag, notes, etc.) |

---

## 9. Running the Project

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon serverless or local). Neon's free tier is sufficient.
- The `psql` CLI is optional but useful for running manual queries or data migrations.

### Backend

```bash
cd Apptrack-backend
npm install

# Add your DATABASE_URL to a .env file:
# DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Push schema to the database (first time or after schema changes)
npm run db:push

# Start the development server (auto-restarts on file change)
npm run dev
# Server runs at http://localhost:8000
```

**Available backend scripts:**

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with `tsx --watch` |
| `npm run db:generate` | Generate Drizzle migration files from schema changes |
| `npm run db:migrate` | Apply pending migration files |
| `npm run db:push` | Push schema directly to DB (development only — skips migration files) |
| `npm run recompute:readiness` | Re-run the readiness checker against all deals and persist results to the database |
| `npm run import:deals` | Import deals from CRM export spreadsheets |
| `npm run import:invoice-register` | Import invoice records from the invoice register spreadsheet |
| `npm run import:product-catalog` | Import the product SKU catalog |
| `npm run import:accounts` | Import account records from customer lists |

### Frontend

```bash
cd Apptrack-frontend
npm install

# Add your backend URL to a .env file:
# VITE_BACKEND_URL=http://localhost:8000

npm run dev
# App runs at http://localhost:5173
```

---

## 10. Environment Variables

### Backend (`Apptrack-backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string, e.g. `postgresql://user:pass@host/db?sslmode=require` |
| `FRONTEND_URL` | No | Allowed CORS origin in production, e.g. `https://northwoods.example.com` |

### Frontend (`Apptrack-frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_BACKEND_URL` | Yes | Full URL of the backend API, e.g. `http://localhost:8000` |

