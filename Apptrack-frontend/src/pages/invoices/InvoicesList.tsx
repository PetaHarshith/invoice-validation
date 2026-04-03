import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Search, ReceiptText, AlertTriangle, ChevronLeft, ChevronRight,
    Plus, ExternalLink, ShieldAlert, ShieldCheck, FileText,
} from 'lucide-react';
import { BACKEND_URL } from '@/constants';
import { Invoice, InvoiceStats, InvoiceWithIssues } from '@/types';

// ── Module-level cache — survives navigation ───────────────────────────────────
const STALE_MS = 2 * 60 * 1000;       // 2 min for invoice list
const STATS_STALE_MS = 5 * 60 * 1000; // 5 min for stats

const invoiceCache = {
    stats: null as InvoiceStats | null,
    statsTs: 0,
    invoices: [] as Invoice[],
    invoicesTotal: 0,
    invoicesKey: '',
    invoicesTs: 0,
};

const STATUS_OPTIONS = [
    { value: 'all', label: 'All Statuses' },
    { value: 'Paid', label: 'Paid' },
    { value: 'Outstanding', label: 'Outstanding' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Paid - Late', label: 'Paid – Late' },
];

function statusColor(status: string | null): string {
    const s = (status ?? '').toLowerCase();
    if (s.startsWith('paid')) return '#22c55e';
    if (s === 'outstanding') return 'var(--chart-3)';
    if (s === 'pending') return '#f59e0b';
    return 'var(--muted-foreground)';
}

function fmt(amount: string | null): string {
    if (!amount) return '—';
    return '$' + parseFloat(amount).toLocaleString();
}

type CreateForm = {
    invoiceNumber: string;
    opportunityId: string;
    invoiceDate: string;
    dueDate: string;
    invoiceAmount: string;
    paymentStatus: string;
    paymentTerms: string;
    opportunityOwner: string;
    billingContactName: string;
    billingContactEmail: string;
    product: string;
    invoiceNotes: string;
};

const EMPTY_FORM: CreateForm = {
    invoiceNumber: '', opportunityId: '', invoiceDate: '', dueDate: '',
    invoiceAmount: '', paymentStatus: 'Pending', paymentTerms: 'Net 30',
    opportunityOwner: '', billingContactName: '', billingContactEmail: '',
    product: '', invoiceNotes: '',
};

export default function InvoicesList() {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState<Invoice[]>(invoiceCache.invoices);
    const [stats, setStats] = useState<InvoiceStats | null>(invoiceCache.stats);
    const [total, setTotal] = useState(invoiceCache.invoicesTotal);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [disputedOnly, setDisputedOnly] = useState(false);
    const [loading, setLoading] = useState(invoiceCache.invoicesKey === '' || Date.now() - invoiceCache.invoicesTs > STALE_MS);
    const limit = 25;

    // Create dialog state
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Detail sheet state
    const [sheetInvoice, setSheetInvoice] = useState<InvoiceWithIssues | null>(null);
    const [sheetLoading, setSheetLoading] = useState(false);
    const [disputing, setDisputing] = useState(false);

    const fetchInvoices = useCallback(async (force = false) => {
        const key = `${page}|${search}|${statusFilter}|${disputedOnly}`;
        if (!force && invoiceCache.invoicesKey === key && Date.now() - invoiceCache.invoicesTs < STALE_MS) {
            setInvoices(invoiceCache.invoices);
            setTotal(invoiceCache.invoicesTotal);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(limit) });
            if (search) params.set('search', search);
            if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
            if (disputedOnly) params.set('disputed', 'true');
            const res = await fetch(`${BACKEND_URL}/invoices?${params}`);
            const json = await res.json();
            const data = json.data ?? [];
            const t = json.total ?? 0;
            invoiceCache.invoices = data;
            invoiceCache.invoicesTotal = t;
            invoiceCache.invoicesKey = key;
            invoiceCache.invoicesTs = Date.now();
            setInvoices(data);
            setTotal(t);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, disputedOnly]);

    useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

    useEffect(() => {
        if (invoiceCache.stats && Date.now() - invoiceCache.statsTs < STATS_STALE_MS) return;
        fetch(`${BACKEND_URL}/invoices/stats`)
            .then(r => r.json())
            .then(data => {
                invoiceCache.stats = data;
                invoiceCache.statsTs = Date.now();
                setStats(data);
            })
            .catch(() => null);
    }, []);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Open the detail sheet — fetch full invoice (includes issues) by id
    const openSheet = async (inv: Invoice) => {
        setSheetInvoice({ ...inv, issues: [] }); // show immediately, issues load async
        setSheetLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/invoices/${inv.id}`);
            if (res.ok) setSheetInvoice(await res.json());
        } finally {
            setSheetLoading(false);
        }
    };

    // Toggle isDisputed on the currently open invoice
    const toggleDispute = async () => {
        if (!sheetInvoice) return;
        setDisputing(true);
        try {
            const res = await fetch(`${BACKEND_URL}/invoices/${sheetInvoice.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isDisputed: !sheetInvoice.isDisputed }),
            });
            if (res.ok) {
                const updated: InvoiceWithIssues = await res.json();
                setSheetInvoice(updated);
                // Patch the row in the list in-place so it reflects immediately
                setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, isDisputed: updated.isDisputed } : i));
            }
        } finally {
            setDisputing(false);
        }
    };

    const handleCreate = async () => {
        if (!createForm.invoiceNumber.trim()) {
            setCreateError('Invoice number is required.');
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...createForm,
                    invoiceAmount: createForm.invoiceAmount || null,
                    seats: null,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                setCreateError(err.error ?? 'Failed to create invoice.');
                return;
            }
            setShowCreate(false);
            setCreateForm(EMPTY_FORM);
            invoiceCache.invoicesTs = 0; // bust cache so new invoice shows up
            invoiceCache.statsTs = 0;
            fetchInvoices(true);
        } catch {
            setCreateError('Network error — could not reach the server.');
        } finally {
            setCreating(false);
        }
    };

    const field = (key: keyof CreateForm) => ({
        value: createForm[key],
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setCreateForm(f => ({ ...f, [key]: e.target.value })),
    });

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Invoices</h1>
                    <p className="text-sm text-muted-foreground">{total} invoice{total !== 1 ? 's' : ''} total</p>
                </div>
                <Button onClick={() => { setShowCreate(true); setCreateError(null); }} className="gap-1.5">
                    <Plus className="h-4 w-4" /> New Invoice
                </Button>
            </div>

            {/* Stats strip */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                        { label: 'Total', value: stats.total, sub: `$${(stats.totalAmount / 1000).toFixed(0)}k` },
                        { label: 'Paid', value: stats.paid, color: '#22c55e' },
                        { label: 'Outstanding', value: stats.outstanding, color: 'var(--chart-3)' },
                        { label: 'Pending', value: stats.pending, color: '#f59e0b' },
                        { label: 'Disputed', value: stats.disputed, color: 'var(--chart-3)', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
                    ].map(({ label, value, color, sub, icon }) => (
                        <Card key={label} className="p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                {icon}{label}
                            </p>
                            <p className="text-2xl font-bold mt-1" style={color ? { color } : undefined}>{value}</p>
                            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                        </Card>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search invoice # or company…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }} defaultValue="all">
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button
                    variant={disputedOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setDisputedOnly(p => !p); setPage(1); }}
                    className="gap-1.5"
                >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Disputed Only
                </Button>
            </div>

            {/* Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <ReceiptText className="h-4 w-4 text-muted-foreground" />
                        Invoice Register
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-muted-foreground border-b bg-muted/30">
                                    <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                                    <th className="text-left px-4 py-3 font-medium">Company / Opportunity</th>
                                    <th className="text-left px-4 py-3 font-medium">Owner</th>
                                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                                    <th className="text-left px-4 py-3 font-medium">Invoice Date</th>
                                    <th className="text-left px-4 py-3 font-medium">Due Date</th>
                                    <th className="text-left px-4 py-3 font-medium">Status</th>
                                    <th className="text-left px-4 py-3 font-medium">Terms</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
                                ) : invoices.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No invoices found</td></tr>
                                ) : invoices.map(inv => (
                                    <tr
                                        key={inv.id}
                                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                                        onClick={() => openSheet(inv)}
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-medium">
                                            <span className="flex items-center gap-1.5">
                                                {inv.invoiceNumber}
                                                {inv.isDisputed && (
                                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Disputed" />
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{inv.accountName ?? inv.opportunityId ?? '—'}</p>
                                            <p className="text-xs text-muted-foreground">{inv.opportunityId}</p>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{inv.opportunityOwner ?? '—'}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(inv.invoiceAmount)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{inv.invoiceDate ?? '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{inv.dueDate ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <Badge
                                                variant="outline"
                                                className="text-xs capitalize"
                                                style={{ borderColor: statusColor(inv.paymentStatus), color: statusColor(inv.paymentStatus) }}
                                            >
                                                {inv.paymentStatus ?? '—'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">{inv.paymentTerms ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Pagination */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Page {page} of {totalPages} · {total} results</span>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Invoice Detail Sheet */}
            <Sheet open={!!sheetInvoice} onOpenChange={open => { if (!open) setSheetInvoice(null); }}>
                <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-hidden p-0">
                    {sheetInvoice && (() => {
                        const inv = sheetInvoice;
                        return (
                            <div className="flex flex-col h-full overflow-y-auto">
                                {/* Header — pinned at top */}
                                <SheetHeader className={`px-6 pt-6 pb-5 border-b transition-colors duration-300 ${inv.isDisputed ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 'bg-muted/30'}`}>
                                    <SheetTitle className="flex items-center gap-2 font-mono text-base">
                                        <ReceiptText className="h-4 w-4 text-muted-foreground shrink-0" />
                                        {inv.invoiceNumber}
                                        {inv.isDisputed && (
                                            <Badge className="ml-1 text-xs gap-1 bg-red-500 text-white border-0 animate-in fade-in-0 duration-200">
                                                <AlertTriangle className="h-3 w-3" /> Disputed
                                            </Badge>
                                        )}
                                    </SheetTitle>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        {inv.accountName ?? inv.opportunityId ?? '—'}
                                    </p>
                                </SheetHeader>

                                {/* Scrollable body */}
                                <div className="flex-1 px-6 py-6 space-y-6">

                                    {/* Key figures */}
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Amount</p>
                                            <p className="font-semibold text-xl">{fmt(inv.invoiceAmount)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                                            <Badge variant="outline" className="text-xs" style={{ borderColor: statusColor(inv.paymentStatus), color: statusColor(inv.paymentStatus) }}>
                                                {inv.paymentStatus ?? '—'}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Invoice Date</p>
                                            <p>{inv.invoiceDate ?? '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Due Date</p>
                                            <p>{inv.dueDate ?? '—'}</p>
                                        </div>
                                        {inv.paymentDate && (
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Paid On</p>
                                                <p>{inv.paymentDate}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Terms</p>
                                            <p>{inv.paymentTerms ?? '—'}</p>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Contact + deal info */}
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground shrink-0">Billing Contact</span>
                                            <span className="text-right">{inv.billingContactName ?? '—'}{inv.billingContactEmail ? ` · ${inv.billingContactEmail}` : ''}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground shrink-0">Owner</span>
                                            <span className="text-right">{inv.opportunityOwner ?? '—'}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground shrink-0">Product</span>
                                            <span className="text-right">{inv.product ?? '—'}</span>
                                        </div>
                                        {inv.poNumber && (
                                            <div className="flex justify-between gap-4">
                                                <span className="text-muted-foreground shrink-0">PO #</span>
                                                <span className="text-right">{inv.poNumber}</span>
                                            </div>
                                        )}
                                        {inv.invoiceNotes && (
                                            <div className="flex justify-between gap-4">
                                                <span className="text-muted-foreground shrink-0">Notes</span>
                                                <span className="text-right text-xs">{inv.invoiceNotes}</span>
                                            </div>
                                        )}
                                    </div>

                                    <Separator />

                                    {/* Dispute toggle — full-width prominent card */}
                                    <div className={`rounded-xl border-2 p-5 transition-colors duration-300 ${inv.isDisputed ? 'border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-700' : 'border-muted bg-muted/20'}`}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold flex items-center gap-2">
                                                    {inv.isDisputed
                                                        ? <><ShieldAlert className="h-4 w-4 text-red-500" /><span className="text-red-600 dark:text-red-400">Invoice Disputed</span></>
                                                        : <><ShieldCheck className="h-4 w-4 text-green-500" /><span>No Dispute on Record</span></>
                                                    }
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {inv.isDisputed
                                                        ? 'Finance has flagged this invoice. Click to clear once resolved.'
                                                        : 'Flag this invoice if the customer raised a billing dispute.'
                                                    }
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={inv.isDisputed ? 'destructive' : 'secondary'}
                                                onClick={toggleDispute}
                                                disabled={disputing}
                                                className={`shrink-0 font-semibold transition-all duration-200 ${inv.isDisputed ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                                            >
                                                {disputing
                                                    ? <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />Saving…</span>
                                                    : inv.isDisputed ? '✓ Clear Dispute' : 'Mark as Disputed'
                                                }
                                            </Button>
                                        </div>

                                        {/* Existing logged issues */}
                                        {sheetLoading && <p className="text-xs text-muted-foreground mt-4">Loading issues…</p>}
                                        {!sheetLoading && inv.issues.length > 0 && (
                                            <div className="mt-4 space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logged Issues</p>
                                                {inv.issues.map(issue => (
                                                    <div key={issue.id} className="text-xs border rounded-lg p-3 bg-background space-y-1">
                                                        <p className="font-semibold">{issue.issueSummary}</p>
                                                        {issue.issueDetail && <p className="text-muted-foreground">{issue.issueDetail}</p>}
                                                        <p className="text-muted-foreground">
                                                            {issue.issueStatus ?? 'open'}{issue.reportedBy ? ` · ${issue.reportedBy}` : ''}{issue.reportedDate ? ` · ${issue.reportedDate}` : ''}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* View Deal link */}
                                    {inv.dealId && (
                                        <Button
                                            variant="outline"
                                            className="w-full gap-2"
                                            onClick={() => navigate(`/deals/${inv.dealId}`)}
                                        >
                                            <FileText className="h-4 w-4" />
                                            View Deal
                                            <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                                        </Button>
                                    )}

                                    {/* bottom breathing room */}
                                    <div className="h-4" />
                                </div>{/* end scrollable body */}
                            </div>
                        );
                    })()}
                </SheetContent>
            </Sheet>

            {/* Create Invoice Dialog */}
            <Dialog open={showCreate} onOpenChange={open => { setShowCreate(open); if (!open) setCreateForm(EMPTY_FORM); }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ReceiptText className="h-4 w-4" /> New Invoice
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4 py-2">
                        <div className="col-span-2 space-y-1">
                            <Label>Invoice Number <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. INV-2024-0158" {...field('invoiceNumber')} />
                        </div>
                        <div className="col-span-2 space-y-1">
                            <Label>Opportunity ID</Label>
                            <Input placeholder="e.g. OPP-10248" {...field('opportunityId')} />
                            <p className="text-xs text-muted-foreground">Links this invoice to a deal automatically</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Invoice Date</Label>
                            <Input type="date" {...field('invoiceDate')} />
                        </div>
                        <div className="space-y-1">
                            <Label>Due Date</Label>
                            <Input type="date" {...field('dueDate')} />
                        </div>
                        <div className="space-y-1">
                            <Label>Amount ($)</Label>
                            <Input type="number" min="0" step="0.01" placeholder="0.00" {...field('invoiceAmount')} />
                        </div>
                        <div className="space-y-1">
                            <Label>Payment Terms</Label>
                            <Input placeholder="e.g. Net 30" {...field('paymentTerms')} />
                        </div>
                        <div className="col-span-2 space-y-1">
                            <Label>Status</Label>
                            <Select
                                value={createForm.paymentStatus}
                                onValueChange={v => setCreateForm(f => ({ ...f, paymentStatus: v }))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Outstanding">Outstanding</SelectItem>
                                    <SelectItem value="Paid">Paid</SelectItem>
                                    <SelectItem value="Paid - Late">Paid – Late</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Billing Contact</Label>
                            <Input placeholder="Name" {...field('billingContactName')} />
                        </div>
                        <div className="space-y-1">
                            <Label>Contact Email</Label>
                            <Input type="email" placeholder="email@company.com" {...field('billingContactEmail')} />
                        </div>
                        <div className="space-y-1">
                            <Label>Opportunity Owner</Label>
                            <Input placeholder="Rep name" {...field('opportunityOwner')} />
                        </div>
                        <div className="space-y-1">
                            <Label>Product</Label>
                            <Input placeholder="e.g. Northwoods Platform" {...field('product')} />
                        </div>
                        <div className="col-span-2 space-y-1">
                            <Label>Notes</Label>
                            <Input placeholder="Optional invoice notes" {...field('invoiceNotes')} />
                        </div>
                    </div>

                    {createError && (
                        <p className="text-sm text-destructive flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />{createError}
                        </p>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={creating}>
                            {creating ? 'Creating…' : 'Create Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

