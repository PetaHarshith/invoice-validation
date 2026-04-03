import { Router, Request, Response } from 'express';
import { eq, ilike, and, sql, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { deals, accounts, contacts, dealLineItems } from '../db/schema';
import { computeReadiness, autoAdvanceStage } from '../lib/readiness';

const router = Router();

const VALID_STAGES = ['closed_won', 'needs_info', 'ready_for_invoice', 'invoiced', 'disputed'] as const;
const VALID_READINESS = ['ready', 'warning', 'blocked'] as const;

// ── GET /deals/pipeline-stats ─────────────────────────────────────────────────
// Sales-team view: owner leaderboard + stage breakdown from the raw CRM stage field.
router.get('/pipeline-stats', async (_req: Request, res: Response) => {
    try {
        const [byStage, byOwner, byType] = await Promise.all([
            // Stage counts based on oppStageRaw
            db.select({
                stage: deals.oppStageRaw,
                count: sql<number>`count(*)::int`,
                totalValue: sql<number>`coalesce(sum(opportunity_amount_rollup::numeric), 0)::float`,
            }).from(deals).groupBy(deals.oppStageRaw).orderBy(sql`count(*) desc`),

            // Per-owner: closed won vs open pipeline
            db.select({
                owner: deals.opportunityOwner,
                wonCount: sql<number>`count(*) filter (where opp_stage_raw = 'Closed Won')::int`,
                wonValue: sql<number>`coalesce(sum(opportunity_amount_rollup::numeric) filter (where opp_stage_raw = 'Closed Won'), 0)::float`,
                openCount: sql<number>`count(*) filter (where opp_stage_raw = 'Open')::int`,
                openValue: sql<number>`coalesce(sum(opportunity_amount_rollup::numeric) filter (where opp_stage_raw = 'Open'), 0)::float`,
                lostCount: sql<number>`count(*) filter (where opp_stage_raw ilike 'Closed Lost%')::int`,
                hasTrackerData: sql<boolean>`bool_or(tracker_notes is not null)`,
            }).from(deals).groupBy(deals.opportunityOwner).orderBy(sql`sum(opportunity_amount_rollup::numeric) filter (where opp_stage_raw = 'Closed Won') desc nulls last`),

            // Opportunity type breakdown
            db.select({
                type: deals.opportunityType,
                count: sql<number>`count(*)::int`,
                wonCount: sql<number>`count(*) filter (where opp_stage_raw = 'Closed Won')::int`,
                openCount: sql<number>`count(*) filter (where opp_stage_raw = 'Open')::int`,
            }).from(deals).groupBy(deals.opportunityType).orderBy(sql`count(*) desc`),
        ]);

        // Compute overall totals
        const totals = byStage.reduce((acc, row) => {
            const stage = (row.stage ?? '').trim().toLowerCase();
            if (stage === 'closed won') { acc.wonCount += row.count; acc.wonValue += row.totalValue; }
            else if (stage === 'open') { acc.openCount += row.count; acc.openValue += row.totalValue; }
            else if (stage.startsWith('closed lost')) { acc.lostCount += row.count; }
            acc.totalCount += row.count;
            return acc;
        }, { wonCount: 0, wonValue: 0, openCount: 0, openValue: 0, lostCount: 0, totalCount: 0 });

        return res.json({ totals, byStage, byOwner, byType });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load pipeline stats' });
    }
});

// ── GET /deals/stats ─────────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
    try {
        const [stageCounts, readinessCounts, totalResult] = await Promise.all([
            db.select({ stage: deals.dealStage, count: sql<number>`count(*)::int` })
                .from(deals)
                .groupBy(deals.dealStage),
            db.select({
                // Count by readiness_status — these are the real operational numbers
                blockedCount: sql<number>`count(*) filter (where ${deals.readinessStatus} = 'blocked')::int`,
                readyCount: sql<number>`count(*) filter (where ${deals.readinessStatus} = 'ready')::int`,
                warningCount: sql<number>`count(*) filter (where ${deals.readinessStatus} = 'warning')::int`,
            }).from(deals),
            db.select({ total: sql<number>`count(*)::int` }).from(deals),
        ]);

        const byStatus = Object.fromEntries(VALID_STAGES.map(s => [s, 0]));
        for (const row of stageCounts) {
            byStatus[row.stage] = row.count;
        }

        const rc = readinessCounts[0];
        return res.json({
            total: totalResult[0]?.total ?? 0,
            byStatus,
            // readyCount / blockedCount are based on readinessStatus, not dealStage
            readyCount: rc?.readyCount ?? 0,
            blockedCount: rc?.blockedCount ?? 0,
            warningCount: rc?.warningCount ?? 0,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load stats' });
    }
});

// ── GET /deals/action-center ──────────────────────────────────────────────────
// Returns top stale needs_info deals and top ready_for_invoice deals for the
// home-page action center. Both lists are sorted oldest-updated-first so the
// longest-waiting items surface at the top.
router.get('/action-center', async (_req: Request, res: Response) => {
    try {
        const baseSelect = {
            id: deals.id,
            opportunityName: deals.opportunityName,
            accountName: accounts.accountName,
            opportunityOwner: deals.opportunityOwner,
            totalContractValue: deals.totalContractValue,
            opportunityAmountRollup: deals.opportunityAmountRollup,
            oppCloseDate: deals.oppCloseDate,
            missingFields: deals.missingFields,
            updatedAt: deals.updatedAt,
        };

        const [needsInfo, readyForInvoice] = await Promise.all([
            // Stale needs_info — oldest updated first
            db.select(baseSelect)
                .from(deals)
                .leftJoin(accounts, eq(deals.accountId, accounts.id))
                .where(eq(deals.dealStage, 'needs_info'))
                .orderBy(asc(deals.updatedAt))
                .limit(8),

            // Ready for invoice — waiting longest first
            db.select(baseSelect)
                .from(deals)
                .leftJoin(accounts, eq(deals.accountId, accounts.id))
                .where(eq(deals.dealStage, 'ready_for_invoice'))
                .orderBy(asc(deals.updatedAt))
                .limit(8),
        ]);

        return res.json({ needsInfo, readyForInvoice });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load action center data' });
    }
});

// ── GET /deals ────────────────────────────────────────────────────────────────
// Returns deals joined with their account name for display.
// Search filters on opportunity_name or opportunity_owner (both on deals table).
// To search by account name, join is required — done inline below.
router.get('/', async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search as string)?.trim();
        const stage = req.query.stage as string;
        const oppStage = (req.query.oppStage as string)?.trim(); // raw CRM stage filter
        const pipelineStage = (req.query.pipelineStage as string)?.trim(); // sales funnel stage filter
        const owner = (req.query.owner as string)?.trim();
        const type = (req.query.type as string)?.trim();
        const sort = req.query.sort as string;

        const filters: ReturnType<typeof eq>[] = [];
        if (search) {
            filters.push(ilike(accounts.accountName, `%${search}%`));
        }
        if (stage && VALID_STAGES.includes(stage as typeof VALID_STAGES[number])) {
            filters.push(eq(deals.dealStage, stage as typeof VALID_STAGES[number]));
        }
        if (oppStage) {
            filters.push(ilike(deals.oppStageRaw, oppStage));
        }
        if (pipelineStage) {
            filters.push(ilike(deals.pipelineStage, pipelineStage));
        }
        if (owner) {
            filters.push(ilike(deals.opportunityOwner, owner));
        }
        if (type) {
            filters.push(ilike(deals.opportunityType, type));
        }

        const where = filters.length ? and(...filters) : undefined;

        const orderBy = sort === 'opportunityOwner'
            ? asc(deals.opportunityOwner)
            : sort === 'oppCloseDate'
                ? desc(deals.oppCloseDate)
                : desc(deals.createdAt);

        const [rows, countResult] = await Promise.all([
            db
                .select({
                    id: deals.id,
                    opportunityId: deals.opportunityId,
                    opportunityName: deals.opportunityName,
                    opportunityOwner: deals.opportunityOwner,
                    opportunityType: deals.opportunityType,
                    oppCloseDate: deals.oppCloseDate,
                    oppStageRaw: deals.oppStageRaw,
                    dealStage: deals.dealStage,
                    readinessStatus: deals.readinessStatus,
                    opportunityAmountRollup: deals.opportunityAmountRollup,
                    totalContractValue: deals.totalContractValue,
                    contractAttached: deals.contractAttached,
                    contractStartDate: deals.contractStartDate,
                    missingFields: deals.missingFields,
                    warnings: deals.warnings,
                    accountId: deals.accountId,
                    accountName: accounts.accountName,
                    // Pipeline context fields
                    pipelineStage: deals.pipelineStage,
                    probability: deals.probability,
                    nextStep: deals.nextStep,
                    forecastCategory: deals.forecastCategory,
                    campaign: deals.campaign,
                    // Tom's tracker enrichment
                    trackerDiscount: deals.trackerDiscount,
                    trackerYear1Price: deals.trackerYear1Price,
                    trackerNotes: deals.trackerNotes,
                    createdAt: deals.createdAt,
                    updatedAt: deals.updatedAt,
                })
                .from(deals)
                .leftJoin(accounts, eq(deals.accountId, accounts.id))
                .where(where)
                .orderBy(orderBy)
                .limit(limit)
                .offset(offset),
            db.select({ total: sql<number>`count(*)::int` })
                .from(deals)
                .leftJoin(accounts, eq(deals.accountId, accounts.id))
                .where(where),
        ]);

        const total = countResult[0]?.total ?? 0;
        return res.json({
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch deals' });
    }
});

