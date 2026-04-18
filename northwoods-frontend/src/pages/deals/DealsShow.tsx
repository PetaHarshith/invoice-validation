import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
    Building2, Calendar, FileCheck, User, DollarSign,
    ShoppingCart, AlertCircle, Pencil, Save, X, Plus, Trash2, ReceiptText, GitBranch
} from 'lucide-react';
import { BACKEND_URL, DEAL_STATUS_LABELS } from '@/constants';
import { DealDetail, DealStatus, ReadinessStatus, InvoiceWithIssues, Branch, BranchReadinessResult } from '@/types';

type ContactEditRow = {
    contactName: string;
    contactTitle: string;
    contactEmail: string;
    contactRole: string;
    isPrimaryContact: boolean;
    isBillingContact: boolean;
};

type NewLineItemForm = {
    productNameSnapshot: string;
    skuId: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    billingFrequency: string;
    lineType: string;
};

const DEFAULT_LINE_ITEM: NewLineItemForm = {
    productNameSnapshot: '', skuId: '', quantity: '', unitPrice: '',
    lineTotal: '', billingFrequency: '', lineType: '',
};

type EditForm = {
    // Contract & Pricing
    contractStartDate: string;
    contractTermText: string;
    totalContractValue: string;
    contractAttached: boolean;
    dealStage: DealStatus;
    // Opportunity Details
    opportunityOwner: string;
    opportunityType: string;
    oppCloseDate: string;
    opportunitySource: string;
    opportunityCloseReason: string;
    opportunityTerm: string;
    // Notes & Context
    pricingContext: string;
    rolloutContext: string;
    specialRemarks: string;
    opportunityNotes: string;
    // Account
    accountName: string;
    accountCity: string;
    accountState: string;
    accountIndustry: string;
    accountStatus: string;
    accountProduct: string;
    totalSeats: string;
};

const stageColors: Record<DealStatus, string> = {
    closed_won: 'var(--chart-2)',
    needs_info: 'var(--chart-4)',
    ready_for_invoice: '#22c55e',
    invoiced: 'var(--chart-1)',
    disputed: 'var(--chart-3)',
};

const readinessConfig: Record<ReadinessStatus, { color: string; icon: React.ReactNode; label: string }> = {
    ready: { color: '#22c55e', icon: <CheckCircle2 className="h-4 w-4" />, label: 'Ready for Invoice' },
    warning: { color: '#f59e0b', icon: <AlertTriangle className="h-4 w-4" />, label: 'Warning — Review Required' },
    blocked: { color: 'var(--chart-3)', icon: <XCircle className="h-4 w-4" />, label: 'Blocked — Missing Required Info' },
};

function InfoRow({ label, value }: { label: string; value?: string | null | boolean }) {
    const display = value == null ? '—' : value === true ? 'Yes' : value === false ? 'No' : String(value);
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
            <span className="text-sm font-medium text-foreground">{display || '—'}</span>
        </div>
    );
}

