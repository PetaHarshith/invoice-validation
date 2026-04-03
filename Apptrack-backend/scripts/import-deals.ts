/**
 * import-deals.ts
 *
 * Reads All_Opps_Final.xlsx (all 370 Open / Closed Won / Closed Lost opps)
 * and upserts into:
 *   - deals          (keyed by opportunity_id)
 *   - contacts       (primary contact per opp, keyed by account_id + contact_name)
 *
 * Readiness is computed on every row via computeReadiness().
 * Most rows will start as "blocked" (no line items / contract yet — correct).
 *
 * Run:
 *   npm run import:deals
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq, and } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals } from "../src/db/schema/deals.ts";
import { accounts, contacts } from "../src/db/schema/accounts.ts";
import { computeReadiness } from "../src/lib/readiness.ts";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKBOOK_PATH = "/Users/harshithpeta/Downloads/Day 2 Morning/All_Opps_Final.xlsx";
const SHEET_NAME = "Sheet1";

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

function excelSerialToDate(val: unknown): string | null {
    if (val === null || val === undefined || val === "") return null;
    const serial = Number(val);
    if (isNaN(serial) || serial < 1) return null;
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) return null;
    const y = String(parsed.y).padStart(4, "0");
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Maps the raw CRM Opp_Stage string to our deal_stage enum.
 * Closed Won → closed_won (enters the finance handoff workflow)
 * Open / Closed Lost → needs_info (sales-side, raw stage preserved in oppStageRaw)
 */
function mapDealStage(rawStage: string | null): "closed_won" | "needs_info" {
    if (!rawStage) return "needs_info";
    const s = rawStage.trim().toLowerCase();
    if (s === "closed won") return "closed_won";
    return "needs_info";
}

// ---------------------------------------------------------------------------
// Row shape (columns by index — header verified at runtime)
// ---------------------------------------------------------------------------

// Header order from workbook (0-based):
// 0  Opportunity_ID
// 1  Opp_Created_Date
// 2  Account_Name
// 3  Account_City
// 4  Account_State
// 5  Account_Status
// 6  Account_Product
// 7  Account_Original_Purchase
// 8  Account_Next_Renewal
// 9  Account_Lost_Date
// 10 Account_Total_Seats
// 11 Opportunity_Type
// 12 Opp_Close_Date
// 13 Opp_Stage
// 14 Opportunity_Owner
// 15 Opportunity_Amount_Rollup
// 16 Opportunity_Term
// 17 Opportunity_Primary_Contact
// 18 Opportunity_Contact_Title
// 19 Opportunity_Contact_Location
// 20 Opportunity_Notes
// 21 Opportunity_Name
// 22 Opportunity_Source
// 23 Opportunity_Close_Reason
// 24 Account_Industry
// 25 Account_Size

interface RawRow {
    opportunityId: unknown;
    oppCreatedDate: unknown;
    accountName: unknown;
    opportunityType: unknown;
    oppCloseDate: unknown;
    oppStage: unknown;
    opportunityOwner: unknown;
    opportunityAmountRollup: unknown;
    opportunityTerm: unknown;
    primaryContact: unknown;
    contactTitle: unknown;
    contactLocation: unknown;
    opportunityNotes: unknown;
    opportunityName: unknown;
    opportunitySource: unknown;
    opportunityCloseReason: unknown;
    accountProduct: unknown;
    accountTotalSeats: unknown;
}

const COL_MAP: Record<string, keyof RawRow> = {
    Opportunity_ID: "opportunityId",
    Opp_Created_Date: "oppCreatedDate",
    Account_Name: "accountName",
    Opportunity_Type: "opportunityType",
    Opp_Close_Date: "oppCloseDate",
    Opp_Stage: "oppStage",
    Opportunity_Owner: "opportunityOwner",
    Opportunity_Amount_Rollup: "opportunityAmountRollup",
    Opportunity_Term: "opportunityTerm",
    Opportunity_Primary_Contact: "primaryContact",
    Opportunity_Contact_Title: "contactTitle",
    Opportunity_Contact_Location: "contactLocation",
    Opportunity_Notes: "opportunityNotes",
    Opportunity_Name: "opportunityName",
    Opportunity_Source: "opportunitySource",
    Opportunity_Close_Reason: "opportunityCloseReason",
    Account_Product: "accountProduct",
    Account_Total_Seats: "accountTotalSeats",
};