// ── GET /deals/:id ────────────────────────────────────────────────────────────
// Returns the full deal detail: deal + account + account's contacts + line items.
// This is the "one place per deal" view for finance to review everything.
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const deal = await db.query.deals.findFirst({
            where: eq(deals.id, id),
            with: {
                account: {
                    with: { contacts: true },
                },
                lineItems: {
                    orderBy: [asc(dealLineItems.lineOrder)],
                },
            },
        });

        if (!deal) return res.status(404).json({ error: 'Deal not found' });
        return res.json({ data: deal });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch deal' });
    }
});

// Zod schema aligned with the normalized deals table
const DealSchema = z.object({
    accountId: z.string().uuid(),
    opportunityId: z.string().optional().nullable(),
    opportunityName: z.string().optional().nullable(),
    opportunityOwner: z.string().optional().nullable(),
    opportunityType: z.string().optional().nullable(),
    oppCreatedDate: z.string().optional().nullable(),
    oppCloseDate: z.string().optional().nullable(),
    oppStageRaw: z.string().optional().nullable(),
    dealStage: z.enum(VALID_STAGES).optional(),
    readinessStatus: z.enum(VALID_READINESS).optional(),
    opportunityAmountRollup: z.string().optional().nullable(),
    opportunityTerm: z.string().optional().nullable(),
    opportunitySource: z.string().optional().nullable(),
    opportunityCloseReason: z.string().optional().nullable(),
    opportunityNotes: z.string().optional().nullable(),
    // Snapshot fields
    accountProductSnapshot: z.string().optional().nullable(),
    accountTotalSeatsSnapshot: z.number().int().optional().nullable(),
    primaryContactNameSnapshot: z.string().optional().nullable(),
    primaryContactTitleSnapshot: z.string().optional().nullable(),
    primaryContactLocationSnapshot: z.string().optional().nullable(),
    // Contract fields
    contractStartDate: z.string().optional().nullable(),
    contractTermText: z.string().optional().nullable(),
    totalContractValue: z.string().optional().nullable(),
    contractAttached: z.boolean().optional(),
    // Structured context
    pricingContext: z.string().optional().nullable(),
    rolloutContext: z.string().optional().nullable(),
    specialRemarks: z.string().optional().nullable(),
    // Sales tracker enrichment — used by readiness to detect discount-driven warnings
    trackerDiscount: z.number().optional().nullable(),
    trackerYear1Price: z.number().optional().nullable(),
    trackerNotes: z.string().optional().nullable(),
    // Pipeline context — sales-side only, never touches readiness logic
    pipelineStage: z.string().optional().nullable(),
    probability: z.number().int().min(0).max(100).optional().nullable(),
    nextStep: z.string().optional().nullable(),
    forecastCategory: z.string().optional().nullable(),
    campaign: z.string().optional().nullable(),
    // Readiness diagnostics
    missingFields: z.array(z.string()).optional().nullable(),
    warnings: z.array(z.string()).optional().nullable(),
    financeResearch: z.string().optional().nullable(),
});

