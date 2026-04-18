import pg from 'pg';
const { Client } = pg;

const client = new Client('postgresql://neondb_owner:npg_ORoXzr20sMEp@ep-bold-feather-anja5zh7.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require');
await client.connect();

// Check oppStageRaw distribution
const r1 = await client.query('SELECT opp_stage_raw, count(*)::int FROM deals GROUP BY opp_stage_raw ORDER BY count(*) DESC');
console.log('=== oppStageRaw distribution ===');
r1.rows.forEach(r => console.log(r.opp_stage_raw + ':', r.count));

// Check tracker fields
const r2 = await client.query('SELECT count(*)::int as total, count(tracker_discount)::int as has_discount, count(tracker_notes)::int as has_notes, count(tracker_year_1_price)::int as has_year1 FROM deals');
console.log('\n=== Tracker fields populated ===');
console.log(r2.rows[0]);

// Check pipeline_stage distribution
const r3 = await client.query('SELECT pipeline_stage, count(*)::int FROM deals GROUP BY pipeline_stage ORDER BY count(*) DESC LIMIT 10');
console.log('\n=== pipelineStage distribution ===');
r3.rows.forEach(r => console.log(r.pipeline_stage + ':', r.count));

// Owner distribution for open deals
const r4 = await client.query(`
  SELECT opportunity_owner, opp_stage_raw, count(*)::int as cnt,
    sum(opportunity_amount_rollup::numeric)::float as total_value
  FROM deals
  WHERE opp_stage_raw IN ('Open', 'Prospect', 'Decision Maker Demo', 'Team Demo', 'Demo Scheduled', 'contact made', 'Proposal Made')
  GROUP BY opportunity_owner, opp_stage_raw
  ORDER BY opportunity_owner, cnt DESC
`);
console.log('\n=== Owner/Stage distribution (open pipeline) ===');
r4.rows.forEach(r => console.log(JSON.stringify(r)));

// Closed won by owner
const r5 = await client.query(`
  SELECT opportunity_owner, count(*)::int as deals_won,
    sum(opportunity_amount_rollup::numeric)::float as total_won
  FROM deals
  WHERE opp_stage_raw = 'Closed Won'
  GROUP BY opportunity_owner
  ORDER BY total_won DESC
`);
console.log('\n=== Closed Won by owner ===');
r5.rows.forEach(r => console.log(JSON.stringify(r)));

await client.end();

