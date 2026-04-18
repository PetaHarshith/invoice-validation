import { Router, Request, Response } from 'express';
import { eq, ilike, and, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db';
import { invoices, invoiceIssues } from '../db/schema/invoices';
import { deals } from '../db/schema/deals';

const router = Router();

// ── GET /invoices ─────────────────────────────────────────────────────────────
// List invoices with optional filters: search, status, disputed
router.get('/', async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
        const offset = (page - 1) * limit;
        const search = (req.query.search as string)?.trim();
        const status = req.query.status as string;
        const disputed = req.query.disputed as string;

        const conditions = [];
        if (search) {
            conditions.push(
                sql`(${invoices.invoiceNumber} ilike ${'%' + search + '%'} OR ${invoices.opportunityId} ilike ${'%' + search + '%'} OR ${invoices.crmContactName} ilike ${'%' + search + '%'})`
            );
        }
        if (status) {
            conditions.push(ilike(invoices.paymentStatus, `%${status}%`));
        }
        if (disputed === 'true') {
            conditions.push(eq(invoices.isDisputed, true));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [rows, countResult] = await Promise.all([
            db
                .select({
                    id: invoices.id,
                    invoiceNumber: invoices.invoiceNumber,
                    opportunityId: invoices.opportunityId,
                    dealId: invoices.dealId,
                    accountId: invoices.accountId,
                    invoiceDate: invoices.invoiceDate,
                    dueDate: invoices.dueDate,
                    paymentDate: invoices.paymentDate,
                    invoiceAmount: invoices.invoiceAmount,
                    paymentStatus: invoices.paymentStatus,
                    paymentTerms: invoices.paymentTerms,
                    product: invoices.product,
                    opportunityType: invoices.opportunityType,
                    seats: invoices.seats,
                    poNumber: invoices.poNumber,
                    billingContactName: invoices.billingContactName,
                    billingContactEmail: invoices.billingContactEmail,
                    crmContactName: invoices.crmContactName,
                    opportunityOwner: invoices.opportunityOwner,
                    invoiceNotes: invoices.invoiceNotes,
                    isDisputed: invoices.isDisputed,
                    // Pull account name from deals via opportunityId join
                    accountName: deals.opportunityName,
                })
                .from(invoices)
                .leftJoin(deals, eq(invoices.dealId, deals.id))
                .where(where)
                .orderBy(desc(invoices.invoiceDate))
                .limit(limit)
                .offset(offset),
            db
                .select({ total: sql<number>`count(*)::int` })
                .from(invoices)
                .where(where),
        ]);

        return res.json({
            data: rows,
            total: countResult[0]?.total ?? 0,
            page,
            limit,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load invoices' });
    }
});

// ── GET /invoices/overdue ─────────────────────────────────────────────────────
// Returns invoices whose due_date is in the past and that aren't marked paid.
// Used by the home-page action center.
router.get('/overdue', async (_req: Request, res: Response) => {
    try {
        const rows = await db
            .select({
                id: invoices.id,
                invoiceNumber: invoices.invoiceNumber,
                dueDate: invoices.dueDate,
                invoiceAmount: invoices.invoiceAmount,
                paymentStatus: invoices.paymentStatus,
                billingContactName: invoices.billingContactName,
                opportunityOwner: invoices.opportunityOwner,
                dealId: invoices.dealId,
                // Use the joined deal's opportunity name as an account label
                accountName: deals.opportunityName,
            })
            .from(invoices)
            .leftJoin(deals, eq(invoices.dealId, deals.id))
            .where(
                sql`${invoices.dueDate} < CURRENT_DATE
                    AND lower(coalesce(${invoices.paymentStatus}, '')) NOT LIKE 'paid%'
                    AND ${invoices.dueDate} IS NOT NULL`
            )
            .orderBy(asc(invoices.dueDate))
            .limit(8);

        return res.json({ data: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load overdue invoices' });
    }
});

// ── GET /invoices/stats ───────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
    try {
        const [counts, disputedCount] = await Promise.all([
            db.select({
                total: sql<number>`count(*)::int`,
                paid: sql<number>`count(*) filter (where lower(${invoices.paymentStatus}) like 'paid%')::int`,
                outstanding: sql<number>`count(*) filter (where lower(${invoices.paymentStatus}) = 'outstanding')::int`,
                pending: sql<number>`count(*) filter (where lower(${invoices.paymentStatus}) = 'pending')::int`,
                totalAmount: sql<number>`coalesce(sum(${invoices.invoiceAmount}::numeric), 0)::float`,
                paidAmount: sql<number>`coalesce(sum(${invoices.invoiceAmount}::numeric) filter (where lower(${invoices.paymentStatus}) like 'paid%'), 0)::float`,
                outstandingAmount: sql<number>`coalesce(sum(${invoices.invoiceAmount}::numeric) filter (where lower(${invoices.paymentStatus}) != 'paid' and lower(${invoices.paymentStatus}) not like 'paid%'), 0)::float`,
            }).from(invoices),
            db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.isDisputed, true)),
        ]);
        return res.json({ ...counts[0], disputed: disputedCount[0]?.count ?? 0 });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load invoice stats' });
    }
});