// ── helpers ───────────────────────────────────────────────────────────────────
/** Fetch account's contacts and deal's line items, then run the readiness checker. */
async function recomputeReadiness(
    dealData: z.infer<typeof DealSchema>,
    dealId?: string
) {
    const [accountContacts, lineItemRows] = await Promise.all([
        dealData.accountId
            ? db.select().from(contacts).where(eq(contacts.accountId, dealData.accountId))
            : Promise.resolve([]),
        dealId
            ? db.select().from(dealLineItems).where(eq(dealLineItems.dealId, dealId))
            : Promise.resolve([]),
    ]);
    return computeReadiness(dealData, accountContacts, lineItemRows);
}

// ── POST /deals ───────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = DealSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

        // Compute readiness before insert (no line items yet on a new deal)
        const { readinessStatus, missingFields, warnings } = await recomputeReadiness(parsed.data);

        const [created] = await db.insert(deals).values({
            ...parsed.data,
            readinessStatus,
            missingFields,
            warnings,
        }).returning();
        return res.status(201).json({ data: created });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create deal' });
    }
});

// ── PUT /deals/:id ────────────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const parsed = DealSchema.partial().safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

        // Load the existing deal so we can merge for readiness computation
        const [existing] = await db.select().from(deals).where(eq(deals.id, id));
        if (!existing) return res.status(404).json({ error: 'Deal not found' });

        // Merge incoming update with existing values for a complete readiness check
        const merged = { ...existing, ...parsed.data } as z.infer<typeof DealSchema>;
        const { readinessStatus, missingFields, warnings } = await recomputeReadiness(merged, id);

        // ── Stage Gate ────────────────────────────────────────────────────────
        // A deal cannot be moved to ready_for_invoice if it is still blocked.
        if (parsed.data.dealStage === 'ready_for_invoice' && readinessStatus === 'blocked') {
            return res.status(400).json({
                error: 'Stage gate: deal cannot move to ready_for_invoice while blocked',
                missingFields,
                warnings,
            });
        }

        // Auto-advance needs_info → ready_for_invoice when all blockers are resolved.
        const resolvedStage = autoAdvanceStage(
            parsed.data.dealStage ?? existing.dealStage,
            readinessStatus
        ) as typeof existing.dealStage;

        const [updated] = await db
            .update(deals)
            .set({ ...parsed.data, dealStage: resolvedStage, readinessStatus, missingFields, warnings })
            .where(eq(deals.id, id))
            .returning();

        return res.json({ data: updated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update deal' });
    }
});

