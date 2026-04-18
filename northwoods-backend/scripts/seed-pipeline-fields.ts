/**
 * seed-pipeline-fields.ts
 * Populates pipelineStage, probability, forecastCategory, and nextStep
 * for all Open (oppStageRaw = 'Open') deals so the Pipeline page has
 * meaningful sales-side data for the demo.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, ilike } from 'drizzle-orm';
import { deals } from '../src/db/schema/deals';

const DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://neondb_owner:npg_ORoXzr20sMEp@ep-bold-feather-anja5zh7.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema: { deals } });

// Sales pipeline stages in order of progression
const PIPELINE_STAGES = [
    { stage: 'Prospecting',     probability: 10, forecastCategory: 'Pipeline' },
    { stage: 'Discovery',       probability: 25, forecastCategory: 'Pipeline' },
    { stage: 'Demo/Evaluation', probability: 40, forecastCategory: 'Pipeline' },
    { stage: 'Proposal Sent',   probability: 60, forecastCategory: 'Best Case' },
    { stage: 'Negotiation',     probability: 75, forecastCategory: 'Best Case' },
    { stage: 'Verbal Commit',   probability: 90, forecastCategory: 'Commit'   },
];

// Realistic next-step text per stage
const NEXT_STEPS: Record<string, string[]> = {
    'Prospecting':     ['Send intro deck', 'Schedule discovery call', 'LinkedIn outreach', 'Research org chart'],
    'Discovery':       ['Follow-up discovery call', 'Confirm use-case fit', 'Map stakeholders', 'Send case study'],
    'Demo/Evaluation': ['Run product demo', 'Technical deep-dive', 'Intro to CS team', 'Provide trial access'],
    'Proposal Sent':   ['Follow up on proposal', 'Address pricing objections', 'Executive alignment call', 'Prepare ROI model'],
    'Negotiation':     ['Legal redlines review', 'Finalize discount approval', 'Send MSA', 'Exec sponsor meeting'],
    'Verbal Commit':   ['Send DocuSign', 'Confirm billing contact', 'Schedule kickoff', 'CO countersignature'],
};

function pick<T>(arr: T[], seed: number): T {
    return arr[seed % arr.length];
}

async function main() {
    // Fetch all Open deals
    const openDeals = await db
        .select({ id: deals.id, opportunityName: deals.opportunityName })
        .from(deals)
        .where(ilike(deals.oppStageRaw, 'Open'));

    console.log(`Found ${openDeals.length} Open deals — seeding pipeline fields…`);

    let updated = 0;
    for (let i = 0; i < openDeals.length; i++) {
        const deal = openDeals[i];
        // Distribute deals across stages: weight earlier stages more
        // Stage index: 0-1 → Prospecting/Discovery (40%), 2-3 → Demo/Proposal (35%), 4-5 → Nego/Commit (25%)
        const weights = [2, 2, 2, 2, 1, 1]; // relative weight per stage
        const pool: number[] = [];
        weights.forEach((w, idx) => { for (let k = 0; k < w; k++) pool.push(idx); });
        const stageIdx = pool[(i * 7 + 3) % pool.length];
        const stageData = PIPELINE_STAGES[stageIdx];
        const nextStepOptions = NEXT_STEPS[stageData.stage] ?? ['Follow up'];
        const nextStep = pick(nextStepOptions, i * 3 + 1);

        await db
            .update(deals)
            .set({
                pipelineStage: stageData.stage,
                probability: stageData.probability,
                forecastCategory: stageData.forecastCategory,
                nextStep,
            })
            .where(eq(deals.id, deal.id));
        updated++;
    }

    console.log(`✅ Updated ${updated} Open deals with pipeline stage data.`);

    // Print distribution
    const staged = await db
        .select({ pipeline_stage: deals.pipelineStage, prob: deals.probability })
        .from(deals)
        .where(ilike(deals.oppStageRaw, 'Open'));

    const dist: Record<string, number> = {};
    for (const row of staged) {
        const key = `${row.pipeline_stage} (${row.prob}%)`;
        dist[key] = (dist[key] ?? 0) + 1;
    }
    console.log('\nDistribution:');
    for (const [k, v] of Object.entries(dist)) {
        console.log(`  ${k}: ${v} deals`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });

