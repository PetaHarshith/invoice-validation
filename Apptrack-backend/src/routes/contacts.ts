import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { contacts, deals, dealLineItems } from '../db/schema';
import { computeReadiness, autoAdvanceStage } from '../lib/readiness';

/**
 * After any contact change, recompute readiness for every deal on that account
 * so the billing-contact blocker clears (or appears) immediately.
 */
async function syncReadinessForAccount(accountId: string) {
    // Fetch fresh contacts and all deals for this account in parallel
    const [allContacts, accountDeals] = await Promise.all([
        db.select().from(contacts).where(eq(contacts.accountId, accountId)),
        db.select().from(deals).where(eq(deals.accountId, accountId)),
    ]);

    await Promise.all(
        accountDeals.map(async (deal) => {
            const lineItems = await db.select().from(dealLineItems).where(eq(dealLineItems.dealId, deal.id));
            const { readinessStatus, missingFields, warnings } = computeReadiness(deal, allContacts, lineItems);
            const resolvedStage = autoAdvanceStage(deal.dealStage, readinessStatus) as typeof deal.dealStage;
            await db.update(deals)
                .set({ dealStage: resolvedStage, readinessStatus, missingFields, warnings })
                .where(eq(deals.id, deal.id));
        })
    );
}

const router = Router();

const ContactPatchSchema = z.object({
    contactName: z.string().min(1).optional(),
    contactTitle: z.string().optional().nullable(),
    contactEmail: z.string().optional().nullable(),
    contactLocation: z.string().optional().nullable(),
    contactRole: z.string().optional().nullable(),
    isPrimaryContact: z.boolean().optional(),
    isBillingContact: z.boolean().optional(),
});

const ContactCreateSchema = z.object({
    accountId: z.string().uuid(),
    contactName: z.string().min(1),
    contactTitle: z.string().optional().nullable(),
    contactEmail: z.string().optional().nullable(),
    contactLocation: z.string().optional().nullable(),
    contactRole: z.string().optional().nullable(),
    isPrimaryContact: z.boolean().optional(),
    isBillingContact: z.boolean().optional(),
});

// ── POST /contacts ─────────────────────────────────────────────────────────────
// Create a new contact for an account.
router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = ContactCreateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

        const [created] = await db.insert(contacts).values({
            accountId: parsed.data.accountId,
            contactName: parsed.data.contactName,
            contactTitle: parsed.data.contactTitle ?? null,
            contactEmail: parsed.data.contactEmail ?? null,
            contactLocation: parsed.data.contactLocation ?? null,
            contactRole: parsed.data.contactRole ?? null,
            isPrimaryContact: parsed.data.isPrimaryContact ?? false,
            isBillingContact: parsed.data.isBillingContact ?? false,
        }).returning();

        // Sync readiness for all deals on this account
        await syncReadinessForAccount(parsed.data.accountId);

        return res.status(201).json({ data: created });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create contact' });
    }
});

// ── PATCH /contacts/:id ────────────────────────────────────────────────────────
// Partial update — only the fields sent in the body are changed.
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const parsed = ContactPatchSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
        if (Object.keys(parsed.data).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const [existing] = await db.select().from(contacts).where(eq(contacts.id, id));
        if (!existing) return res.status(404).json({ error: 'Contact not found' });

        const [updated] = await db
            .update(contacts)
            .set(parsed.data)
            .where(eq(contacts.id, id))
            .returning();

        // Sync readiness for all deals on this account so billing-contact
        // blockers clear (or appear) immediately without a separate deal save.
        await syncReadinessForAccount(existing.accountId);

        return res.json({ data: updated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update contact' });
    }
});

export default router;