// ── POST /deals/:id/line-items ────────────────────────────────────────────────
// Adds a single line item to the deal then recomputes readiness.
const LineItemSchema = z.object({
    productNameSnapshot: z.string().min(1),
    skuId: z.string().optional().nullable(),
    quantity: z.number().int().min(1).optional().nullable(),
    unitPrice: z.string().optional().nullable(),
    lineTotal: z.string().optional().nullable(),
    billingFrequency: z.string().optional().nullable(),
    lineType: z.string().optional().nullable(),
});

router.post('/:id/line-items', async (req: Request, res: Response) => {
    try {
        const dealId = req.params.id as string;
        const parsed = LineItemSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

        const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
        if (!existing) return res.status(404).json({ error: 'Deal not found' });

        // Determine next line order
        const existingItems = await db.select({ lineOrder: dealLineItems.lineOrder })
            .from(dealLineItems).where(eq(dealLineItems.dealId, dealId));
        const nextOrder = existingItems.length > 0
            ? Math.max(...existingItems.map(i => i.lineOrder)) + 1
            : 1;

        const [inserted] = await db.insert(dealLineItems).values({
            dealId,
            lineOrder: nextOrder,
            ...parsed.data,
        }).returning();

        // Recompute readiness with the new line item included
        const merged = { ...existing } as z.infer<typeof DealSchema>;
        const { readinessStatus, missingFields, warnings } = await recomputeReadiness(merged, dealId);
        const resolvedStage = autoAdvanceStage(existing.dealStage, readinessStatus) as typeof existing.dealStage;
        await db.update(deals)
            .set({ dealStage: resolvedStage, readinessStatus, missingFields, warnings })
            .where(eq(deals.id, dealId));

        return res.json({ data: inserted, readinessStatus, missingFields, warnings });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to add line item' });
    }
});