const DealsShow = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [deal, setDeal] = useState<DealDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [form, setForm] = useState<EditForm | null>(null);

    // Line item management state
    const [addingLineItem, setAddingLineItem] = useState(false);
    const [newLineItem, setNewLineItem] = useState<NewLineItemForm>(DEFAULT_LINE_ITEM);
    const [lineItemSaving, setLineItemSaving] = useState(false);
    const [lineItemError, setLineItemError] = useState<string | null>(null);

    // Invoice history state
    const [invoiceHistory, setInvoiceHistory] = useState<InvoiceWithIssues[]>([]);

    // Wholesale branch state — populated from deal.branches returned by GET /deals/:id
    const [branches, setBranches] = useState<Branch[]>([]);
    const [branchReadiness, setBranchReadiness] = useState<BranchReadinessResult[]>([]);

    // Contact edit state — keyed by contact id for existing, array for new
    const [contactEdits, setContactEdits] = useState<Record<string, ContactEditRow>>({});
    const [newContacts, setNewContacts] = useState<ContactEditRow[]>([]);

    // Line item edit state — keyed by line item id, only changed fields
    const [lineItemEdits, setLineItemEdits] = useState<Record<string, Partial<NewLineItemForm>>>({});

    const startEditing = (d: DealDetail) => {
        setForm({
            contractStartDate: d.contractStartDate ?? '',
            contractTermText: d.contractTermText ?? '',
            totalContractValue: d.totalContractValue ?? '',
            contractAttached: d.contractAttached ?? false,
            dealStage: d.dealStage,
            opportunityOwner: d.opportunityOwner ?? '',
            opportunityType: d.opportunityType ?? '',
            oppCloseDate: d.oppCloseDate ?? '',
            opportunitySource: d.opportunitySource ?? '',
            opportunityCloseReason: d.opportunityCloseReason ?? '',
            opportunityTerm: d.opportunityTerm ?? '',
            pricingContext: d.pricingContext ?? '',
            rolloutContext: d.rolloutContext ?? '',
            specialRemarks: d.specialRemarks ?? '',
            opportunityNotes: d.opportunityNotes ?? '',
            accountName: d.account?.accountName ?? '',
            accountCity: d.account?.accountCity ?? '',
            accountState: d.account?.accountState ?? '',
            accountIndustry: d.account?.accountIndustry ?? '',
            accountStatus: d.account?.accountStatus ?? '',
            accountProduct: d.account?.accountProduct ?? '',
            totalSeats: d.account?.totalSeats != null ? String(d.account.totalSeats) : '',
        });
        // Initialise contact edits from existing contacts
        const edits: Record<string, ContactEditRow> = {};
        (d.account?.contacts ?? []).forEach(c => {
            edits[c.id] = {
                contactName: c.contactName,
                contactTitle: c.contactTitle ?? '',
                contactEmail: c.contactEmail ?? '',
                contactRole: c.contactRole ?? '',
                isPrimaryContact: c.isPrimaryContact,
                isBillingContact: c.isBillingContact,
            };
        });
        setContactEdits(edits);
        setNewContacts([]);
        // Initialise line item edits from existing line items
        const liEdits: Record<string, Partial<NewLineItemForm>> = {};
        (d.lineItems ?? []).forEach(li => {
            liEdits[li.id] = {
                productNameSnapshot: li.productNameSnapshot ?? '',
                skuId: li.skuId ?? '',
                quantity: li.quantity != null ? String(li.quantity) : '',
                unitPrice: li.unitPrice ?? '',
                lineTotal: li.lineTotal ?? '',
                billingFrequency: li.billingFrequency ?? '',
                lineType: li.lineType ?? '',
            };
        });
        setLineItemEdits(liEdits);
        setSaveError(null);
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setIsEditing(false);
        setForm(null);
        setContactEdits({});
        setNewContacts([]);
        setLineItemEdits({});
        setSaveError(null);
    };

    const handleSave = async () => {
        if (!id || !form) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/deals/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contractStartDate: form.contractStartDate || null,
                    contractTermText: form.contractTermText || null,
                    totalContractValue: form.totalContractValue || null,
                    contractAttached: form.contractAttached,
                    dealStage: form.dealStage,
                    opportunityOwner: form.opportunityOwner || null,
                    opportunityType: form.opportunityType || null,
                    oppCloseDate: form.oppCloseDate || null,
                    opportunitySource: form.opportunitySource || null,
                    opportunityCloseReason: form.opportunityCloseReason || null,
                    opportunityTerm: form.opportunityTerm || null,
                    pricingContext: form.pricingContext || null,
                    rolloutContext: form.rolloutContext || null,
                    specialRemarks: form.specialRemarks || null,
                    opportunityNotes: form.opportunityNotes || null,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Save failed');

            // Save account edits
            const accountId = deal?.account?.id;
            if (accountId) {
                await fetch(`${BACKEND_URL}/accounts/${accountId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountName: form.accountName || undefined,
                        accountCity: form.accountCity || null,
                        accountState: form.accountState || null,
                        accountIndustry: form.accountIndustry || null,
                        accountStatus: form.accountStatus || null,
                        accountProduct: form.accountProduct || null,
                        totalSeats: form.totalSeats !== '' ? parseInt(form.totalSeats, 10) : null,
                    }),
                });
            }

            // Save contact edits
            await Promise.all(
                Object.entries(contactEdits).map(([contactId, edit]) =>
                    fetch(`${BACKEND_URL}/contacts/${contactId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(edit),
                    })
                )
            );

            // Create new contacts
            if (accountId) {
                await Promise.all(
                    newContacts
                        .filter(c => c.contactName.trim())
                        .map(c => fetch(`${BACKEND_URL}/contacts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...c, accountId }),
                        }))
                );
            }

            // Save line item edits
            await Promise.all(
                Object.entries(lineItemEdits).map(([liId, edit]) => {
                    const payload: Record<string, unknown> = {};
                    if (edit.productNameSnapshot !== undefined) payload.productNameSnapshot = edit.productNameSnapshot;
                    if (edit.skuId !== undefined) payload.skuId = edit.skuId || null;
                    if (edit.quantity !== undefined) payload.quantity = edit.quantity ? parseInt(edit.quantity, 10) : null;
                    if (edit.unitPrice !== undefined) payload.unitPrice = edit.unitPrice || null;
                    if (edit.lineTotal !== undefined) payload.lineTotal = edit.lineTotal || null;
                    if (edit.billingFrequency !== undefined) payload.billingFrequency = edit.billingFrequency || null;
                    if (edit.lineType !== undefined) payload.lineType = edit.lineType || null;
                    return fetch(`${BACKEND_URL}/deals/${id}/line-items/${liId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                })
            );

            const freshRes = await fetch(`${BACKEND_URL}/deals/${id}`);
            const freshJson = await freshRes.json();
            setDeal(freshJson.data);
            setIsEditing(false);
            setForm(null);
            setContactEdits({});
            setNewContacts([]);
            setLineItemEdits({});
        } catch (e) {
            setSaveError(String(e));
        } finally {
            setSaving(false);
        }
    };

    const setField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
        setForm(prev => prev ? { ...prev, [key]: value } : prev);
    };

    const setNewLI = (key: keyof NewLineItemForm, value: string) => {
        setNewLineItem(prev => ({ ...prev, [key]: value }));
    };

    const reloadDeal = async () => {
        if (!id) return;
        const r = await fetch(`${BACKEND_URL}/deals/${id}`);
        const j = await r.json();
        setDeal(j.data);
    };

    const addLineItem = async () => {
        if (!id || !newLineItem.productNameSnapshot.trim()) return;
        setLineItemSaving(true);
        setLineItemError(null);
        try {
            const res = await fetch(`${BACKEND_URL}/deals/${id}/line-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productNameSnapshot: newLineItem.productNameSnapshot.trim(),
                    skuId: newLineItem.skuId || null,
                    quantity: newLineItem.quantity ? parseInt(newLineItem.quantity, 10) : null,
                    unitPrice: newLineItem.unitPrice || null,
                    lineTotal: newLineItem.lineTotal || null,
                    billingFrequency: newLineItem.billingFrequency || null,
                    lineType: newLineItem.lineType || null,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Failed to add line item');
            await reloadDeal();
            setAddingLineItem(false);
            setNewLineItem(DEFAULT_LINE_ITEM);
        } catch (e) {
            setLineItemError(String(e));
        } finally {
            setLineItemSaving(false);
        }
    };

    const deleteLineItem = async (lineItemId: string) => {
        if (!id) return;
        try {
            const res = await fetch(`${BACKEND_URL}/deals/${id}/line-items/${lineItemId}`, { method: 'DELETE' });
            if (!res.ok) return;
            await reloadDeal();
        } catch (e) {
            console.error('deleteLineItem:', e);
        }
    };

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        fetch(`${BACKEND_URL}/deals/${id}`)
            .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error)))
            .then(json => {
                setDeal(json.data);
                // Populate branches from the deal response (wholesale accounts only)
                const dealBranches: Branch[] = json.data?.branches ?? [];
                setBranches(dealBranches);
                // Build branch readiness from the nested branch data
                setBranchReadiness(dealBranches.map((b: Branch): BranchReadinessResult => {
                    const blockers: string[] = [];
                    if (!b.billingEntityName) blockers.push('billingEntityName — no billing entity set');
                    const hasBillingContact = (b.contacts ?? []).some(c => c.isBillingContact);
                    if (!hasBillingContact) blockers.push('billingContact — no billing contact for this branch');
                    if ((b.lineItems ?? []).length === 0) blockers.push('lineItems — no line items for this branch');
                    const status = blockers.length > 0 ? 'blocked' : 'ready';
                    return { branchId: b.id, branchName: b.name, status, blockers, warnings: [] };
                }));
            })
            .catch(e => setError(String(e)))
            .finally(() => setLoading(false));
        // Load invoice history in parallel
        fetch(`${BACKEND_URL}/invoices/by-deal/${id}`)
            .then(r => r.ok ? r.json() : [])
            .then(setInvoiceHistory)
            .catch(() => null);
    }, [id]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
    );

    if (error || !deal) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-destructive">{error ?? 'Deal not found'}</p>
            <Button variant="outline" onClick={() => navigate('/deals')}>Back to Deals</Button>
        </div>
    );

    const readiness = readinessConfig[deal.readinessStatus] ?? readinessConfig.blocked;
    const stageColor = stageColors[deal.dealStage] ?? 'var(--muted-foreground)';

    // Derive billing-contact presence from live edit state so the readiness card
    // and the contacts warning react instantly when the user toggles the switch.
    const effectiveHasBillingContact = (() => {
        const allContacts = deal.account?.contacts ?? [];
        // Check each existing contact — use the live edit row if it exists, else the saved value
        const existingHas = allContacts.some(c => {
            const edit = contactEdits[c.id];
            return edit ? edit.isBillingContact : c.isBillingContact;
        });
        // Check any new contacts added in this edit session
        const newHas = newContacts.some(nc => nc.isBillingContact);
        return existingHas || newHas;
    })();

    const billingContact = isEditing
        ? (deal.account?.contacts.find(c => {
            const edit = contactEdits[c.id];
            return edit ? edit.isBillingContact : c.isBillingContact;
        }) ?? null)
        : (deal.account?.contacts.find(c => c.isBillingContact) ?? null);
    const otherContacts = deal.account?.contacts.filter(c => !c.isBillingContact) ?? [];

    // While editing, strip the billing-contact missing-field entry if the user has already toggled one
    const effectiveMissingFields = isEditing && effectiveHasBillingContact
        ? (deal.missingFields ?? []).filter(f => !f.startsWith('billingContact'))
        : (deal.missingFields ?? []);
    const effectiveReadinessStatus = isEditing && effectiveHasBillingContact && deal.readinessStatus === 'blocked' && effectiveMissingFields.length === 0
        ? 'warning'
        : deal.readinessStatus;

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
            {/* Back + header */}
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/deals')} className="-ml-2 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Deals
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold">{deal.account?.accountName ?? deal.opportunityName ?? 'Unnamed Deal'}</h1>
                        <p className="text-muted-foreground text-sm">{deal.opportunityId ?? '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" style={{ borderColor: stageColor, color: stageColor }}>
                            {DEAL_STATUS_LABELS[isEditing && form ? form.dealStage : deal.dealStage]}
                        </Badge>
                        <Badge variant="outline" style={{ borderColor: readiness.color, color: readiness.color }} className="flex items-center gap-1">
                            {readiness.icon}
                            {readiness.label}
                        </Badge>
                        {!isEditing ? (
                            <Button size="sm" variant="outline" onClick={() => startEditing(deal)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                        ) : (
                            <>
                                <Button size="sm" onClick={handleSave} disabled={saving}>
                                    <Save className="h-3.5 w-3.5 mr-1" /> {saving ? 'Saving…' : 'Save'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEditing} disabled={saving}>
                                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                {saveError && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/40 px-3 py-2 text-sm text-destructive">
                        {saveError}
                    </div>
                )}
            </div>

            {/* Readiness summary — only if blocked or warning */}
            {effectiveReadinessStatus !== 'ready' && (
                <Card className="border-destructive/40 bg-destructive/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {effectiveReadinessStatus === 'blocked' ? 'Blocking Issues — Must Resolve Before Invoicing' : 'Warnings — Finance Should Review'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {effectiveMissingFields.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold uppercase text-destructive mb-1">Missing Required Fields</p>
                                <ul className="space-y-1">
                                    {effectiveMissingFields.map((f, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2">
                                            <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {(deal.warnings ?? []).length > 0 && (
                            <div className="mt-2">
                                <p className="text-xs font-semibold uppercase text-amber-600 mb-1">Warnings</p>
                                <ul className="space-y-1">
                                    {deal.warnings!.map((w, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                            <span>{w}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Two-column: Opportunity + Contract */}
            <div className="grid md:grid-cols-2 gap-6">
                <Card className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" /> Opportunity Details
                            {isEditing && <span className="ml-auto text-xs font-normal text-primary">Editing</span>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        {isEditing && form ? (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Owner</Label>
                                    <Input placeholder="Rep name" value={form.opportunityOwner} onChange={e => setField('opportunityOwner', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Type</Label>
                                    <Input placeholder="e.g. New Business, Renewal" value={form.opportunityType} onChange={e => setField('opportunityType', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Close Date</Label>
                                    <Input type="date" value={form.oppCloseDate} onChange={e => setField('oppCloseDate', e.target.value)} />
                                </div>
                                <InfoRow label="Created Date" value={deal.oppCreatedDate} />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Source</Label>
                                    <Input placeholder="e.g. Inbound, Partner" value={form.opportunitySource} onChange={e => setField('opportunitySource', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Close Reason</Label>
                                    <Input placeholder="e.g. Best Product" value={form.opportunityCloseReason} onChange={e => setField('opportunityCloseReason', e.target.value)} />
                                </div>
                                <InfoRow label="Original Stage" value={deal.oppStageRaw} />
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Term</Label>
                                    <Input placeholder="e.g. Annual, Multi-year" value={form.opportunityTerm} onChange={e => setField('opportunityTerm', e.target.value)} />
                                </div>
                            </>
                        ) : (
                            <>
                                <InfoRow label="Owner" value={deal.opportunityOwner} />
                                <InfoRow label="Type" value={deal.opportunityType} />
                                <InfoRow label="Close Date" value={deal.oppCloseDate} />
                                <InfoRow label="Created Date" value={deal.oppCreatedDate} />
                                <InfoRow label="Source" value={deal.opportunitySource} />
                                <InfoRow label="Close Reason" value={deal.opportunityCloseReason} />
                                <InfoRow label="Original Stage" value={deal.oppStageRaw} />
                                <InfoRow label="Term" value={deal.opportunityTerm} />
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-muted-foreground" /> Contract &amp; Pricing
                            {isEditing && <span className="ml-auto text-xs font-normal text-primary">Editing</span>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        {isEditing && form ? (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Contract Start Date</Label>
                                    <Input type="date" value={form.contractStartDate} onChange={e => setField('contractStartDate', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Contract Term</Label>
                                    <Input placeholder="e.g. 1 Year, 3 Years" value={form.contractTermText} onChange={e => setField('contractTermText', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Total Contract Value ($)</Label>
                                    <Input type="number" placeholder="e.g. 45000" value={form.totalContractValue} onChange={e => setField('totalContractValue', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1.5 justify-center">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Contract Attached</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Switch checked={form.contractAttached} onCheckedChange={v => setField('contractAttached', v)} />
                                        <span className="text-sm">{form.contractAttached ? 'Yes — Signed contract on file' : 'No'}</span>
                                    </div>
                                </div>
                                <InfoRow label="Opp Amount Rollup" value={deal.opportunityAmountRollup ? `$${parseFloat(deal.opportunityAmountRollup).toLocaleString()}` : null} />
                                <InfoRow label="Product Snapshot" value={deal.accountProductSnapshot} />
                                <InfoRow label="Seats" value={deal.accountTotalSeatsSnapshot?.toString()} />
                                <div className="flex flex-col gap-1.5 col-span-2">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Deal Stage</Label>
                                    <select
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                        value={form.dealStage}
                                        onChange={e => setField('dealStage', e.target.value as DealStatus)}
                                    >
                                        {(['closed_won', 'needs_info', 'ready_for_invoice', 'invoiced', 'disputed'] as DealStatus[]).map(s => (
                                            <option key={s} value={s}>{DEAL_STATUS_LABELS[s]}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                <InfoRow label="Contract Start" value={deal.contractStartDate} />
                                <InfoRow label="Contract Term" value={deal.contractTermText ?? deal.opportunityTerm} />
                                <InfoRow label="Total Contract Value" value={deal.totalContractValue ? `$${parseFloat(deal.totalContractValue).toLocaleString()}` : null} />
                                <InfoRow label="Opp Amount Rollup" value={deal.opportunityAmountRollup ? `$${parseFloat(deal.opportunityAmountRollup).toLocaleString()}` : null} />
                                <InfoRow label="Contract Attached" value={deal.contractAttached} />
                                <InfoRow label="Product Snapshot" value={deal.accountProductSnapshot} />
                                <InfoRow label="Seats" value={deal.accountTotalSeatsSnapshot?.toString()} />
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Account Info */}
            <Card className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> Account
                        {isEditing && <span className="ml-auto text-xs font-normal text-primary">Editing</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {isEditing && form ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Company Name</Label>
                                <Input value={form.accountName} onChange={e => setField('accountName', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">City</Label>
                                <Input placeholder="City" value={form.accountCity} onChange={e => setField('accountCity', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">State</Label>
                                <Input placeholder="State" value={form.accountState} onChange={e => setField('accountState', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Industry</Label>
                                <Input placeholder="Industry" value={form.accountIndustry} onChange={e => setField('accountIndustry', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
                                <Input placeholder="e.g. active, churned" value={form.accountStatus} onChange={e => setField('accountStatus', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Product</Label>
                                <Input placeholder="Product" value={form.accountProduct} onChange={e => setField('accountProduct', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Total Seats</Label>
                                <Input type="number" min="0" placeholder="0" value={form.totalSeats} onChange={e => setField('totalSeats', e.target.value)} />
                            </div>
                        </>
                    ) : (
                        <>
                            <InfoRow label="Company" value={deal.account?.accountName} />
                            <InfoRow label="City" value={deal.account?.accountCity} />
                            <InfoRow label="State" value={deal.account?.accountState} />
                            <InfoRow label="Industry" value={deal.account?.accountIndustry} />
                            <InfoRow label="Status" value={deal.account?.accountStatus} />
                            <InfoRow label="Product" value={deal.account?.accountProduct} />
                            <InfoRow label="Total Seats" value={deal.account?.totalSeats?.toString()} />
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Contacts */}
            <Card className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" /> Contacts
                        {isEditing && <span className="ml-auto text-xs font-normal text-primary">Editing</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isEditing ? (
                        <div className="space-y-3">
                            {/* Existing contacts — editable rows */}
                            {(deal.account?.contacts ?? []).map(c => {
                                const edit = contactEdits[c.id];
                                if (!edit) return null;
                                return (
                                    <div key={c.id} className="p-3 border rounded-md bg-muted/20 space-y-2">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            <div className="flex flex-col gap-1">
                                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Name</Label>
                                                <Input value={edit.contactName} onChange={e => setContactEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], contactName: e.target.value } }))} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Title</Label>
                                                <Input value={edit.contactTitle} placeholder="Job title" onChange={e => setContactEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], contactTitle: e.target.value } }))} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Email</Label>
                                                <Input type="email" value={edit.contactEmail} placeholder="email@company.com" onChange={e => setContactEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], contactEmail: e.target.value } }))} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Role</Label>
                                                <Input value={edit.contactRole} placeholder="e.g. primary_contact" onChange={e => setContactEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], contactRole: e.target.value } }))} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 pt-1">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <Switch checked={edit.isBillingContact} onCheckedChange={v => setContactEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], isBillingContact: v } }))} />
                                                Billing Contact
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <Switch checked={edit.isPrimaryContact} onCheckedChange={v => setContactEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], isPrimaryContact: v } }))} />
                                                Primary Contact
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* New contacts */}
                            {newContacts.map((nc, idx) => (
                                <div key={`new-${idx}`} className="p-3 border border-dashed rounded-md border-primary/40 bg-primary/5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-primary uppercase tracking-wide">New Contact</span>
                                        <Button size="sm" variant="ghost" className="h-6 px-2 text-muted-foreground" onClick={() => setNewContacts(prev => prev.filter((_, i) => i !== idx))}>
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Name *</Label>
                                            <Input value={nc.contactName} placeholder="Full name" onChange={e => setNewContacts(prev => prev.map((r, i) => i === idx ? { ...r, contactName: e.target.value } : r))} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Title</Label>
                                            <Input value={nc.contactTitle} placeholder="Job title" onChange={e => setNewContacts(prev => prev.map((r, i) => i === idx ? { ...r, contactTitle: e.target.value } : r))} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Email</Label>
                                            <Input type="email" value={nc.contactEmail} placeholder="email@company.com" onChange={e => setNewContacts(prev => prev.map((r, i) => i === idx ? { ...r, contactEmail: e.target.value } : r))} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Role</Label>
                                            <Input value={nc.contactRole} placeholder="e.g. billing_contact" onChange={e => setNewContacts(prev => prev.map((r, i) => i === idx ? { ...r, contactRole: e.target.value } : r))} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 pt-1">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Switch checked={nc.isBillingContact} onCheckedChange={v => setNewContacts(prev => prev.map((r, i) => i === idx ? { ...r, isBillingContact: v } : r))} />
                                            Billing Contact
                                        </label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Switch checked={nc.isPrimaryContact} onCheckedChange={v => setNewContacts(prev => prev.map((r, i) => i === idx ? { ...r, isPrimaryContact: v } : r))} />
                                            Primary Contact
                                        </label>
                                    </div>
                                </div>
                            ))}
                            <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => setNewContacts(prev => [...prev, { contactName: '', contactTitle: '', contactEmail: '', contactRole: '', isPrimaryContact: false, isBillingContact: false }])}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
                            </Button>
                        </div>
                    ) : (
                        <>
                            {!effectiveHasBillingContact && (
                                <div className="flex items-center gap-2 mb-3 text-destructive text-sm">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    No billing contact on record — required before invoicing
                                </div>
                            )}
                            <div className="divide-y">
                                {billingContact && (
                                    <div className="py-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div><span className="text-xs text-muted-foreground">Name</span><p className="text-sm font-semibold">{billingContact.contactName}</p></div>
                                        <div><span className="text-xs text-muted-foreground">Title</span><p className="text-sm">{billingContact.contactTitle ?? '—'}</p></div>
                                        <div><span className="text-xs text-muted-foreground">Email</span><p className="text-sm">{billingContact.contactEmail ?? '—'}</p></div>
                                        <div><Badge variant="outline" className="text-xs mt-1" style={{ borderColor: '#22c55e', color: '#22c55e' }}>Billing Contact</Badge></div>
                                    </div>
                                )}
                                {otherContacts.map(c => (
                                    <div key={c.id} className="py-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div><span className="text-xs text-muted-foreground">Name</span><p className="text-sm font-medium">{c.contactName}</p></div>
                                        <div><span className="text-xs text-muted-foreground">Title</span><p className="text-sm">{c.contactTitle ?? '—'}</p></div>
                                        <div><span className="text-xs text-muted-foreground">Email</span><p className="text-sm">{c.contactEmail ?? '—'}</p></div>
                                        <div><span className="text-xs text-muted-foreground">Role</span><p className="text-sm">{c.contactRole ?? '—'}</p></div>
                                    </div>
                                ))}
                                {!billingContact && otherContacts.length === 0 && (
                                    <p className="text-sm text-muted-foreground py-2">No contacts linked to this account.</p>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Line Items */}
            <Card className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                        Line Items ({deal.lineItems.length})
                        {isEditing && <span className="text-xs font-normal text-primary">Editing</span>}
                        <Button
                            size="sm" variant="outline"
                            className="ml-auto h-7 px-2"
                            onClick={() => { setAddingLineItem(true); setLineItemError(null); }}
                            disabled={addingLineItem}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Line Item
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Add form */}
                    {addingLineItem && (
                        <div className="p-3 border rounded-md bg-muted/30 space-y-3">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">New Line Item</p>
                            {lineItemError && <p className="text-xs text-destructive">{lineItemError}</p>}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="col-span-2 flex flex-col gap-1">
                                    <Label className="text-xs">Product Name *</Label>
                                    <Input placeholder="e.g. Core Subscription" value={newLineItem.productNameSnapshot} onChange={e => setNewLI('productNameSnapshot', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">SKU</Label>
                                    <Input placeholder="e.g. SKU-001" value={newLineItem.skuId} onChange={e => setNewLI('skuId', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">Qty</Label>
                                    <Input type="number" min="1" placeholder="1" value={newLineItem.quantity} onChange={e => setNewLI('quantity', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">Unit Price ($)</Label>
                                    <Input type="number" step="0.01" placeholder="0.00" value={newLineItem.unitPrice} onChange={e => setNewLI('unitPrice', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">Line Total ($)</Label>
                                    <Input type="number" step="0.01" placeholder="0.00" value={newLineItem.lineTotal} onChange={e => setNewLI('lineTotal', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">Billing Frequency</Label>
                                    <Input placeholder="e.g. Annual" value={newLineItem.billingFrequency} onChange={e => setNewLI('billingFrequency', e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">Line Type</Label>
                                    <Input placeholder="e.g. base_subscription" value={newLineItem.lineType} onChange={e => setNewLI('lineType', e.target.value)} />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" onClick={addLineItem} disabled={lineItemSaving || !newLineItem.productNameSnapshot.trim()}>
                                    <Save className="h-3.5 w-3.5 mr-1" /> {lineItemSaving ? 'Saving…' : 'Save Line Item'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setAddingLineItem(false); setLineItemError(null); setNewLineItem(DEFAULT_LINE_ITEM); }}>
                                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Existing rows */}
                    {deal.lineItems.length === 0 && !addingLineItem ? (
                        <div className="flex items-center gap-2 text-destructive text-sm">
                            <XCircle className="h-4 w-4 shrink-0" /> No line items — required before invoicing
                        </div>
                    ) : deal.lineItems.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-muted-foreground border-b">
                                        <th className="text-left pb-2 pr-4">#</th>
                                        <th className="text-left pb-2 pr-4">Product</th>
                                        <th className="text-left pb-2 pr-4">SKU</th>
                                        <th className="text-left pb-2 pr-4">Qty</th>
                                        <th className="text-left pb-2 pr-4">Unit Price</th>
                                        <th className="text-left pb-2 pr-4">Line Total</th>
                                        <th className="text-left pb-2 pr-4">Billing</th>
                                        <th className="text-left pb-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {deal.lineItems.map(li => {
                                        const liEdit = lineItemEdits[li.id] ?? {};
                                        const setLIField = (key: keyof NewLineItemForm, val: string) =>
                                            setLineItemEdits(prev => ({ ...prev, [li.id]: { ...prev[li.id], [key]: val } }));
                                        return (
                                            <tr key={li.id}>
                                                <td className="py-2 pr-2 text-muted-foreground">{li.lineOrder}</td>
                                                <td className="py-2 pr-2">
                                                    {isEditing
                                                        ? <Input className="h-7 text-xs min-w-[140px]" value={liEdit.productNameSnapshot ?? ''} onChange={e => setLIField('productNameSnapshot', e.target.value)} />
                                                        : <span className="font-medium">{li.productNameSnapshot ?? '—'}</span>}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {isEditing
                                                        ? <Input className="h-7 text-xs w-24" placeholder="SKU" value={liEdit.skuId ?? ''} onChange={e => setLIField('skuId', e.target.value)} />
                                                        : <span className="text-muted-foreground">{li.skuId ?? '—'}</span>}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {isEditing
                                                        ? <Input type="number" min="1" className="h-7 text-xs w-16" value={liEdit.quantity ?? ''} onChange={e => setLIField('quantity', e.target.value)} />
                                                        : li.quantity ?? '—'}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {isEditing
                                                        ? <Input type="number" step="0.01" className="h-7 text-xs w-28" placeholder="0.00" value={liEdit.unitPrice ?? ''} onChange={e => setLIField('unitPrice', e.target.value)} />
                                                        : li.unitPrice ? `$${parseFloat(li.unitPrice).toLocaleString()}` : <span className="text-destructive">Missing</span>}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {isEditing
                                                        ? <Input type="number" step="0.01" className="h-7 text-xs w-28" placeholder="0.00" value={liEdit.lineTotal ?? ''} onChange={e => setLIField('lineTotal', e.target.value)} />
                                                        : li.lineTotal ? `$${parseFloat(li.lineTotal).toLocaleString()}` : <span className="text-destructive">Missing</span>}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {isEditing
                                                        ? <Input className="h-7 text-xs w-24" placeholder="e.g. Annual" value={liEdit.billingFrequency ?? ''} onChange={e => setLIField('billingFrequency', e.target.value)} />
                                                        : <span className="text-muted-foreground">{li.billingFrequency ?? '—'}</span>}
                                                </td>
                                                <td className="py-2">
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteLineItem(li.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {/* Context */}
            <div className="grid md:grid-cols-3 gap-6">
                {([
                    { label: 'Pricing Context', field: 'pricingContext' as const, value: deal.pricingContext, icon: <DollarSign className="h-4 w-4 text-muted-foreground" /> },
                    { label: 'Rollout Context', field: 'rolloutContext' as const, value: deal.rolloutContext, icon: <Calendar className="h-4 w-4 text-muted-foreground" /> },
                    { label: 'Special Remarks', field: 'specialRemarks' as const, value: deal.specialRemarks, icon: <AlertCircle className="h-4 w-4 text-muted-foreground" /> },
                ]).map(({ label, field, value, icon }) => (
                    <Card key={label} className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">{icon}{label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isEditing && form ? (
                                <Textarea
                                    rows={4}
                                    placeholder={`Enter ${label.toLowerCase()}…`}
                                    value={form[field]}
                                    onChange={e => setField(field, e.target.value)}
                                />
                            ) : value ? (
                                <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">Not provided</p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Opportunity Notes + Finance Research */}
            <div className="grid md:grid-cols-2 gap-6">
                <Card className={isEditing ? 'ring-2 ring-primary/30' : ''}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Opportunity Notes</CardTitle></CardHeader>
                    <CardContent>
                        {isEditing && form ? (
                            <Textarea rows={4} placeholder="Enter opportunity notes…" value={form.opportunityNotes} onChange={e => setField('opportunityNotes', e.target.value)} />
                        ) : deal.opportunityNotes ? (
                            <p className="text-sm whitespace-pre-wrap">{deal.opportunityNotes}</p>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">Not provided</p>
                        )}
                    </CardContent>
                </Card>
                {deal.financeResearch && (
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Finance Research</CardTitle></CardHeader>
                        <CardContent><p className="text-sm whitespace-pre-wrap">{deal.financeResearch}</p></CardContent>
                    </Card>
                )}
            </div>

            {/* ── Branches (wholesale accounts only) ──────────────────────── */}
            {branches.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-muted-foreground" />
                            Branches ({branches.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {branches.map((branch) => {
                                const br = branchReadiness.find(r => r.branchId === branch.id);
                                const status = br?.status ?? 'blocked';
                                const statusColor =
                                    status === 'ready'   ? '#22c55e' :
                                    status === 'warning' ? '#f59e0b' : 'var(--chart-3)';
                                const StatusIcon =
                                    status === 'ready'   ? CheckCircle2 :
                                    status === 'warning' ? AlertTriangle : XCircle;

                                return (
                                    <div key={branch.id} className="rounded-lg border p-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="font-medium text-sm truncate">{branch.name}</span>
                                                {branch.branchType && (
                                                    <span className="text-xs text-muted-foreground shrink-0">({branch.branchType})</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0" style={{ color: statusColor }}>
                                                <StatusIcon className="h-4 w-4" />
                                                <span className="text-xs font-medium capitalize">{status}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            {branch.billingEntityName && (
                                                <span><span className="font-medium text-foreground">Billing entity: </span>{branch.billingEntityName}</span>
                                            )}
                                            {branch.billingStateProv && (
                                                <span><span className="font-medium text-foreground">Billing state: </span>{branch.billingStateProv}</span>
                                            )}
                                            {branch.procurementModel && (
                                                <span><span className="font-medium text-foreground">Procurement: </span>{branch.procurementModel}</span>
                                            )}
                                            {branch.estAnnualSpend && (
                                                <span><span className="font-medium text-foreground">Est. spend: </span>{branch.estAnnualSpend}</span>
                                            )}
                                        </div>

                                        {/* Billing contact summary */}
                                        {(branch.contacts ?? []).length > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground">Contacts: </span>
                                                {(branch.contacts ?? []).map(c => (
                                                    <span key={c.id} className="mr-2">
                                                        {c.contactName}
                                                        {c.isBillingContact && (
                                                            <span className="ml-1 text-green-600 font-medium">(billing)</span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Blockers */}
                                        {(br?.blockers ?? []).length > 0 && (
                                            <div className="space-y-1">
                                                {br!.blockers.map((b, i) => (
                                                    <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--chart-3)' }}>
                                                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                        <span>{b}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Line items for this branch */}
                                        {(branch.lineItems ?? []).length > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground">Line items: </span>
                                                {branch.lineItems!.length} item{branch.lineItems!.length !== 1 ? 's' : ''}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Invoice History */}
            {invoiceHistory.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <ReceiptText className="h-4 w-4 text-muted-foreground" />
                            Invoice History ({invoiceHistory.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-muted-foreground border-b bg-muted/30">
                                        <th className="text-left px-4 py-2 font-medium">Invoice #</th>
                                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                                        <th className="text-left px-4 py-2 font-medium">Invoice Date</th>
                                        <th className="text-left px-4 py-2 font-medium">Due Date</th>
                                        <th className="text-left px-4 py-2 font-medium">Status</th>
                                        <th className="text-left px-4 py-2 font-medium">Terms</th>
                                        <th className="text-left px-4 py-2 font-medium">Issues</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {invoiceHistory.map(inv => {
                                        const sc = (s: string | null) => {
                                            const x = (s ?? '').toLowerCase();
                                            if (x.startsWith('paid')) return '#22c55e';
                                            if (x === 'outstanding') return 'var(--chart-3)';
                                            if (x === 'pending') return '#f59e0b';
                                            return 'var(--muted-foreground)';
                                        };
                                        return (
                                            <tr key={inv.id} className={inv.isDisputed ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}>
                                                <td className="px-4 py-2.5 font-mono text-xs font-medium">
                                                    <span className="flex items-center gap-1.5">
                                                        {inv.invoiceNumber}
                                                        {inv.isDisputed && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Disputed" />}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                                                    {inv.invoiceAmount ? `$${parseFloat(inv.invoiceAmount).toLocaleString()}` : '—'}
                                                </td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{inv.invoiceDate ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{inv.dueDate ?? '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className="text-xs font-medium" style={{ color: sc(inv.paymentStatus) }}>
                                                        {inv.paymentStatus ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-muted-foreground text-xs">{inv.paymentTerms ?? '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {inv.issues.length > 0 ? (
                                                        <div className="space-y-1">
                                                            {inv.issues.map(issue => (
                                                                <p key={issue.id} className="text-xs text-amber-600 dark:text-amber-400">
                                                                    ⚠ {issue.issueSummary}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Separator />
            <p className="text-xs text-muted-foreground">Deal ID: {deal.id} · Last updated: {new Date(deal.updatedAt).toLocaleString()}</p>
        </div>
    );
};

export default DealsShow;

