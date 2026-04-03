/**
 * import-invoices.ts
 *
 * Phase 1 — Primary: Full_Invoice_Register.xlsx (157 rows)
 *   Each row → one invoice record, linked to deal by Opportunity_ID.
 *
 * Phase 2 — Secondary: DisputedInvoicesExport.xlsx (6 rows)
 *   • Inserts invoice if not already present (by invoice_number).
 *   • Sets is_disputed = true on the invoice.
 *   • Creates one invoice_issues row per disputed invoice.
 *
 * Run:  npx tsx scripts/import-invoices.ts
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals } from "../src/db/schema/deals.ts";
import { invoices, invoiceIssues } from "../src/db/schema/invoices.ts";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

const PRIMARY_FILE =
  "/Users/harshithpeta/Downloads/Day 1 Post Lunch/Full_Invoice_Register.xlsx";
const SECONDARY_FILE =
  "/Users/harshithpeta/Downloads/Day 1 Morning/DisputedInvoicesExport.xlsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function s(v: unknown): string | null {
  if (v == null) return null;
  const x = String(v).trim();
  return x === "" ? null : x;
}

function n(v: unknown): string | null {
  if (v == null) return null;
  const num = Number(v);
  return isNaN(num) ? null : num.toFixed(2);
}

function excelDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    const utc = Math.floor(v - 25569) * 86400 * 1000;
    return new Date(utc).toISOString().split("T")[0];
  }
  // String date — validate before returning to avoid postgres date parse errors
  const str = String(v).trim();
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

interface RawRow {
  Invoice_Number: unknown;
  Opportunity_ID: unknown;
  Invoice_Date: unknown;
  Account_Name: unknown;
  Billing_Address: unknown;
  Account_City: unknown;
  Account_State: unknown;
  Billing_Contact_Name: unknown;
  Billing_Contact_Title: unknown;
  Billing_Contact_Email: unknown;
  CRM_Contact_Name: unknown;
  CRM_Contact_Title: unknown;
  Product: unknown;
  Opportunity_Type: unknown;
  Seats: unknown;
  PO_Number: unknown;
  Invoice_Amount: unknown;
  Payment_Terms: unknown;
  Due_Date: unknown;
  Payment_Status: unknown;
  Payment_Date: unknown;
  Opportunity_Owner: unknown;
  Invoice_Notes: unknown;
}

function parseSheet(wb: import("xlsx").WorkBook, sheet: string): RawRow[] {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet "${sheet}" not found`);
  return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null });
}

function rowToValues(r: RawRow, isDisputed: boolean) {
  return {
    invoiceNumber: s(r.Invoice_Number)!,
    opportunityId: s(r.Opportunity_ID),
    invoiceDate: excelDate(r.Invoice_Date),
    billingAddress: s(r.Billing_Address),
    accountCity: s(r.Account_City),
    accountState: s(r.Account_State),
    billingContactName: s(r.Billing_Contact_Name),
    billingContactTitle: s(r.Billing_Contact_Title),
    billingContactEmail: s(r.Billing_Contact_Email),
    crmContactName: s(r.CRM_Contact_Name),
    crmContactTitle: s(r.CRM_Contact_Title),
    product: s(r.Product),
    opportunityType: s(r.Opportunity_Type),
    seats: r.Seats != null ? Number(r.Seats) || null : null,
    poNumber: s(r.PO_Number),
    invoiceAmount: n(r.Invoice_Amount),
    paymentTerms: s(r.Payment_Terms),
    dueDate: excelDate(r.Due_Date),
    paymentStatus: s(r.Payment_Status),
    paymentDate: excelDate(r.Payment_Date),
    opportunityOwner: s(r.Opportunity_Owner),
    invoiceNotes: s(r.Invoice_Notes),
    isDisputed,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load all deals to build opportunityId → deal row map
  console.log("\n📂  Loading deals from DB...");
  const allDeals = await db
    .select({ id: deals.id, opportunityId: deals.opportunityId, accountId: deals.accountId })
    .from(deals);
  const dealByOppId = new Map(allDeals.map((d) => [d.opportunityId, d]));
  console.log(`    ${allDeals.length} deals loaded\n`);

  // ── Phase 1: Primary import ───────────────────────────────────────────────
  console.log(`📂  Reading primary: ${path.basename(PRIMARY_FILE)}`);
  const primaryWb = XLSX.readFile(path.resolve(PRIMARY_FILE));
  const primaryRows = parseSheet(primaryWb, "Invoice Register");
  console.log(`    ${primaryRows.length} rows\n`);

  let inserted = 0, skipped = 0, noMatch = 0;
  const insertedNumbers = new Set<string>();

  for (const r of primaryRows) {
    const invNum = s(r.Invoice_Number);
    if (!invNum) { skipped++; continue; }

    const oppId = s(r.Opportunity_ID);
    const deal = oppId ? dealByOppId.get(oppId) : undefined;
    if (!deal) {
      console.warn(`  ⚠️   ${invNum} | ${oppId} — no matching deal, skipping`);
      noMatch++;
      continue;
    }

    const vals = rowToValues(r, false);
    await db
      .insert(invoices)
      .values({ ...vals, dealId: deal.id, accountId: deal.accountId })
      .onConflictDoUpdate({
        target: invoices.invoiceNumber,
        set: { ...vals, dealId: deal.id, accountId: deal.accountId },
      });

    insertedNumbers.add(invNum);
    inserted++;
    console.log(`  ✓  ${invNum} | ${oppId} | ${s(r.Account_Name)} | $${r.Invoice_Amount} | ${s(r.Payment_Status)}`);
  }

  console.log(`\n    Phase 1 done — inserted/updated: ${inserted} | skipped: ${skipped} | no deal match: ${noMatch}\n`);

  // ── Phase 2: Disputed invoices ────────────────────────────────────────────
  console.log(`📂  Reading secondary: ${path.basename(SECONDARY_FILE)}`);
  const secondaryWb = XLSX.readFile(path.resolve(SECONDARY_FILE));
  const disputedRows = parseSheet(secondaryWb, "Sheet1");
  console.log(`    ${disputedRows.length} disputed rows\n`);

  let disputeInserted = 0, disputeUpdated = 0, issuesCreated = 0;

  for (const r of disputedRows) {
    const invNum = s(r.Invoice_Number);
    if (!invNum) continue;

    const oppId = s(r.Opportunity_ID);
    const deal = oppId ? dealByOppId.get(oppId) : undefined;
    const vals = rowToValues(r, true);

    // Upsert the invoice (insert if new, mark isDisputed=true if already there)
    const [upserted] = await db
      .insert(invoices)
      .values({ ...vals, dealId: deal?.id ?? null, accountId: deal?.accountId ?? null })
      .onConflictDoUpdate({
        target: invoices.invoiceNumber,
        set: { isDisputed: true, paymentStatus: vals.paymentStatus },
      })
      .returning({ id: invoices.id });

    if (insertedNumbers.has(invNum)) {
      disputeUpdated++;
    } else {
      disputeInserted++;
    }

    // Create an invoice_issues record for this dispute
    await db.insert(invoiceIssues).values({
      invoiceId: upserted.id,
      dealId: deal?.id ?? null,
      accountId: deal?.accountId ?? null,
      issueSource: "disputed_invoice_export",
      issueSummary: `Invoice ${invNum} has ${vals.paymentStatus ?? "outstanding"} payment status`,
      issueDetail: vals.invoiceNotes ?? `Product: ${vals.product} | Amount: $${vals.invoiceAmount} | Terms: ${vals.paymentTerms}`,
      issueStatus: "open",
      reportedDate: new Date().toISOString().split("T")[0],
      reportedBy: "import-invoices.ts",
    });
    issuesCreated++;

    console.log(`  🔴  ${invNum} | ${oppId} | ${s(r.Account_Name)} | ${vals.paymentStatus} → issue created`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Invoice import complete");
  console.log(`  Phase 1 (register)  : ${inserted} invoices imported`);
  console.log(`  Phase 2 (disputes)  : ${disputeInserted} new | ${disputeUpdated} flagged | ${issuesCreated} issues created`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌  Import failed:", err);
  process.exit(1);
});