// ── POST /invoices ────────────────────────────────────────────────────────────
// Create a new invoice record manually. invoiceNumber is the only required field.
router.post('/', async (req: Request, res: Response) => {
    try {
        const {
            invoiceNumber,
            opportunityId,
            dealId,
            invoiceDate,
            dueDate,
            invoiceAmount,
            paymentStatus,
            paymentTerms,
            billingContactName,
            billingContactEmail,
            opportunityOwner,
            product,
            seats,
            poNumber,
            invoiceNotes,
        } = req.body;

        if (!invoiceNumber || typeof invoiceNumber !== 'string' || !invoiceNumber.trim()) {
            return res.status(400).json({ error: 'invoiceNumber is required' });
        }

        // Resolve dealId from opportunityId if not provided directly
        let resolvedDealId = dealId ?? null;
        let resolvedAccountId: string | null = null;
        if (!resolvedDealId && opportunityId) {
            const [deal] = await db
                .select({ id: deals.id, accountId: deals.accountId })
                .from(deals)
                .where(eq(deals.opportunityId, opportunityId as string))
                .limit(1);
            if (deal) {
                resolvedDealId = deal.id;
                resolvedAccountId = deal.accountId;
            }
        } else if (resolvedDealId) {
            const [deal] = await db
                .select({ accountId: deals.accountId })
                .from(deals)
                .where(eq(deals.id, resolvedDealId))
                .limit(1);
            if (deal) resolvedAccountId = deal.accountId;
        }

        const [created] = await db
            .insert(invoices)
            .values({
                invoiceNumber: invoiceNumber.trim(),
                opportunityId: opportunityId ?? null,
                dealId: resolvedDealId,
                accountId: resolvedAccountId,
                invoiceDate: invoiceDate ?? null,
                dueDate: dueDate ?? null,
                invoiceAmount: invoiceAmount ? String(invoiceAmount) : null,
                paymentStatus: paymentStatus ?? 'Pending',
                paymentTerms: paymentTerms ?? null,
                billingContactName: billingContactName ?? null,
                billingContactEmail: billingContactEmail ?? null,
                opportunityOwner: opportunityOwner ?? null,
                product: product ?? null,
                seats: seats ? Number(seats) : null,
                poNumber: poNumber ?? null,
                invoiceNotes: invoiceNotes ?? null,
                isDisputed: false,
            })
            .returning();

        return res.status(201).json(created);
    } catch (err: unknown) {
        console.error(err);
        // Unique constraint on invoice_number
        if (err instanceof Error && err.message?.includes('unique')) {
            return res.status(409).json({ error: 'Invoice number already exists' });
        }
        return res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// ── PATCH /invoices/:id ───────────────────────────────────────────────────────
// Partial update — only the fields sent in the body are changed.
// Supports: isDisputed, paymentStatus, paymentDate, invoiceNotes
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isDisputed, paymentStatus, paymentDate, invoiceNotes } = req.body;

        // Build only the columns that were actually sent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = {};
        if (isDisputed !== undefined) patch.isDisputed = Boolean(isDisputed);
        if (paymentStatus !== undefined) patch.paymentStatus = paymentStatus;
        if (paymentDate !== undefined) patch.paymentDate = paymentDate;
        if (invoiceNotes !== undefined) patch.invoiceNotes = invoiceNotes;

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'No updatable fields provided' });
        }

        const [updated] = await db
            .update(invoices)
            .set(patch)
            .where(eq(invoices.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: 'Invoice not found' });

        const issues = await db
            .select()
            .from(invoiceIssues)
            .where(eq(invoiceIssues.invoiceId, id));

        return res.json({ ...updated, issues });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update invoice' });
    }
});

// ── GET /invoices/by-deal/:dealId ─────────────────────────────────────────────
// NOTE: must be registered BEFORE /:id so Express doesn't swallow "by-deal" as an id
router.get('/by-deal/:dealId', async (req: Request, res: Response) => {
    try {
        const rows = await db
            .select()
            .from(invoices)
            .where(eq(invoices.dealId, req.params.dealId))
            .orderBy(desc(invoices.invoiceDate));

        // Attach issues to each invoice
        const ids = rows.map(r => r.id);
        const allIssues = ids.length
            ? await db.select().from(invoiceIssues).where(sql`${invoiceIssues.invoiceId} = any(${sql.raw(`'{${ids.join(',')}}'::uuid[]`)})`)
            : [];

        const issuesByInvoice = new Map<string, typeof allIssues>();
        for (const issue of allIssues) {
            if (!issue.invoiceId) continue;
            const list = issuesByInvoice.get(issue.invoiceId) ?? [];
            list.push(issue);
            issuesByInvoice.set(issue.invoiceId, list);
        }

        return res.json(rows.map(r => ({ ...r, issues: issuesByInvoice.get(r.id) ?? [] })));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load invoices for deal' });
    }
});

// ── GET /invoices/:id ─────────────────────────────────────────────────────────
// IMPORTANT: kept last so named routes above (/stats, /by-deal) are not consumed by this wildcard
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, req.params.id));
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const issues = await db.select().from(invoiceIssues).where(eq(invoiceIssues.invoiceId, invoice.id));
        return res.json({ ...invoice, issues });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load invoice' });
    }
});

export default router;

