/**
 * import-accounts.ts
 *
 * Loads account rows from two workbooks into the accounts table:
 *   - Active Customer List.xlsx  (sheet: "Active Customers")
 *   - Lost Customer List.xlsx    (sheet: "Lost Customers")
 *
 * Upserts by account_name: updates if already present, inserts if new.
 * Dates in both files are stored as Excel serial numbers and are converted
 * to ISO date strings (YYYY-MM-DD).
 *
 * Run:
 *   npm run import:accounts
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { accounts } from "../src/db/schema/accounts.ts";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

// ---------------------------------------------------------------------------
// Source files
// ---------------------------------------------------------------------------

const SOURCES = [
    {
        file: "/Users/harshithpeta/Downloads/Day 1 Morning/Active Customer List.xlsx",
        sheet: "Active Customers",
        label: "Active",
    },
    {
        file: "/Users/harshithpeta/Downloads/Day 1 Post Lunch/Lost Customer List.xlsx",
        sheet: "Lost Customers",
        label: "Lost",
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanString(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
}

function cleanInt(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return isNaN(n) ? null : Math.round(n);
}

/**
 * Excel stores dates as days since 1900-01-01 (with a Lotus 1-2-3 leap-year bug).
 * This converts a serial number to a YYYY-MM-DD string.
 * Returns null for non-numeric or out-of-range values.
 */
function excelSerialToDate(val: unknown): string | null {
    if (val === null || val === undefined || val === "") return null;
    const serial = Number(val);
    if (isNaN(serial) || serial < 1) return null;
    // XLSX utility: parse the date code into { y, m, d }
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) return null;
    const y = String(parsed.y).padStart(4, "0");
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Row shape (union of both sheets; absent fields will be null)
// ---------------------------------------------------------------------------

interface RawRow {
    Account_Name: unknown;
    Account_City: unknown;
    Account_State: unknown;
    Account_Industry: unknown;
    Account_Size: unknown;
    Account_Status: unknown;
    Account_Product: unknown;
    Original_Purchase_Date: unknown;
    Next_Renewal_Date: unknown;
    Account_Lost_Date: unknown;
    Total_Seats: unknown;
}

const HEADER_MAP: Record<string, keyof RawRow> = {
    Account_Name: "Account_Name",
    Account_City: "Account_City",
    Account_State: "Account_State",
    Account_Industry: "Account_Industry",
    Account_Size: "Account_Size",
    Account_Status: "Account_Status",
    Account_Product: "Account_Product",
    Original_Purchase_Date: "Original_Purchase_Date",
    Next_Renewal_Date: "Next_Renewal_Date",
    Account_Lost_Date: "Account_Lost_Date",
    Total_Seats: "Total_Seats",
};

function normalizeRow(raw: RawRow): typeof accounts.$inferInsert | null {
    const accountName = cleanString(raw.Account_Name);
    if (!accountName) return null;

    return {
        accountName,
        accountCity: cleanString(raw.Account_City),
        accountState: cleanString(raw.Account_State),
        accountIndustry: cleanString(raw.Account_Industry),
        accountSize: cleanString(raw.Account_Size),
        accountStatus: cleanString(raw.Account_Status),
        accountProduct: cleanString(raw.Account_Product),
        originalPurchaseDate: excelSerialToDate(raw.Original_Purchase_Date),
        nextRenewalDate: excelSerialToDate(raw.Next_Renewal_Date),
        accountLostDate: excelSerialToDate(raw.Account_Lost_Date),
        totalSeats: cleanInt(raw.Total_Seats),
    };
}



// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    let totalRead = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const skippedNames: string[] = [];

    for (const source of SOURCES) {
        const absPath = path.resolve(source.file);
        console.log(`\n📂  [${source.label}] Reading: ${absPath}`);

        const workbook = XLSX.readFile(absPath);

        if (!workbook.SheetNames.includes(source.sheet)) {
            console.error(`❌  Sheet "${source.sheet}" not found. Available: ${workbook.SheetNames.join(", ")}`);
            process.exit(1);
        }

        const sheet = workbook.Sheets[source.sheet]!;
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

        if (rows.length < 2) {
            console.warn(`⚠️   Sheet "${source.sheet}" has no data rows — skipping.`);
            continue;
        }

        const headerRow = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
        const dataRows = rows.slice(1);

        console.log(`📊  Sheet: "${source.sheet}" — ${dataRows.length} data row(s)`);
        console.log(`🗂️   Headers: ${headerRow.join(" | ")}\n`);

        totalRead += dataRows.length;

        for (const dataRow of dataRows) {
            const raw: Partial<RawRow> = {};
            headerRow.forEach((header, colIdx) => {
                const key = HEADER_MAP[header];
                if (key) raw[key] = (dataRow as unknown[])[colIdx] ?? null;
            });

            const normalized = normalizeRow(raw as RawRow);

            if (!normalized) {
                totalSkipped++;
                skippedNames.push(String(raw.Account_Name ?? "(empty)"));
                continue;
            }

            const existing = await db
                .select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.accountName, normalized.accountName))
                .limit(1);

            if (existing.length > 0) {
                await db
                    .update(accounts)
                    .set({
                        accountCity: normalized.accountCity,
                        accountState: normalized.accountState,
                        accountIndustry: normalized.accountIndustry,
                        accountSize: normalized.accountSize,
                        accountStatus: normalized.accountStatus,
                        accountProduct: normalized.accountProduct,
                        originalPurchaseDate: normalized.originalPurchaseDate,
                        nextRenewalDate: normalized.nextRenewalDate,
                        accountLostDate: normalized.accountLostDate,
                        totalSeats: normalized.totalSeats,
                    })
                    .where(eq(accounts.accountName, normalized.accountName));
                totalUpdated++;
                console.log(`  ↻  Updated : ${normalized.accountName}`);
            } else {
                await db.insert(accounts).values(normalized);
                totalInserted++;
                console.log(`  ✚  Inserted: ${normalized.accountName}`);
            }
        }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Accounts import complete");
    console.log(`  Rows read  : ${totalRead}`);
    console.log(`  Inserted   : ${totalInserted}`);
    console.log(`  Updated    : ${totalUpdated}`);
    console.log(`  Skipped    : ${totalSkipped}`);
    if (skippedNames.length > 0) {
        console.log(`  Skipped (no account name): ${skippedNames.join(", ")}`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌  Import failed:", err);
    process.exit(1);
});
