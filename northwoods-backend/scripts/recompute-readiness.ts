/**
 * recompute-readiness.ts
 *
 * Recomputes readiness_status, missing_fields, and warnings for every deal
 * in the database. Safe to run at any time — no data is deleted or imported.
 *
 * Strategy (no N+1 queries):
 *   1. Load all deals (readiness fields only) in one query
 *   2. Load all contacts grouped by account_id in one query
 *   3. Load all deal_line_items grouped by deal_id in one query
 *   4. Run computeReadiness() in memory for each deal
 *   5. Batch-update only rows where the result differs from the stored value
 *
 * Run:
 *   npm run recompute:readiness
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals } from "../src/db/schema/deals.ts";
import { dealLineItems } from "../src/db/schema/deals.ts";
import { contacts } from "../src/db/schema/accounts.ts";
import { computeReadiness } from "../src/lib/readiness.ts";

const BATCH_SIZE = 50;

async function main() {
    console.log("\n🔄  Recomputing readiness for all deals…\n");

    // ── 1. Bulk-load reference data ───────────────────────────────────────────
    const [allDeals, allContacts, allLineItems] = await Promise.all([
        db.select({
            id: deals.id,
            accountId: deals.accountId,
            // readiness inputs
            contractStartDate: deals.contractStartDate,
            contractTermText: deals.contractTermText,
            opportunityTerm: deals.opportunityTerm,
            totalContractValue: deals.totalContractValue,
            opportunityAmountRollup: deals.opportunityAmountRollup,
            contractAttached: deals.contractAttached,
            pricingContext: deals.pricingContext,
            rolloutContext: deals.rolloutContext,
            specialRemarks: deals.specialRemarks,
            opportunityNotes: deals.opportunityNotes,
            trackerDiscount: deals.trackerDiscount,
            // current stored values (for diffing)
            readinessStatus: deals.readinessStatus,
            missingFields: deals.missingFields,
            warnings: deals.warnings,
        }).from(deals),

        db.select({
            accountId: contacts.accountId,
            isBillingContact: contacts.isBillingContact,
        }).from(contacts),

        db.select({
            dealId: dealLineItems.dealId,
            unitPrice: dealLineItems.unitPrice,
            lineTotal: dealLineItems.lineTotal,
            productNameSnapshot: dealLineItems.productNameSnapshot,
        }).from(dealLineItems),
    ]);

    // ── 2. Build lookup maps ──────────────────────────────────────────────────
    const contactsByAccount = new Map<string, Array<{ isBillingContact: boolean }>>();
    for (const c of allContacts) {
        const list = contactsByAccount.get(c.accountId) ?? [];
        list.push({ isBillingContact: c.isBillingContact });
        contactsByAccount.set(c.accountId, list);
    }

    const lineItemsByDeal = new Map<string, Array<{ unitPrice: string | null; lineTotal: string | null; productNameSnapshot: string | null }>>();
    for (const li of allLineItems) {
        const list = lineItemsByDeal.get(li.dealId) ?? [];
        list.push({ unitPrice: li.unitPrice, lineTotal: li.lineTotal, productNameSnapshot: li.productNameSnapshot });
        lineItemsByDeal.set(li.dealId, list);
    }

    console.log(
        `    ${allDeals.length} deals | ${allContacts.length} contacts | ${allLineItems.length} line items loaded\n`,
    );

    // ── 3. Snapshot before-counts ─────────────────────────────────────────────
    const before = { blocked: 0, warning: 0, ready: 0 };
    for (const d of allDeals) before[d.readinessStatus]++;

    // ── 4. Compute new readiness for each deal ────────────────────────────────
    type UpdateRow = {
        id: string;
        readinessStatus: "blocked" | "warning" | "ready";
        missingFields: string[];
        warnings: string[];
    };
    const toUpdate: UpdateRow[] = [];
    let unchanged = 0;

    for (const deal of allDeals) {
        const acctContacts = contactsByAccount.get(deal.accountId) ?? [];
        const lineItems = lineItemsByDeal.get(deal.id) ?? [];

        const result = computeReadiness(deal, acctContacts, lineItems);

        // Only queue a write if something actually changed
        const statusChanged = result.readinessStatus !== deal.readinessStatus;
        const missingChanged =
            JSON.stringify(result.missingFields) !== JSON.stringify(deal.missingFields ?? []);
        const warningsChanged =
            JSON.stringify(result.warnings) !== JSON.stringify(deal.warnings ?? []);

        if (statusChanged || missingChanged || warningsChanged) {
            toUpdate.push({
                id: deal.id,
                readinessStatus: result.readinessStatus,
                missingFields: result.missingFields,
                warnings: result.warnings,
            });
        } else {
            unchanged++;
        }
    }

    console.log(`    ${toUpdate.length} deal(s) need updating | ${unchanged} already current\n`);

    // ── 5. Batch-write updates ────────────────────────────────────────────────
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await Promise.all(
            batch.map((row) =>
                db.update(deals).set({
                    readinessStatus: row.readinessStatus,
                    missingFields: row.missingFields,
                    warnings: row.warnings,
                }).where(eq(deals.id, row.id)),
            ),
        );
        console.log(
            `  ↻  Batch ${Math.floor(i / BATCH_SIZE) + 1}: updated ${batch.length} deal(s)`,
        );
    }

    // ── 6. After-counts ───────────────────────────────────────────────────────
    const after = { blocked: 0, warning: 0, ready: 0 };
    for (const row of toUpdate) after[row.readinessStatus]++;
    // deals that didn't change keep their before-status
    for (const deal of allDeals) {
        if (!toUpdate.find((u) => u.id === deal.id)) {
            after[deal.readinessStatus]++;
        }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Readiness recompute complete");
    console.log(`  Deals updated    : ${toUpdate.length}`);
    console.log(`  Deals unchanged  : ${unchanged}`);
    console.log("\n  Status breakdown        BEFORE  →  AFTER");
    console.log(`    blocked               ${String(before.blocked).padStart(5)}  →  ${after.blocked}`);
    console.log(`    warning               ${String(before.warning).padStart(5)}  →  ${after.warning}`);
    console.log(`    ready                 ${String(before.ready).padStart(5)}  →  ${after.ready}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌  Recompute failed:", err);
    process.exit(1);
});

