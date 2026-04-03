/**
 * enrich-deals-tracker.ts
 *
 * Uses "Toms Deal Tracker.xlsx" as a secondary enrichment source.
 *
 * Sheet: "Closed Won 2026"
 *   → Enriches existing deals with trackerDiscount, trackerYear1Price, trackerNotes.
 *     Matched by account name. Does NOT overwrite primary source fields (deal stage,
 *     opportunity amounts, etc.) — Tom's tracker is not the source of record.
 *
 * Sheet: "Open Deals"
 *   → For each open pipeline row, finds the matching account and either:
 *     a) Updates the most recent needs_info deal with pipeline context, OR
 *     b) Creates a new deal if no open deal exists for that account yet.
 *   → Populates: pipelineStage, trackerDiscount, trackerYear1Price, trackerNotes,
 *     and totalContractValue (if not already set).
 *
 * Both sheets have metadata in rows 0-1 and real headers at row index 2.
 *
 * Run:
 *   npm run import:enrich-tracker
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals } from "../src/db/schema/deals.ts";
import { accounts } from "../src/db/schema/accounts.ts";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKBOOK_PATH = "/Users/harshithpeta/Downloads/Toms Deal Tracker.xlsx";
const HEADER_ROW_INDEX = 2; // rows 0-1 are title/subtitle; real headers are on row 2

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanString(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
}

function cleanNumber(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
}

/** Convert Excel serial date to ISO date string (YYYY-MM-DD). */
function excelSerialToDate(val: unknown): string | null {
    const n = cleanNumber(val);
    if (n === null || n < 1) return null;
    const date = new Date(Math.round((n - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0]!;
}

/** Parse a sheet using a fixed header row index. Returns typed record array. */
function parseSheet(sheet: import("xlsx").WorkSheet): Record<string, unknown>[] {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
    if (rows.length <= HEADER_ROW_INDEX) return [];
    const headers = (rows[HEADER_ROW_INDEX] as unknown[]).map((h) => String(h ?? "").trim());
    const dataRows = rows.slice(HEADER_ROW_INDEX + 1);
    return dataRows
        .filter((row) => (row as unknown[]).some((cell) => cell !== null && cell !== ""))
        .map((row) => {
            const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? null; });
            return obj;
        });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const absPath = path.resolve(WORKBOOK_PATH);
    console.log(`\n📂  Reading workbook: ${absPath}`);

    const workbook = XLSX.readFile(absPath);
    const sheetNames = workbook.SheetNames;
    console.log(`    Sheets found: ${sheetNames.join(", ")}\n`);

    // ── 1. Pre-load reference data ──────────────────────────────────────────
    console.log("🗄️   Loading reference data...");
    const [allAccounts, allDeals] = await Promise.all([
        db.select({ id: accounts.id, name: accounts.accountName }).from(accounts),
        db.select({
            id: deals.id,
            accountId: deals.accountId,
            dealStage: deals.dealStage,
            totalContractValue: deals.totalContractValue,
            createdAt: deals.createdAt,
        }).from(deals),
    ]);

    // lower(name) → account id
    const accountMap = new Map<string, string>();
    for (const a of allAccounts) accountMap.set(a.name.trim().toLowerCase(), a.id);

    // accountId → sorted list of deals (newest first)
    const dealsByAccount = new Map<string, typeof allDeals>();
    for (const d of allDeals) {
        const list = dealsByAccount.get(d.accountId) ?? [];
        list.push(d);
        dealsByAccount.set(d.accountId, list);
    }
    // Sort each account's deal list newest-first
    for (const list of dealsByAccount.values()) {
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    console.log(`    ${accountMap.size} accounts | ${allDeals.length} deals loaded\n`);

    // ── 2. Closed Won 2026 — enrich existing deals ──────────────────────────
    const cwSheet = workbook.Sheets["Closed Won 2026"];
    let cwEnriched = 0, cwSkipped = 0;
    const cwSkippedRows: string[] = [];

    if (cwSheet) {
        const cwRows = parseSheet(cwSheet);
        // Filter out the TOTALS row
        const dataRows = cwRows.filter((r) => cleanString(r["Account Name"]) !== "TOTALS");
        console.log(`📊  Closed Won 2026 — ${dataRows.length} data row(s)`);

        for (const row of dataRows) {
            const accountName = cleanString(row["Account Name"]);
            if (!accountName) { cwSkippedRows.push("(blank account name)"); cwSkipped++; continue; }

            const accountId = accountMap.get(accountName.toLowerCase());
            if (!accountId) {
                cwSkippedRows.push(`${accountName} — account not in DB`);
                console.warn(`  ⚠️   Skipped CW: "${accountName}" — not found in accounts`);
                cwSkipped++;
                continue;
            }

            // Find the most recent closed_won deal for this account
            const acctDeals = dealsByAccount.get(accountId) ?? [];
            const target = acctDeals.find((d) => d.dealStage === "closed_won") ?? acctDeals[0];
            if (!target) {
                cwSkippedRows.push(`${accountName} — no deals found for account`);
                cwSkipped++;
                continue;
            }

            const discount = cleanNumber(row["Discount "]) ?? cleanNumber(row["Discount"]);
            const year1Price = cleanNumber(row["Year 1 Price"]);
            const notes = cleanString(row["Notes"]);
            const contractValue = cleanNumber(row["Contract Value"]);

            const enrichment: Partial<typeof deals.$inferInsert> = {
                ...(discount !== null && { trackerDiscount: String(discount) }),
                ...(year1Price !== null && { trackerYear1Price: String(year1Price) }),
                ...(notes !== null && { trackerNotes: notes }),
                // Only set totalContractValue if not already recorded
                ...(contractValue !== null && !target.totalContractValue && {
                    totalContractValue: String(contractValue),
                }),
            };

            await db.update(deals).set(enrichment).where(eq(deals.id, target.id));
            console.log(`  ✓  Enriched CW deal: "${accountName}" (id: ${target.id.slice(0, 8)}…)`);
            cwEnriched++;
        }
        console.log(`    Closed Won: ${cwEnriched} enriched | ${cwSkipped} skipped\n`);
    } else {
        console.warn('⚠️   Sheet "Closed Won 2026" not found — skipping CW enrichment\n');
    }

    // ── 3. Open Deals — upsert pipeline context ─────────────────────────────
    const odSheet = workbook.Sheets["Open Deals"];
    let odUpdated = 0, odCreated = 0, odSkipped = 0;
    const odSkippedRows: string[] = [];

    if (odSheet) {
        const odRows = parseSheet(odSheet);
        const dataRows = odRows.filter((r) => cleanString(r["Account Name"]) !== "TOTALS");
        console.log(`📊  Open Deals — ${dataRows.length} data row(s)`);

        for (const row of dataRows) {
            const accountName = cleanString(row["Account Name"]);
            if (!accountName) { odSkippedRows.push("(blank account name)"); odSkipped++; continue; }

            const accountId = accountMap.get(accountName.toLowerCase());
            if (!accountId) {
                odSkippedRows.push(`${accountName} — account not in DB`);
                console.warn(`  ⚠️   Skipped OD: "${accountName}" — not found in accounts`);
                odSkipped++;
                continue;
            }

            const discount = cleanNumber(row["Discount"]);
            const year1Price = cleanNumber(row["Year 1 Price"]);
            const notes = cleanString(row["Notes"]);
            const contractValue = cleanNumber(row["Contract Value"]);
            const product = cleanString(row["Product"]);
            const oppType = cleanString(row["Opp Type"]);
            const projCloseDate = excelSerialToDate(row["Proj. Close Date"]);

            const pipelineFields: Partial<typeof deals.$inferInsert> = {
                pipelineStage: "Open Pipeline",
                ...(discount !== null && { trackerDiscount: String(discount) }),
                ...(year1Price !== null && { trackerYear1Price: String(year1Price) }),
                ...(notes !== null && { trackerNotes: notes }),
            };

            // Find existing open (needs_info) deal for this account
            const acctDeals = dealsByAccount.get(accountId) ?? [];
            const openDeal = acctDeals.find((d) => d.dealStage === "needs_info");

            if (openDeal) {
                // Only set totalContractValue if not already recorded
                if (contractValue !== null && !openDeal.totalContractValue) {
                    pipelineFields.totalContractValue = String(contractValue);
                }
                await db.update(deals).set(pipelineFields).where(eq(deals.id, openDeal.id));
                console.log(`  ↻  Updated OD pipeline: "${accountName}" (id: ${openDeal.id.slice(0, 8)}…)`);
                odUpdated++;
            } else {
                // Create a new open-pipeline deal for this account
                await db.insert(deals).values({
                    accountId,
                    opportunityName: product ? `${product} — ${accountName}` : accountName,
                    opportunityType: oppType,
                    oppCloseDate: projCloseDate,
                    dealStage: "needs_info",
                    readinessStatus: "blocked",
                    totalContractValue: contractValue !== null ? String(contractValue) : null,
                    missingFields: ["No CRM opportunity ID — sourced from Tom's Deal Tracker"],
                    warnings: [],
                    ...pipelineFields,
                });
                console.log(`  ✚  Created OD deal: "${accountName}" — "${product ?? "Open Deal"}"`);
                odCreated++;
            }
        }
        console.log(`    Open Deals: ${odUpdated} updated | ${odCreated} created | ${odSkipped} skipped\n`);
    } else {
        console.warn('⚠️   Sheet "Open Deals" not found — skipping pipeline sync\n');
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Tracker enrichment complete");
    console.log(`  Closed Won enriched : ${cwEnriched}`);
    console.log(`  Closed Won skipped  : ${cwSkipped}`);
    console.log(`  Open deals updated  : ${odUpdated}`);
    console.log(`  Open deals created  : ${odCreated}`);
    console.log(`  Open deals skipped  : ${odSkipped}`);
    if (cwSkippedRows.length || odSkippedRows.length) {
        console.log("  Skipped rows:");
        [...cwSkippedRows, ...odSkippedRows].forEach((r) => console.log(`    - ${r}`));
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌  Enrichment failed:", err);
    process.exit(1);
});

