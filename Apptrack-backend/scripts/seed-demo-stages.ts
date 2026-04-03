/**
 * seed-demo-stages.ts
 *
 * For demo purposes: marks ~40% of deals as ready.
 *   • 30% → ready_for_invoice  (readiness: ready, missingFields: [])
 *   • 10% → invoiced           (readiness: ready, missingFields: [])
 *   • 60% → unchanged
 *
 * Only touches deals in needs_info or closed_won stage (skips already-invoiced/disputed).
 * Run: npx tsx scripts/seed-demo-stages.ts
 */

import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { deals } from "../src/db/schema/deals.ts";

/** Seeded shuffle — deterministic so re-runs give the same result */
function seededShuffle<T>(arr: T[], seed: number): T[] {
    const a = [...arr];
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

async function main() {
    console.log("\n🎬  Seeding demo stages…\n");

    // Load all deals that are eligible to be promoted
    const allDeals = await db.select({
        id: deals.id,
        dealStage: deals.dealStage,
        readinessStatus: deals.readinessStatus,
    }).from(deals);

    // Only touch deals that aren't already in a terminal / manually-set state
    const eligible = allDeals.filter(
        d => d.dealStage === 'needs_info' || d.dealStage === 'closed_won'
    );

    console.log(`  Total deals      : ${allDeals.length}`);
    console.log(`  Eligible to seed : ${eligible.length}  (needs_info + closed_won)\n`);

    const shuffled = seededShuffle(eligible, 42);
    const total = shuffled.length;

    // 30% ready_for_invoice, 10% invoiced
    const readyCount   = Math.round(total * 0.30);
    const invoicedCount = Math.round(total * 0.10);

    const readyIds    = shuffled.slice(0, readyCount).map(d => d.id);
    const invoicedIds = shuffled.slice(readyCount, readyCount + invoicedCount).map(d => d.id);

    console.log(`  → Marking ${readyIds.length} deals as ready_for_invoice`);
    console.log(`  → Marking ${invoicedIds.length} deals as invoiced`);
    console.log();

    // Update in two batches
    if (readyIds.length > 0) {
        await db.update(deals).set({
            dealStage: 'ready_for_invoice',
            readinessStatus: 'ready',
            missingFields: [],
            warnings: [],
        }).where(inArray(deals.id, readyIds));
        console.log(`  ✓  ${readyIds.length} deals → ready_for_invoice`);
    }

    if (invoicedIds.length > 0) {
        await db.update(deals).set({
            dealStage: 'invoiced',
            readinessStatus: 'ready',
            missingFields: [],
            warnings: [],
        }).where(inArray(deals.id, invoicedIds));
        console.log(`  ✓  ${invoicedIds.length} deals → invoiced`);
    }

    // Final count
    const after = await db.select({ dealStage: deals.dealStage }).from(deals);
    const stageCounts: Record<string, number> = {};
    for (const d of after) stageCounts[d.dealStage] = (stageCounts[d.dealStage] ?? 0) + 1;

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Stage breakdown after seed:");
    for (const [stage, count] of Object.entries(stageCounts).sort()) {
        const pct = ((count / after.length) * 100).toFixed(1);
        console.log(`    ${stage.padEnd(20)} ${String(count).padStart(4)}  (${pct}%)`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
}

main().catch(err => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
});

