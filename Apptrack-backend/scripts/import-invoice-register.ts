/**
 * import-invoice-register.ts
 *
 * Reads Full_Invoice_Register.xlsx (Invoice Register sheet) and for each of the
 * 157 rows matched by Opportunity_ID:
 *   1. Sets contract_start_date on the deal from Invoice_Date
 *   2. Upserts a billing contact on the deal's account when Billing_Contact_* is present
 *   3. Recomputes readiness for every deal touched
 *
 * Matching strategy : Opportunity_ID (exact match)
 * Idempotent        : re-running overwrites contract_start_date and is_billing_contact
 *
 * Run:
 *   npm run import:invoice-register
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals, dealLineItems } from "../src/db/schema/deals.ts";
import { accounts, contacts } from "../src/db/schema/accounts.ts";
import { computeReadiness } from "../src/lib/readiness.ts";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FILE =
  "/Users/harshithpeta/Downloads/Day 1 Post Lunch/Full_Invoice_Register.xlsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
  if (v == null) return null;
  const x = String(v).trim();
  return x === "" ? null : x;
}

/** Convert Excel serial date to ISO date string (YYYY-MM-DD) */
function excelDateToISO(serial: number): string {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface RegisterRow {
  opportunityId: string | null;
  accountName: string | null;
  invoiceDate: string | null; // ISO after conversion
  billingContactName: string | null;
  billingContactTitle: string | null;
  billingContactEmail: string | null;
}

function parseRows(wb: import("xlsx").WorkBook): RegisterRow[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets["Invoice Register"]!,
    { defval: null }
  );
  return raw.map((r) => ({
    opportunityId: s(r["Opportunity_ID"]),
    accountName: s(r["Account_Name"]),
    invoiceDate:
      typeof r["Invoice_Date"] === "number"
        ? excelDateToISO(r["Invoice_Date"])
        : s(r["Invoice_Date"]),
    billingContactName: s(r["Billing_Contact_Name"]),
    billingContactTitle: s(r["Billing_Contact_Title"]),
    billingContactEmail: s(r["Billing_Contact_Email"]),
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n📂  Reading: ${path.resolve(FILE)}`);
  const wb = XLSX.readFile(path.resolve(FILE));
  const rows = parseRows(wb);
  console.log(`    ${rows.length} data row(s) found\n`);

  // ── Load all reference data in parallel ─────────────────────────────────
  console.log("🗄️   Loading DB reference data...");
  const [allDeals, allContacts, allLineItems] = await Promise.all([
    db
      .select({
        id: deals.id,
        opportunityId: deals.opportunityId,
        accountId: deals.accountId,
        contractStartDate: deals.contractStartDate,
        contractTermText: deals.contractTermText,
        opportunityTerm: deals.opportunityTerm,
        totalContractValue: deals.totalContractValue,
        opportunityAmountRollup: deals.opportunityAmountRollup,
        contractAttached: deals.contractAttached,
        pricingContext: deals.pricingContext,
        rolloutContext: deals.rolloutContext,
      })
      .from(deals),
    db
      .select({
        id: contacts.id,
        accountId: contacts.accountId,
        contactName: contacts.contactName,
        isBillingContact: contacts.isBillingContact,
      })
      .from(contacts),
    db
      .select({ dealId: dealLineItems.dealId, unitPrice: dealLineItems.unitPrice, lineTotal: dealLineItems.lineTotal })
      .from(dealLineItems),
  ]);

  // Build lookup maps
  const dealByOppId = new Map(allDeals.map((d) => [d.opportunityId, d]));

  // contacts grouped by account_id (for readiness check)
  const contactsByAccount = new Map<string, { isBillingContact: boolean }[]>();
  for (const c of allContacts) {
    const list = contactsByAccount.get(c.accountId) ?? [];
    list.push({ isBillingContact: c.isBillingContact });
    contactsByAccount.set(c.accountId, list);
  }

  // existing billing contacts set: "accountId:contactName" → contact id
  const billingContactKey = new Map<string, string>();
  for (const c of allContacts) {
    billingContactKey.set(`${c.accountId}:${c.contactName.toLowerCase()}`, c.id);
  }

  // line items grouped by deal_id
  const lineItemsByDeal = new Map<string, { unitPrice: string | null; lineTotal: string | null }[]>();
  for (const li of allLineItems) {
    const list = lineItemsByDeal.get(li.dealId) ?? [];
    list.push({ unitPrice: li.unitPrice, lineTotal: li.lineTotal });
    lineItemsByDeal.set(li.dealId, list);
  }

  console.log(`    ${allDeals.length} deals | ${allContacts.length} contacts\n`);

  // ── Process each invoice register row ────────────────────────────────────
  let datesSet = 0, contactsUpserted = 0, skipped = 0;

  for (const row of rows) {
    if (!row.opportunityId) {
      console.warn("  ⚠️   Missing Opportunity_ID — skipping");
      skipped++;
      continue;
    }

    const deal = dealByOppId.get(row.opportunityId);
    if (!deal) {
      console.warn(`  ⚠️   ${row.opportunityId} (${row.accountName}) — not in DB, skipping`);
      skipped++;
      continue;
    }

    // ── 1. Set contract_start_date ─────────────────────────────────────────
    const dealUpdate: Partial<typeof deals.$inferInsert> = {};
    if (row.invoiceDate) {
      dealUpdate.contractStartDate = row.invoiceDate;
      datesSet++;
    }

    // ── 2. Upsert billing contact ──────────────────────────────────────────
    if (row.billingContactName) {
      const key = `${deal.accountId}:${row.billingContactName.toLowerCase()}`;
      const existingId = billingContactKey.get(key);

      if (existingId) {
        // Update existing contact — mark as billing contact
        await db
          .update(contacts)
          .set({ isBillingContact: true, contactRole: "billing_contact" })
          .where(eq(contacts.id, existingId));
      } else {
        // Insert new billing contact
        await db.insert(contacts).values({
          accountId: deal.accountId,
          contactName: row.billingContactName,
          contactTitle: row.billingContactTitle,
          contactEmail: row.billingContactEmail,
          contactRole: "billing_contact",
          isPrimaryContact: false,
          isBillingContact: true,
        });
        billingContactKey.set(key, "inserted");
      }

      // Refresh in-memory contacts list for this account for readiness
      const acctList = contactsByAccount.get(deal.accountId) ?? [];
      if (!acctList.some((c) => c.isBillingContact)) {
        acctList.push({ isBillingContact: true });
        contactsByAccount.set(deal.accountId, acctList);
      }

      contactsUpserted++;
    }

    // ── 3. Recompute readiness ─────────────────────────────────────────────
    const acctContacts = contactsByAccount.get(deal.accountId) ?? [];
    const acctLineItems = lineItemsByDeal.get(deal.id) ?? [];
    const readiness = computeReadiness(
      { ...deal, ...dealUpdate },
      acctContacts,
      acctLineItems
    );

    await db
      .update(deals)
      .set({
        ...dealUpdate,
        readinessStatus: readiness.readinessStatus,
        missingFields: readiness.missingFields,
        warnings: readiness.warnings,
      })
      .where(eq(deals.id, deal.id));

    console.log(
      `  ✓  ${row.opportunityId} | ${row.accountName}` +
      (row.invoiceDate ? ` | start: ${row.invoiceDate}` : "") +
      (row.billingContactName ? ` | billing: ${row.billingContactName}` : " | no billing contact") +
      ` | ${readiness.readinessStatus} (${readiness.missingFields.length} missing)`
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Invoice Register import complete");
  console.log(`  Contract dates set    : ${datesSet}`);
  console.log(`  Billing contacts set  : ${contactsUpserted}`);
  console.log(`  Rows skipped          : ${skipped}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌  Import failed:", err);
  process.exit(1);
});

