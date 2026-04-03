import { Router, Request, Response } from 'express';
import { eq, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { accounts } from '../db/schema';

const router = Router();

// ── GET /accounts ─────────────────────────────────────────────────────────────
// Optional ?search= filters by account name (case-insensitive).
router.get('/', async (req: Request, res: Response) => {
    try {
        const search = (req.query.search as string)?.trim();
        const rows = search
            ? await db.select().from(accounts).where(ilike(accounts.accountName, `%${search}%`)).limit(20)
            : await db.select().from(accounts).limit(50);
        return res.json({ data: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

// ── POST /accounts ────────────────────────────────────────────────────────────
// Creates a new account with just an account name (all other fields optional).
router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = z.object({ accountName: z.string().min(1) }).safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
        const [created] = await db.insert(accounts).values({ accountName: parsed.data.accountName }).returning();
        return res.status(201).json({ data: created });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create account' });
    }
});

const AccountPatchSchema = z.object({
    accountName: z.string().min(1).optional(),
    accountCity: z.string().optional().nullable(),
    accountState: z.string().optional().nullable(),
    accountIndustry: z.string().optional().nullable(),
    accountSize: z.string().optional().nullable(),
    accountStatus: z.string().optional().nullable(),
    accountProduct: z.string().optional().nullable(),
    totalSeats: z.number().int().optional().nullable(),
    originalPurchaseDate: z.string().optional().nullable(),
    nextRenewalDate: z.string().optional().nullable(),
    accountLostDate: z.string().optional().nullable(),
    // Wholesale fields
    companyIdExternal: z.string().optional().nullable(),
    erpSystem:         z.string().optional().nullable(),
    procurementModel:  z.string().optional().nullable(),
    leadStatus:        z.string().optional().nullable(),
    priorityTier:      z.string().optional().nullable(),
    needsReview:       z.boolean().optional().nullable(),
});

// ── PATCH /accounts/:id ──────────────────────────────────────────────────────
// Partial update — only the fields sent in the body are changed.
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const parsed = AccountPatchSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
        if (Object.keys(parsed.data).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const [existing] = await db.select().from(accounts).where(eq(accounts.id, String(id)));
        if (!existing) return res.status(404).json({ error: 'Account not found' });

        const [updated] = await db
            .update(accounts)
            .set(parsed.data)
            .where(eq(accounts.id, String(id)))
            .returning();

        return res.json({ data: updated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update account' });
    }
});

export default router;