// ---------------------------------------------------------------------------
// Main — batched to minimise Neon round trips
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

async function main() {
    const absPath = path.resolve(WORKBOOK_PATH);
    console.log(`\n📂  Reading workbook: ${absPath}`);

    const workbook = XLSX.readFile(absPath);
    if (!workbook.SheetNames.includes(SHEET_NAME)) {
        console.error(`❌  Sheet "${SHEET_NAME}" not found. Available: ${workbook.SheetNames.join(", ")}`);
        process.exit(1);
    }

    const sheet = workbook.Sheets[SHEET_NAME]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    if (rows.length < 2) { console.error("❌  No data rows."); process.exit(1); }

    const headerRow = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
    const dataRows = rows.slice(1);
    console.log(`📊  ${dataRows.length} data row(s)\n`);

    // ── 1. Pre-load reference data in 3 queries ──────────────────────────────
    console.log("🗄️   Loading reference data...");
    const [allAccounts, existingDeals, existingContacts] = await Promise.all([
        db.select({ id: accounts.id, name: accounts.accountName }).from(accounts),
        db.select({ id: deals.id, oppId: deals.opportunityId }).from(deals),
        db.select({ id: contacts.id, accountId: contacts.accountId, name: contacts.contactName }).from(contacts),
    ]);

    const accountMap = new Map<string, string>(); // lower(name) → id
    for (const a of allAccounts) accountMap.set(a.name.trim().toLowerCase(), a.id);

    const existingDealMap = new Map<string, string>(); // oppId → deal.id
    for (const d of existingDeals) { if (d.oppId) existingDealMap.set(d.oppId, d.id); }

    // key: `${accountId}::${contactName.toLowerCase()}`
    const existingContactMap = new Map<string, string>();
    for (const c of existingContacts) {
        existingContactMap.set(`${c.accountId}::${c.name.trim().toLowerCase()}`, c.id);
    }

    console.log(`    ${accountMap.size} accounts | ${existingDealMap.size} existing deals | ${existingContactMap.size} existing contacts\n`);

    // ── 2. Parse all rows into insert / update buckets ───────────────────────
    const dealsToInsert: (typeof deals.$inferInsert)[] = [];
    const dealsToUpdate: { oppId: string; payload: Partial<typeof deals.$inferInsert> }[] = [];
    const contactsToInsert: (typeof contacts.$inferInsert)[] = [];
    const contactsToUpdate: { id: string; payload: Partial<typeof contacts.$inferInsert> }[] = [];
    const skippedRows: string[] = [];
    // Tracks contact keys added in this run to avoid duplicates within the batch
    const newContactsThisRun = new Set<string>();

    for (const dataRow of dataRows) {
        const raw: Partial<RawRow> = {};
        headerRow.forEach((header, colIdx) => {
            const key = COL_MAP[header];
            if (key) raw[key] = (dataRow as unknown[])[colIdx] ?? null;
        });

        const oppId = cleanString(raw.opportunityId);
        const accountName = cleanString(raw.accountName);
        if (!oppId || !accountName) { skippedRows.push(oppId ?? "(no opp id)"); continue; }

        const accountId = accountMap.get(accountName.toLowerCase());
        if (!accountId) {
            skippedRows.push(`${oppId} — account not found: "${accountName}"`);
            continue;
        }

        const rawStage = cleanString(raw.oppStage);
        const amountStr = cleanNumber(raw.opportunityAmountRollup) != null
            ? String(cleanNumber(raw.opportunityAmountRollup)) : null;
        const termRaw = cleanNumber(raw.opportunityTerm);

        const readiness = computeReadiness(
            { opportunityTerm: termRaw != null ? String(termRaw) : null, opportunityAmountRollup: amountStr },
            [], []
        );

        const dealPayload: typeof deals.$inferInsert = {
            opportunityId: oppId,
            accountId,
            opportunityName: cleanString(raw.opportunityName),
            opportunityOwner: cleanString(raw.opportunityOwner),
            opportunityType: cleanString(raw.opportunityType),
            oppCreatedDate: excelSerialToDate(raw.oppCreatedDate),
            oppCloseDate: excelSerialToDate(raw.oppCloseDate),
            oppStageRaw: rawStage,
            dealStage: mapDealStage(rawStage),
            opportunityAmountRollup: amountStr,
            opportunityTerm: termRaw != null ? String(termRaw) : null,
            opportunitySource: cleanString(raw.opportunitySource),
            opportunityCloseReason: cleanString(raw.opportunityCloseReason),
            opportunityNotes: cleanString(raw.opportunityNotes),
            accountProductSnapshot: cleanString(raw.accountProduct),
            accountTotalSeatsSnapshot: cleanNumber(raw.accountTotalSeats) != null
                ? Math.round(cleanNumber(raw.accountTotalSeats) as number) : null,
            primaryContactNameSnapshot: cleanString(raw.primaryContact),
            primaryContactTitleSnapshot: cleanString(raw.contactTitle),
            primaryContactLocationSnapshot: cleanString(raw.contactLocation),
            readinessStatus: readiness.readinessStatus,
            missingFields: readiness.missingFields,
            warnings: readiness.warnings,
        };

        if (existingDealMap.has(oppId)) {
            const { opportunityId: _a, accountId: _b, dealStage: _c, readinessStatus: _d, ...updateFields } = dealPayload;
            dealsToUpdate.push({ oppId, payload: updateFields });
        } else {
            dealsToInsert.push(dealPayload);
        }

        // Contact bucket
        const contactName = cleanString(raw.primaryContact);
        if (contactName) {
            const contactKey = `${accountId}::${contactName.toLowerCase()}`;
            const contactPayload = {
                accountId,
                contactName,
                contactTitle: cleanString(raw.contactTitle),
                contactLocation: cleanString(raw.contactLocation),
                contactRole: "primary_contact",
                isPrimaryContact: true,
                isBillingContact: false,
            };
            const existingContactId = existingContactMap.get(contactKey);
            if (existingContactId) {
                contactsToUpdate.push({ id: existingContactId, payload: contactPayload });
            } else if (!newContactsThisRun.has(contactKey)) {
                contactsToInsert.push(contactPayload);
                newContactsThisRun.add(contactKey); // dedupe within this run
            }
        }
    }

    console.log(`📦  Deals to insert: ${dealsToInsert.length} | update: ${dealsToUpdate.length}`);
    console.log(`📦  Contacts to insert: ${contactsToInsert.length} | update: ${contactsToUpdate.length}`);
    console.log(`⚠️   Skipped: ${skippedRows.length}\n`);

    // ── 3. Batch insert deals ─────────────────────────────────────────────────
    for (let i = 0; i < dealsToInsert.length; i += BATCH_SIZE) {
        const batch = dealsToInsert.slice(i, i + BATCH_SIZE);
        await db.insert(deals).values(batch);
        console.log(`  ✚  Inserted deals batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows)`);
    }

    // ── 4. Update existing deals (individually — fewer of these on first run) ─
    for (const { oppId, payload } of dealsToUpdate) {
        await db.update(deals).set(payload).where(eq(deals.opportunityId, oppId));
    }
    if (dealsToUpdate.length) console.log(`  ↻  Updated ${dealsToUpdate.length} existing deal(s)`);

    // ── 5. Batch insert contacts ──────────────────────────────────────────────
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
        const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
        await db.insert(contacts).values(batch);
        console.log(`  ✚  Inserted contacts batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows)`);
    }

    // ── 6. Update existing contacts ───────────────────────────────────────────
    for (const { id, payload } of contactsToUpdate) {
        await db.update(contacts).set(payload).where(eq(contacts.id, id));
    }
    if (contactsToUpdate.length) console.log(`  ↻  Updated ${contactsToUpdate.length} existing contact(s)`);

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Deals import complete");
    console.log(`  Rows read       : ${dataRows.length}`);
    console.log(`  Deals inserted  : ${dealsToInsert.length}`);
    console.log(`  Deals updated   : ${dealsToUpdate.length}`);
    console.log(`  Contacts ins.   : ${contactsToInsert.length}`);
    console.log(`  Contacts upd.   : ${contactsToUpdate.length}`);
    console.log(`  Skipped         : ${skippedRows.length}`);
    if (skippedRows.length) console.log(`  Skipped rows    :\n    ${skippedRows.join("\n    ")}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌  Import failed:", err);
    process.exit(1);
});
