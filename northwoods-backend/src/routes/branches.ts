import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { branches, contacts, dealLineItems } from '../db/schema';

const router = Router();

// ── GET /branches?accountId=<uuid> ───────────────────────────────────────────
// Returns all branches for an account, with their contacts and line items.
// Used by the Deal Detail page to render the Branches section.
router.get('/', async (req: Request, res: Response) => {
    try {
        const { accountId } = req.query as { accountId?: string };
        if (!accountId) return res.status(400).json({ error: 'accountId is required' });

        const rows = await db.query.branches.findMany({
            where: eq(branches.accountId, accountId),
            with: {
                contacts: true,
                lineItems: true,
            },
            orderBy: (b, { asc }) => [asc(b.branchIdExternal)],
        });

        return res.json({ data: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// ── GET /branches/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const branch = await db.query.branches.findFirst({
            where: eq(branches.id, String(req.params.id)),
            with: { contacts: true, lineItems: true },
        });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        return res.json({ data: branch });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch branch' });
    }
});

const BranchSchema = z.object({
    accountId:         z.string().uuid(),
    name:              z.string().min(1),
    companyIdExternal: z.string().optional().nullable(),
    branchIdExternal:  z.string().optional().nullable(),
    branchType:        z.string().optional().nullable(),
    branchCity:        z.string().optional().nullable(),
    branchState:       z.string().optional().nullable(),
    branchCountry:     z.string().optional().nullable(),
    billingEntityName: z.string().optional().nullable(),
    billingStateProv:  z.string().optional().nullable(),
    billingCountry:    z.string().optional().nullable(),
    procurementModel:  z.string().optional().nullable(),
    erpSystem:         z.string().optional().nullable(),
    estAnnualSpend:    z.string().optional().nullable(),
    skuCountEst:       z.number().int().optional().nullable(),
    branchStatus:      z.string().optional().nullable(),
    needsReview:       z.boolean().optional().nullable(),
    notes:             z.string().optional().nullable(),
});

// ── POST /branches ────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = BranchSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

        const [created] = await db.insert(branches).values(parsed.data).returning();
        return res.status(201).json({ data: created });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create branch' });
    }
});

// ── PATCH /branches/:id ───────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const parsed = BranchSchema.partial().safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

        const [updated] = await db
            .update(branches)
            .set({ ...parsed.data, updatedAt: new Date() })
            .where(eq(branches.id, String(req.params.id)))
            .returning();

        if (!updated) return res.status(404).json({ error: 'Branch not found' });
        return res.json({ data: updated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update branch' });
    }
});

export default router;
