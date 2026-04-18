import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { deals } from '../src/db/schema/deals.ts';
import { accounts, contacts } from '../src/db/schema/accounts.ts';
import { eq, ilike } from 'drizzle-orm';

async function main() {
  const names = ['NorthStar', 'Badger', 'Lakeview', 'Summit'];
  for (const name of names) {
    const rows = await db.select({
      oppId: deals.opportunityId,
      contractStartDate: deals.contractStartDate,
      contractTermText: deals.contractTermText,
      opportunityTerm: deals.opportunityTerm,
      totalContractValue: deals.totalContractValue,
      opportunityAmountRollup: deals.opportunityAmountRollup,
      contractAttached: deals.contractAttached,
      readinessStatus: deals.readinessStatus,
      missingFields: deals.missingFields,
      warnings: deals.warnings,
      accountId: deals.accountId,
      accountName: accounts.accountName,
    }).from(deals)
      .leftJoin(accounts, eq(deals.accountId, accounts.id))
      .where(ilike(accounts.accountName, '%' + name + '%'));

    console.log('\n=== ' + name + ' (' + rows.length + ' deals) ===');
    rows.forEach(r => {
      console.log('  missingFields:', JSON.stringify(r.missingFields));
      console.log('  warnings:', JSON.stringify(r.warnings));
      console.log('  contractStartDate:', r.contractStartDate);
      console.log('  contractTermText:', r.contractTermText);
      console.log('  opportunityTerm:', r.opportunityTerm);
      console.log('  totalContractValue:', r.totalContractValue);
      console.log('  contractAttached:', r.contractAttached);
    });

    if (rows.length > 0) {
      const acctId = rows[0].accountId;
      const ctcts = await db.select({ name: contacts.contactName, isBilling: contacts.isBillingContact })
        .from(contacts).where(eq(contacts.accountId, acctId));
      console.log('  contacts:', ctcts.length + ' total,', ctcts.filter(c => c.isBilling).length + ' billing');
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

