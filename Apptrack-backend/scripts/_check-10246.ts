import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { deals, dealLineItems } from '../src/db/schema/deals.ts';
import { accounts } from '../src/db/schema/accounts.ts';
import { eq, or } from 'drizzle-orm';

const targets = ['OPP-10246', 'OPP-10248', 'OPP-10176', 'OPP-10176'];

const rows = await db.select({
  oppId: deals.opportunityId,
  id: deals.id,
  acct: accounts.accountName,
  startDate: deals.contractStartDate,
  termText: deals.contractTermText,
  value: deals.totalContractValue,
  attached: deals.contractAttached,
  missing: deals.missingFields,
}).from(deals)
  .leftJoin(accounts, eq(deals.accountId, accounts.id))
  .where(or(
    eq(deals.opportunityId, 'OPP-10246'),
    eq(deals.opportunityId, 'OPP-10248'),
    eq(deals.opportunityId, 'OPP-10176'),
  ));

if (rows.length === 0) {
  console.log('OPP-10246 does NOT exist in the database.');
} else {
  for (const r of rows) {
    console.log(`\n=== ${r.oppId} | ${r.acct} | id=${r.id}`);
    console.log(`  contractStartDate : ${r.startDate}`);
    console.log(`  contractTermText  : ${r.termText}`);
    console.log(`  totalContractValue: ${r.value}`);
    console.log(`  contractAttached  : ${r.attached}`);
    console.log(`  missingFields     : ${JSON.stringify(r.missing)}`);
    const li = await db.select().from(dealLineItems).where(eq(dealLineItems.dealId, r.id));
    console.log(`  line items        : ${li.length}`);
    if (li.length > 0) li.forEach(l => console.log(`    - ${l.productNameSnapshot} qty=${l.quantity} price=${l.unitPrice}`));
  }
}

process.exit(0);