// ── PATCH /deals/:id/line-items/:lineItemId ───────────────────────────────────
// Partial update of an existing line item, then recomputes readiness.
router.patch('/:id/line-items/:lineItemId', async (req: Request, res: Response) => {
    try {
        const { id: dealId, lineItemId } = req.params as { id: string; lineItemId: string };

        const parsed = LineItemSchema.partial().safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
        if (Object.keys(parsed.data).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
        if (!existing) return res.status(404).json({ error: 'Deal not found' });

        const [updated] = await db
            .update(dealLineItems)
            .set(parsed.data)
            .where(eq(dealLineItems.id, lineItemId))
            .returning();
        if (!updated) return res.status(404).json({ error: 'Line item not found' });

        // Recompute readiness with the updated line item included
        const merged = { ...existing } as z.infer<typeof DealSchema>;
        const { readinessStatus, missingFields, warnings } = await recomputeReadiness(merged, dealId);
        const resolvedStage = autoAdvanceStage(existing.dealStage, readinessStatus) as typeof existing.dealStage;
        await db.update(deals)
            .set({ dealStage: resolvedStage, readinessStatus, missingFields, warnings })
            .where(eq(deals.id, dealId));

        return res.json({ data: updated, readinessStatus, missingFields, warnings });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update line item' });
    }
});

// ── DELETE /deals/:id/line-items/:lineItemId ──────────────────────────────────
router.delete('/:id/line-items/:lineItemId', async (req: Request, res: Response) => {
    try {
        const { id: dealId, lineItemId } = req.params as { id: string; lineItemId: string };

        const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
        if (!existing) return res.status(404).json({ error: 'Deal not found' });

        const [deleted] = await db.delete(dealLineItems)
            .where(eq(dealLineItems.id, lineItemId))
            .returning();
        if (!deleted) return res.status(404).json({ error: 'Line item not found' });

        // Recompute readiness after removal
        const merged = { ...existing } as z.infer<typeof DealSchema>;
        const { readinessStatus, missingFields, warnings } = await recomputeReadiness(merged, dealId);
        const resolvedStage = autoAdvanceStage(existing.dealStage, readinessStatus) as typeof existing.dealStage;
        await db.update(deals)
            .set({ dealStage: resolvedStage, readinessStatus, missingFields, warnings })
            .where(eq(deals.id, dealId));

        return res.json({ data: deleted, readinessStatus, missingFields, warnings });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to delete line item' });
    }
});

// ── DELETE /deals/:id ─────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const [deleted] = await db.delete(deals).where(eq(deals.id, id)).returning();
        if (!deleted) return res.status(404).json({ error: 'Deal not found' });
        return res.json({ data: deleted });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to delete deal' });
    }
});

export default router;

