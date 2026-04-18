import 'dotenv/config';
import { db } from '../src/db';
import { deals, accounts } from '../src/db/schema';
import { sql, eq } from 'drizzle-orm';

// Stage distribution
const stageRows = await db.select({
    stage: deals.oppStageRaw,
    count: sql<number>`count(*)::int`,
}).from(deals).groupBy(deals.oppStageRaw).orderBy(sql`count(*) DESC`);

console.log('=== oppStageRaw distribution ===');
stageRows.forEach(r => console.log(r.stage + ':', r.count));

// Tracker fields populated
const trackerRows = await db.select({
    total: sql<number>`count(*)::int`,
    hasDiscount: sql<number>`count(tracker_discount)::int`,
    hasNotes: sql<number>`count(tracker_notes)::int`,
    hasYear1: sql<number>`count(tracker_year_1_price)::int`,
}).from(deals);
console.log('\n=== Tracker fields ===', trackerRows[0]);

// Closed Won by owner
const closedWonByOwner = await db.select({
    owner: deals.opportunityOwner,
    count: sql<number>`count(*)::int`,
    total: sql<number>`sum(opportunity_amount_rollup::numeric)::float`,
}).from(deals).where(sql`opp_stage_raw = 'Closed Won'`).groupBy(deals.opportunityOwner).orderBy(sql`sum(opportunity_amount_rollup::numeric) DESC`);

console.log('\n=== Closed Won by Owner ===');
closedWonByOwner.forEach(r => console.log(JSON.stringify(r)));

// Open pipeline by owner
const openByOwner = await db.select({
    owner: deals.opportunityOwner,
    stage: deals.oppStageRaw,
    count: sql<number>`count(*)::int`,
    value: sql<number>`sum(opportunity_amount_rollup::numeric)::float`,
}).from(deals)
  .where(sql`opp_stage_raw NOT IN ('Closed Won', 'Closed Lost ')`)
  .groupBy(deals.opportunityOwner, deals.oppStageRaw)
  .orderBy(deals.opportunityOwner);

console.log('\n=== Open pipeline by Owner/Stage ===');
openByOwner.forEach(r => console.log(JSON.stringify(r)));

process.exit(0);

