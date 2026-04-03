/**
 * import-finance-review.ts
 *
 * Imports DisputedInvoices-CRMdata_FinanceReview.xlsx into deal_line_items
 * and enriches the matched deals with finance-side context.
 *
 * Matching strategy: account name (case-insensitive) → closed_won deal.
 * Line items are deleted and re-inserted on each run (idempotent).
 * Discount is stored on the first line item (deal-level total discount).
 * Readiness status is recomputed after every deal update.
 *
 * Run:
 *   npm run import:finance-review
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals, dealLineItems } from "../src/db/schema/deals.ts";
import { accounts, contacts } from "../src/db/schema/accounts.ts";
import { productCatalog } from "../src/db/schema/products.ts";
import { computeReadiness } from "../src/lib/readiness.ts";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FILE = "/Users/harshithpeta/Downloads/Day 1 Afternoon/DisputedInvoices-CRMdata_FinanceReview.xlsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
    if (v == null) return null;
    const x = String(v).trim();
    return x === "" ? null : x;
}

function n(v: unknown): number | null {
    if (v == null || v === "") return null;
    const x = Number(v);
    return isNaN(x) ? null : x;
}

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface SkuSlot { id: string | null; price: number | null; qty: number | null; }

interface FinanceRow {
    accountName: string | null;
    financeResearch: string | null;
    opportunityType: string | null;
    opportunityAmountRollup: number | null;
    term: string | null;
    stage: string | null;
    opportunityOwner: string | null;
    opportunityNotes: string | null;
    skus: SkuSlot[];            // already filtered to non-null SKU IDs
    totalDiscount: number | null;
    totalPostDiscount: number | null;
    discountApproved: string | null;
}

function parseRows(wb: import("xlsx").WorkBook): FinanceRow[] {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets["Sheet1"]!, { defval: null }
    );
    return raw.map((r) => ({
        accountName: s(r["Accpunt_Name"]),   // intentional typo in source file
        financeResearch: s(r["Finance Research"]),
        opportunityType: s(r["Opportunity_Type"]),
        opportunityAmountRollup: n(r["Opportunity_Amount_Rollup"]),
        term: s(r["Term"]),
        stage: s(r["Stage"]),
        opportunityOwner: s(r["Opportunity_Owner"]),
        opportunityNotes: s(r["Opportunity_Notes"]),
        skus: [
            { id: s(r["SKU1_ID"]), price: n(r["SKU1_Price"]), qty: n(r["SKU1_QTY"]) },
            { id: s(r["SKU2_ID"]), price: n(r["SKU2_Price"]), qty: n(r["SKU2_QTY"]) },
            { id: s(r["SKU3_ID"]), price: n(r["SKU3_Price"]), qty: n(r["SKU3_QTY"]) },
            { id: s(r["SKU4_ID"]), price: n(r["SKU4_Price"]), qty: n(r["SKU4_QTY"]) },
        ].filter((sk) => sk.id !== null),
        totalDiscount: n(r["Total Discount"]),
        totalPostDiscount: n(r["Total Post Discount"]),
        // header has a trailing space in the source file
        discountApproved: s(r["Discount Approved "]) ?? s(r["Discount Approved"]),
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

    // ── Load all reference data in parallel ──────────────────────────────────
    console.log("🗄️   Loading DB reference data...");
    const [allAccounts, allDeals, catalog, allContacts] = await Promise.all([
        db.select({ id: accounts.id, name: accounts.accountName }).from(accounts),
        db.select({
            id: deals.id,
            accountId: deals.accountId,
            dealStage: deals.dealStage,
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
        }).from(deals),
        db.select({
            id: productCatalog.id,
            skuId: productCatalog.skuId,
            productName: productCatalog.productName,
            includedSeats: productCatalog.includedSeats,
            billingFrequency: productCatalog.billingFrequency,
        }).from(productCatalog),
        db.select({
            accountId: contacts.accountId,
            isBillingContact: contacts.isBillingContact,
        }).from(contacts),
    ]);

    const accountMap = new Map(allAccounts.map((a) => [a.name.trim().toLowerCase(), a.id]));
    const dealsByAccount = new Map<string, typeof allDeals>();
    for (const d of allDeals) {
        const list = dealsByAccount.get(d.accountId) ?? [];
        list.push(d);
        dealsByAccount.set(d.accountId, list);
    }
    const catalogMap = new Map(catalog.map((p) => [p.skuId, p]));
    const contactsByAccount = new Map<string, typeof allContacts>();
    for (const c of allContacts) {
        const list = contactsByAccount.get(c.accountId) ?? [];
        list.push(c);
        contactsByAccount.set(c.accountId, list);
    }

    console.log(`    ${accountMap.size} accounts | ${allDeals.length} deals | ${catalog.length} SKUs in catalog\n`);

    // ── Process each finance review row ─────────────────────────────────────
    let enriched = 0, skipped = 0, totalLineItems = 0;

    for (const row of rows) {
        if (!row.accountName) {
            console.warn("  ⚠️   Blank account name — skipping");
            skipped++;
            continue;
        }

        const accountId = accountMap.get(row.accountName.toLowerCase());
        if (!accountId) {
            console.warn(`  ⚠️   "${row.accountName}" — not found in accounts, skipping`);
            skipped++;
            continue;
        }

        const acctDeals = dealsByAccount.get(accountId) ?? [];
        // Prefer closed_won; fall back to the first deal found
        const deal = acctDeals.find((d) => d.dealStage === "closed_won") ?? acctDeals[0];
        if (!deal) {
            console.warn(`  ⚠️   "${row.accountName}" — no deal found in DB, skipping`);
            skipped++;
            continue;
        }

        // ── Delete existing line items (idempotent) ──────────────────────────
        await db.delete(dealLineItems).where(eq(dealLineItems.dealId, deal.id));

        // ── Insert line items from SKU columns ───────────────────────────────
        const insertedItems: Array<{ unitPrice: string | null; lineTotal: string | null }> = [];
        let lineOrder = 1;

        for (const sku of row.skus) {
            if (!sku.id) continue;

            const catalogEntry = catalogMap.get(sku.id);
            if (!catalogEntry) {
                console.warn(`    ⚠️   SKU "${sku.id}" not in product catalog — inserting with null product_catalog_id`);
            }

            const unitPrice = sku.price !== null ? String(sku.price) : null;
            const qty = sku.qty;
            const lineTotal =
                sku.price !== null && qty !== null ? String(sku.price * qty) : null;

            // Deal-level discount and approval stored on the first line item
            const isFirst = lineOrder === 1;

            await db.insert(dealLineItems).values({
                dealId: deal.id,
                productCatalogId: catalogEntry?.id ?? null,
                skuId: sku.id,
                lineOrder,
                productNameSnapshot: catalogEntry?.productName ?? null,
                quantity: qty,
                includedSeatsSnapshot: catalogEntry?.includedSeats ?? null,
                unitPrice,
                lineTotal,
                billingFrequency: catalogEntry?.billingFrequency ?? null,
                discountAmount: isFirst && row.totalDiscount ? String(row.totalDiscount) : null,
                discountApprovedText: isFirst ? row.discountApproved : null,
            });

            insertedItems.push({ unitPrice, lineTotal });
            totalLineItems++;
            lineOrder++;
        }

        // ── Enrich deal fields ───────────────────────────────────────────────
        // totalContractValue = post-discount amount from finance review
        // opportunityTerm / contractTermText = term from finance review
        // financeResearch = finance notes for this deal
        // opportunityNotes: update only if CRM left it blank
        const dealUpdate: Partial<typeof deals.$inferInsert> = {
            financeResearch: row.financeResearch,
            ...(row.term && { opportunityTerm: row.term, contractTermText: row.term }),
            ...(row.totalPostDiscount !== null && {
                totalContractValue: String(row.totalPostDiscount),
            }),
            ...(!deal.opportunityNotes && row.opportunityNotes && {
                opportunityNotes: row.opportunityNotes,
            }),
        };

        // ── Recompute readiness ──────────────────────────────────────────────
        const acctContacts = contactsByAccount.get(accountId) ?? [];
        const readiness = computeReadiness(
            { ...deal, ...dealUpdate },
            acctContacts,
            insertedItems,
        );

        await db.update(deals).set({
            ...dealUpdate,
            readinessStatus: readiness.readinessStatus,
            missingFields: readiness.missingFields,
            warnings: readiness.warnings,
        }).where(eq(deals.id, deal.id));

        const skuSummary = row.skus.map((sk) => sk.id).join(", ");
        console.log(`  ✓  "${row.accountName}" — ${lineOrder - 1} line item(s) [${skuSummary}]`);
        console.log(`     readiness: ${readiness.readinessStatus} | missing: ${readiness.missingFields.length} field(s)`);
        enriched++;
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Finance Review import complete");
    console.log(`  Deals enriched   : ${enriched}`);
    console.log(`  Line items added : ${totalLineItems}`);
    console.log(`  Rows skipped     : ${skipped}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌  Import failed:", err);
    process.exit(1);
});

