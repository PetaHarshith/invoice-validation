/**
 * import-product-catalog.ts
 *
 * Reads the "Product Catalog V2" sheet from the Northwoods product catalog
 * workbook and upserts every row into the product_catalog table via Drizzle.
 *
 * Run:
 *   npm run import:product-catalog
 *   -- or --
 *   npx tsx scripts/import-product-catalog.ts
 */

import "dotenv/config";
import path from "path";
import { createRequire } from "module";
import { eq } from "drizzle-orm";

// xlsx is a CommonJS package — use createRequire in this ESM project
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");
import { db } from "../src/db/index.ts";
import { productCatalog } from "../src/db/schema/products.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKBOOK_PATH = "/Users/harshithpeta/Downloads/Day 1 Afternoon/northwoods_product_catalog_V2.xlsx";
const SHEET_NAME = "Product Catalog V2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trim and convert empty strings to null. */
function cleanString(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
}

/** Parse a numeric value safely; return null on failure. */
function cleanNumber(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
}

/** Shape of a raw row from the worksheet (after header normalisation). */
interface RawRow {
    sku_id: unknown;
    product_name: unknown;
    product_category: unknown;
    included_seats: unknown;
    base_price_usd: unknown;
    billing_frequency: unknown;
    product_type: unknown;
    product_description: unknown;
    recommendations: unknown;
    dependencies: unknown;
    restrictions: unknown;
    discount_approval: unknown;
}

/**
 * Map a raw worksheet row to the Drizzle insert shape.
 * Returns null when the SKU is missing (row cannot be imported).
 */
function normalizeRow(raw: RawRow): typeof productCatalog.$inferInsert | null {
    const skuId = cleanString(raw.sku_id);
    if (!skuId) return null; // Can't upsert without a SKU

    const basePriceRaw = cleanNumber(raw.base_price_usd);

    return {
        skuId,
        productName: cleanString(raw.product_name) ?? skuId, // fall back to SKU if name missing
        productCategory: cleanString(raw.product_category),
        includedSeats: cleanNumber(raw.included_seats) != null
            ? Math.round(cleanNumber(raw.included_seats) as number)
            : null,
        basePriceUsd: basePriceRaw != null ? String(basePriceRaw) : null,
        billingFrequency: cleanString(raw.billing_frequency),
        productType: cleanString(raw.product_type),
        productDescription: cleanString(raw.product_description),
        recommendations: cleanString(raw.recommendations),
        dependencies: cleanString(raw.dependencies),
        restrictions: cleanString(raw.restrictions),
        discountApproval: cleanString(raw.discount_approval),
    };
}

// ---------------------------------------------------------------------------
// Header normalisation map
// Workbook column name -> internal snake_case key
// ---------------------------------------------------------------------------

const HEADER_MAP: Record<string, keyof RawRow> = {
    "SKU (Unique ID)": "sku_id",
    "Product Name": "product_name",
    "Product Category": "product_category",
    "Included Seats": "included_seats",
    "Base Price (USD)": "base_price_usd",
    "Billing Frequency": "billing_frequency",
    "Type": "product_type",
    "Product Description": "product_description",
    "Recommendations": "recommendations",
    "Dependancies": "dependencies", // normalize source typo
    "Dependencies": "dependencies", // accept correct spelling too
    "Restrictions": "restrictions",
    "Discount Approval": "discount_approval",
    "Discount Approval ": "discount_approval", // trailing space variant
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const absPath = path.resolve(WORKBOOK_PATH);
    console.log(`\n📂  Reading workbook: ${absPath}`);

    const workbook = XLSX.readFile(absPath);

    if (!workbook.SheetNames.includes(SHEET_NAME)) {
        console.error(`❌  Sheet "${SHEET_NAME}" not found.`);
        console.error(`    Available sheets: ${workbook.SheetNames.join(", ")}`);
        process.exit(1);
    }

    const sheet = workbook.Sheets[SHEET_NAME]!;

    // Read as array-of-arrays so we can manually map headers (handles trailing
    // spaces and typos reliably).
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

    if (rows.length < 2) {
        console.error("❌  Sheet has no data rows.");
        process.exit(1);
    }

    // First row = headers
    const headerRow = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
    const dataRows = rows.slice(1);

    console.log(`📊  Sheet: "${SHEET_NAME}" — ${dataRows.length} data row(s) found`);
    console.log(`🗂️   Headers detected: ${headerRow.join(" | ")}\n`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const skippedSkus: string[] = [];



    for (const dataRow of dataRows) {
        // Build a RawRow by mapping each cell to its normalised key
        const raw: Partial<RawRow> = {};
        headerRow.forEach((header, colIdx) => {
            const key = HEADER_MAP[header];
            if (key) {
                raw[key] = (dataRow as unknown[])[colIdx] ?? null;
            }
        });

        const normalized = normalizeRow(raw as RawRow);

        if (!normalized) {
            skipped++;
            skippedSkus.push(String(raw.sku_id ?? "(empty)"));
            continue;
        }

        // Check if this SKU already exists
        const existing = await db
            .select({ id: productCatalog.id })
            .from(productCatalog)
            .where(eq(productCatalog.skuId, normalized.skuId))
            .limit(1);

        if (existing.length > 0) {
            // Update existing row (exclude id, skuId, createdAt)
            await db
                .update(productCatalog)
                .set({
                    productName: normalized.productName,
                    productCategory: normalized.productCategory,
                    includedSeats: normalized.includedSeats,
                    basePriceUsd: normalized.basePriceUsd,
                    billingFrequency: normalized.billingFrequency,
                    productType: normalized.productType,
                    productDescription: normalized.productDescription,
                    recommendations: normalized.recommendations,
                    dependencies: normalized.dependencies,
                    restrictions: normalized.restrictions,
                    discountApproval: normalized.discountApproval,
                })
                .where(eq(productCatalog.skuId, normalized.skuId));
            updated++;
            console.log(`  ↻  Updated  SKU: ${normalized.skuId} — ${normalized.productName}`);
        } else {
            await db.insert(productCatalog).values(normalized);
            inserted++;
            console.log(`  ✚  Inserted SKU: ${normalized.skuId} — ${normalized.productName}`);
        }
    }

    // Summary
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Import complete");
    console.log(`  Rows read  : ${dataRows.length}`);
    console.log(`  Inserted   : ${inserted}`);
    console.log(`  Updated    : ${updated}`);
    console.log(`  Skipped    : ${skipped}`);
    if (skippedSkus.length > 0) {
        console.log(`  Skipped SKUs (missing sku_id): ${skippedSkus.join(", ")}`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌  Import failed:", err);
    process.exit(1);
});
