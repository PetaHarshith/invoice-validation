/**
 * import-wholesale.ts
 *
 * Imports data from the Wholesale Distribution Import File.xlsx into:
 *   Sheet 1 "1. Parent Companies"  → accounts table
 *   Sheet 2 "2. Branch Locations"  → branches table
 *   Sheet 3 "3. Branch Contacts"   → contacts table (with branch_id)
 *   Sheet 4 "4. Engagement Log"    → skipped (informational only)
 *
 * Idempotent: uses ON CONFLICT DO NOTHING on external IDs so re-running
 * the script does not create duplicates.
 *
 * Usage:
 *   npm run import:wholesale
 *   # or with a custom path:
 *   WHOLESALE_FILE=/path/to/file.xlsx npm run import:wholesale
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof import('xlsx');
import 'dotenv/config';
import { db } from '../src/db/index';
import { accounts, contacts, branches } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_FILE = path.resolve(
    process.env.WHOLESALE_FILE ??
    '/Users/harshithpeta/Downloads/Day 3/Wholesale Distribution Import File.xlsx'
);

// ── helpers ──────────────────────────────────────────────────────────────────

function readSheet(wb: XLSX.WorkBook, sheetName: string) {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Sheet "${sheetName}" not found`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });

    // The header row is the FIRST row where the FIRST cell value is exactly one of
    // the known ID column names (e.g. "Company_ID", "Branch_ID", "Contact_ID").
    // We use an exact match to avoid false-positives from description rows that
    // contain "Company_ID" as part of a longer sentence.
    const ID_HEADERS = new Set(['Company_ID', 'Branch_ID', 'Contact_ID']);
    const headerRowIdx = rows.findIndex(
        (r) => Array.isArray(r) && ID_HEADERS.has(String((r as unknown[])[0]).trim())
    );
    if (headerRowIdx === -1) throw new Error(`Cannot find header row in sheet "${sheetName}"`);

    const headers = (rows[headerRowIdx] as unknown[]).map((h) =>
        typeof h === 'string' ? h.trim() : String(h ?? '')
    );

    // Skip the row immediately after the header if it looks like a field-description row.
    // Patterns: cell starts with "e.g.", "Unique ID", "Links to", or "Legal ", OR the
    // first cell is unusually long (>25 chars) for a real data value like "WD-001".
    let dataStart = headerRowIdx + 1;
    const nextRow = rows[dataStart] as unknown[] | undefined;
    if (nextRow && typeof (nextRow[0]) === 'string') {
        const firstCell = (nextRow[0] as string).trim();
        const isDescriptionRow =
            firstCell.length > 25 ||
            /^(e\.g\.|unique id|links to|legal |branch name)/i.test(firstCell);
        if (isDescriptionRow) {
            dataStart += 1; // skip field-description row
        }
    }

    return rows.slice(dataStart).flatMap((row) => {
        if (!Array.isArray(row)) return [];
        const obj: Record<string, string> = {};
        let hasData = false;
        headers.forEach((h, i) => {
            const v = (row as unknown[])[i];
            if (v !== undefined && v !== null && v !== '') {
                obj[h] = String(v).trim();
                hasData = true;
            }
        });
        return hasData ? [obj] : [];
    });
}

function yesNo(v: string | undefined): boolean | null {
    if (!v) return null;
    return v.trim().toUpperCase() === 'Y';
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
    const filePath = DEFAULT_FILE;
    console.log(`Reading: ${filePath}`);
    const wb = XLSX.readFile(filePath);

    const parentRows    = readSheet(wb, '1. Parent Companies');
    const branchRows    = readSheet(wb, '2. Branch Locations');
    const contactRows   = readSheet(wb, '3. Branch Contacts');

    console.log(`Found: ${parentRows.length} parent companies, ${branchRows.length} branches, ${contactRows.length} contacts`);

    // ── 1. Parent Companies → accounts ───────────────────────────────────────
    // Maps companyIdExternal → DB account id (used to resolve FK for branches)
    const companyIdToAccountId = new Map<string, string>();

    for (const row of parentRows) {
        const companyId = row['Company_ID'];
        if (!companyId) continue;

        // Check if account already exists by external ID
        const existing = await db.query.accounts.findFirst({
            where: eq(accounts.companyIdExternal, companyId),
        });
        if (existing) {
            companyIdToAccountId.set(companyId, existing.id);
            console.log(`  skip account (exists): ${companyId} — ${existing.accountName}`);
            continue;
        }

        const [created] = await db.insert(accounts).values({
            accountName:       row['Company_Name']             ?? 'Unknown',
            accountCity:       row['HQ_City'],
            accountState:      row['HQ_State_Province']        ?? row['HQ_State_Prov'],
            accountIndustry:   row['Industry_Subtype']         ?? row['Segment'] ?? row['Industry'],
            accountSize:       row['Branch_Count_Est'] ? `~${row['Branch_Count_Est']} branches` : undefined,
            accountStatus:     row['Lead_Status'],
            companyIdExternal: companyId,
            erpSystem:         row['ERP_System'],
            procurementModel:  row['Procurement_Model'],
            leadStatus:        row['Lead_Status'],
            priorityTier:      row['Priority_Tier'],
            needsReview:       yesNo(row['Needs_Review']) ?? false,
        }).returning();

        companyIdToAccountId.set(companyId, created.id);
        console.log(`  created account: ${companyId} → ${created.id} (${created.accountName})`);
    }

    // ── 2. Branch Locations → branches ───────────────────────────────────────
    // Maps branchIdExternal → DB branch id (used to resolve FK for contacts)
    const branchIdToBranchId = new Map<string, string>();

    for (const row of branchRows) {
        const branchIdExt = row['Branch_ID'];
        const companyId   = row['Company_ID'];
        if (!branchIdExt || !companyId) continue;

        const accountId = companyIdToAccountId.get(companyId);
        if (!accountId) {
            console.warn(`  WARN: no account found for Company_ID ${companyId}, skipping branch ${branchIdExt}`);
            continue;
        }

        const existing = await db.query.branches.findFirst({
            where: eq(branches.branchIdExternal, branchIdExt),
        });
        if (existing) {
            branchIdToBranchId.set(branchIdExt, existing.id);
            console.log(`  skip branch (exists): ${branchIdExt}`);
            continue;
        }

        // Look up parent company's procurementModel + erpSystem for context
        const parentAccount = await db.query.accounts.findFirst({
            where: eq(accounts.id, accountId),
        });

        const [created] = await db.insert(branches).values({
            accountId,
            companyIdExternal: companyId,
            branchIdExternal:  branchIdExt,
            name:              row['Branch_Name']    ?? 'Unknown Branch',
            branchType:        row['Branch_Type'],
            branchCity:        row['Branch_City'],
            branchState:       row['Branch_State'],
            branchCountry:     row['Branch_Country']  ?? row['Country'],
            billingEntityName: row['Billing_Entity'],
            billingStateProv:  row['Billing_State_Prov'],
            billingCountry:    row['Billing_Country'],
            estAnnualSpend:    row['Est_Annual_Spend'],
            skuCountEst:       row['SKU_Count_Est'] ? parseInt(row['SKU_Count_Est'], 10) : undefined,
            branchStatus:      row['Branch_Status'],
            needsReview:       yesNo(row['Needs_Review']) ?? false,
            procurementModel:  parentAccount?.procurementModel ?? undefined,
            erpSystem:         parentAccount?.erpSystem        ?? undefined,
            notes:             row['Notes'],
        }).returning();

        branchIdToBranchId.set(branchIdExt, created.id);
        console.log(`  created branch: ${branchIdExt} → ${created.id} (${created.name})`);
    }

    // ── 3. Branch Contacts → contacts ────────────────────────────────────────
    for (const row of contactRows) {
        const contactIdExt = row['Contact_ID'];
        const branchIdExt  = row['Branch_ID'];
        const companyId    = row['Company_ID'];
        if (!contactIdExt) continue;

        const accountId = companyId ? companyIdToAccountId.get(companyId) : undefined;
        const branchId  = branchIdExt ? branchIdToBranchId.get(branchIdExt) : undefined;

        if (!accountId) {
            console.warn(`  WARN: no account for Contact_ID ${contactIdExt}, skipping`);
            continue;
        }

        const existing = await db.query.contacts.findFirst({
            where: eq(contacts.contactIdExternal, contactIdExt),
        });
        if (existing) {
            console.log(`  skip contact (exists): ${contactIdExt}`);
            continue;
        }

        // Contact name: sheet uses separate First_Name / Last_Name columns
        const firstName = row['First_Name'] ?? '';
        const lastName  = row['Last_Name']  ?? '';
        const fullName  = [firstName, lastName].filter(Boolean).join(' ') || row['Contact_Name'] || 'Unknown';

        const role = row['Decision_Role'] ?? row['Contact_Role'] ?? 'contact';
        // Mark as billing contact if their role is "Economic Buyer" or explicitly flagged
        const isBilling = /economic buyer|billing/i.test(role) || row['Is_Billing_Contact']?.toUpperCase() === 'Y';
        const isPrimary = /champion|primary/i.test(role) || row['Is_Primary_Contact']?.toUpperCase() === 'Y';

        await db.insert(contacts).values({
            accountId,
            branchId:          branchId ?? undefined,
            contactIdExternal: contactIdExt,
            contactName:       fullName,
            contactTitle:      row['Title']  ?? row['Contact_Title'],
            contactEmail:      row['Email']  ?? row['Contact_Email'],
            contactRole:       role,
            contactLocation:   row['Branch_Name'] ?? row['Location'] ?? row['City'],
            phone:             row['Phone'],
            decisionRole:      row['Decision_Role'],
            isBillingContact:  isBilling,
            isPrimaryContact:  isPrimary,
        });

        console.log(`  created contact: ${contactIdExt} (${fullName})`);
    }

    console.log('\nWholesale import complete ✓');
    process.exit(0);
}

run().catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
});
