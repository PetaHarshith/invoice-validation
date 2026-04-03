import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router';
import gsap from 'gsap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEAL_STATUS_OPTIONS, BACKEND_URL } from '@/constants';
import { DealStatus } from '@/types';
import { Loader2, Building2, Calendar, FileText, ArrowLeft, FileCheck, User, MapPin, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

// Zod schema — only grounded required fields are marked required.
// All other fields are optional so the form can be saved incrementally.
const createDealSchema = z.object({
    companyName: z.string().trim().min(1, 'Company name is required').max(200),
    opportunityOwner: z.string().trim().max(150).optional().or(z.literal('')),
    primaryContact: z.string().trim().max(150).optional().or(z.literal('')),
    billingContact: z.string().trim().max(150).optional().or(z.literal('')),
    companyAddress: z.string().trim().max(300).optional().or(z.literal('')),
    customerLocation: z.string().trim().max(200).optional().or(z.literal('')),
    productTier: z.string().trim().max(100).optional().or(z.literal('')),
    products: z.string().trim().max(300).optional().or(z.literal('')),
    closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    contractStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    contractTerm: z.string().trim().max(100).optional().or(z.literal('')),
    dealAmount: z.coerce.number().nonnegative().optional().nullable(),
    totalContractValue: z.coerce.number().nonnegative().optional().nullable(),
    contractAttached: z.boolean().optional(),
    opportunityNotes: z.string().trim().optional().or(z.literal('')),
    status: z.enum(['closed_won', 'needs_info', 'ready_for_invoice', 'invoiced', 'disputed']).optional(),
    // Pipeline context fields
    pipelineStage: z.string().trim().max(100).optional().or(z.literal('')),
    probability: z.coerce.number().int().min(0).max(100).optional().nullable(),
    forecastCategory: z.string().trim().max(100).optional().or(z.literal('')),
    nextStep: z.string().trim().max(500).optional().or(z.literal('')),
    campaign: z.string().trim().max(200).optional().or(z.literal('')),
});

type CreateDealFormData = z.infer<typeof createDealSchema>;

const DealsCreate = () => {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<CreateDealFormData>({
        resolver: zodResolver(createDealSchema),
        defaultValues: { status: 'closed_won', contractAttached: false },
        mode: 'onSubmit',
    });

    const watchedStatus = watch('status');

    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(cardRef.current,
                { opacity: 0, y: 40, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
            );
            gsap.fromTo(headerRef.current,
                { opacity: 0, x: -20 },
                { opacity: 1, x: 0, duration: 0.5, delay: 0.2, ease: 'power2.out' }
            );
            gsap.fromTo('.form-field',
                { opacity: 0, y: 15 },
                { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, delay: 0.3, ease: 'power2.out' }
            );
        });
        return () => ctx.revert();
    }, []);

    const onSubmit = async (data: CreateDealFormData) => {
        setIsSubmitting(true);
        try {
            // ── Step 1: find or create the account by company name ────────────
            const searchRes = await fetch(
                `${BACKEND_URL}/accounts?search=${encodeURIComponent(data.companyName)}`
            );
            if (!searchRes.ok) throw new Error('Failed to look up company');
            const searchJson = await searchRes.json();
            const existing = (searchJson.data ?? []).find(
                (a: { id: string; accountName: string }) =>
                    a.accountName.toLowerCase() === data.companyName.trim().toLowerCase()
            );

            let accountId: string;
            if (existing) {
                accountId = existing.id;
            } else {
                const createAccRes = await fetch(`${BACKEND_URL}/accounts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountName: data.companyName.trim() }),
                });
                if (!createAccRes.ok) throw new Error('Failed to create company record');
                const createAccJson = await createAccRes.json();
                accountId = createAccJson.data.id;
            }

            // ── Step 2: map form fields → backend deal field names ────────────
            const dealPayload: Record<string, unknown> = {
                accountId,
                opportunityOwner:           data.opportunityOwner || null,
                dealStage:                  data.status ?? 'needs_info',
                primaryContactNameSnapshot: data.primaryContact || null,
                primaryContactLocationSnapshot: data.customerLocation || null,
                oppCloseDate:               data.closeDate || null,
                contractStartDate:          data.contractStartDate || null,
                contractTermText:           data.contractTerm || null,
                opportunityAmountRollup:    data.dealAmount != null ? String(data.dealAmount) : null,
                totalContractValue:         data.totalContractValue != null ? String(data.totalContractValue) : null,
                contractAttached:           data.contractAttached ?? false,
                opportunityNotes:           data.opportunityNotes || null,
                accountProductSnapshot:     [data.productTier, data.products].filter(Boolean).join(' · ') || null,
                // Pipeline context
                pipelineStage:              data.pipelineStage || null,
                probability:                data.probability ?? null,
                forecastCategory:           data.forecastCategory || null,
                nextStep:                   data.nextStep || null,
                campaign:                   data.campaign || null,
            };

            // ── Step 3: create the deal (readiness checker runs server-side) ──
            const dealRes = await fetch(`${BACKEND_URL}/deals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(dealPayload),
            });
            if (!dealRes.ok) {
                const err = await dealRes.json();
                const msg = typeof err.error === 'string' ? err.error : 'Failed to create deal';
                throw new Error(msg);
            }

            gsap.to(cardRef.current, {
                scale: 0.98, opacity: 0, y: -20, duration: 0.3, ease: 'power2.in',
                onComplete: () => { toast.success('Deal created successfully!'); navigate('/deals'); },
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create deal');
            gsap.fromTo(cardRef.current, { x: -8 }, { x: 8, duration: 0.08, repeat: 4, yoyo: true, ease: 'power2.inOut' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const onError = () => {
        toast.error('Please fill in all required fields');
        gsap.fromTo(cardRef.current, { x: -5 }, { x: 5, duration: 0.08, repeat: 3, yoyo: true, ease: 'power2.inOut' });
    };

    return (
        <div
            ref={containerRef}
            className="min-h-screen p-4 md:p-8"
            style={{
                background: 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 50%, hsl(var(--background)) 100%)',
                backgroundSize: '200% 200%',
            }}
        >
            <div ref={headerRef} className="max-w-2xl mx-auto mb-6">
                <Button
                    variant="ghost" size="sm"
                    onClick={() => navigate('/deals')}
                    className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Deals
                </Button>
                <h1 className="text-2xl font-bold text-foreground">Add New Deal</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Fill in the deal details below. <span className="text-destructive">*</span> fields are required.
                    Readiness will be checked after saving.
                </p>
            </div>

            <div ref={cardRef} className="max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                <form onSubmit={handleSubmit(onSubmit, onError)}>
                    <div className="p-6 space-y-5">

                        {/* Section: Company / Opportunity */}
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company &amp; Opportunity</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5 md:col-span-2">
                                <Label htmlFor="companyName" className="flex items-center gap-2 text-sm font-medium">
                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                    Company Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="companyName"
                                    {...register('companyName')}
                                    placeholder="e.g. Great Lakes Industrial"
                                    className={`h-10 ${errors.companyName ? 'border-destructive ring-1 ring-destructive' : ''}`}
                                />
                                {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="opportunityOwner" className="flex items-center gap-2 text-sm font-medium">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                    Opportunity Owner
                                </Label>
                                <Input id="opportunityOwner" {...register('opportunityOwner')} placeholder="Sales rep name" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label className="text-sm font-medium">Deal Status</Label>
                                <Select value={watchedStatus} onValueChange={(v) => setValue('status', v as DealStatus)}>
                                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {DEAL_STATUS_OPTIONS.map((s) => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Section: Contacts */}
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Contacts</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5">
                                <Label htmlFor="primaryContact" className="flex items-center gap-2 text-sm font-medium">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                    Primary Contact
                                </Label>
                                <Input id="primaryContact" {...register('primaryContact')} placeholder="Main deal contact" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="billingContact" className="flex items-center gap-2 text-sm font-medium">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                    Billing Contact
                                    <span className="text-xs text-muted-foreground">(AP / Finance)</span>
                                </Label>
                                <Input id="billingContact" {...register('billingContact')} placeholder="Who receives invoices?" className="h-10" />
                            </div>
                        </div>

                        {/* Section: Location */}
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Location</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5">
                                <Label htmlFor="companyAddress" className="flex items-center gap-2 text-sm font-medium">
                                    <MapPin className="w-4 h-4 text-muted-foreground" />
                                    Company Address
                                </Label>
                                <Input id="companyAddress" {...register('companyAddress')} placeholder="Street, City, State, ZIP" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="customerLocation" className="flex items-center gap-2 text-sm font-medium">
                                    <MapPin className="w-4 h-4 text-muted-foreground" />
                                    Customer Location
                                </Label>
                                <Input id="customerLocation" {...register('customerLocation')} placeholder="Region / site" className="h-10" />
                            </div>
                        </div>

                        {/* Section: Contract */}
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Contract &amp; Pricing</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5">
                                <Label htmlFor="productTier" className="flex items-center gap-2 text-sm font-medium">
                                    <FileCheck className="w-4 h-4 text-muted-foreground" />
                                    Product Tier
                                </Label>
                                <Input id="productTier" {...register('productTier')} placeholder="e.g. Professional, Enterprise" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="products" className="flex items-center gap-2 text-sm font-medium">
                                    <FileCheck className="w-4 h-4 text-muted-foreground" />
                                    Products
                                </Label>
                                <Input id="products" {...register('products')} placeholder="Product names / SKUs" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="dealAmount" className="text-sm font-medium">Deal Amount ($)</Label>
                                <Input id="dealAmount" type="number" min="0" step="0.01" {...register('dealAmount')} placeholder="0.00" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="totalContractValue" className="text-sm font-medium">Total Contract Value ($)</Label>
                                <Input id="totalContractValue" type="number" min="0" step="0.01" {...register('totalContractValue')} placeholder="0.00" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="closeDate" className="flex items-center gap-2 text-sm font-medium">
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    Close Date
                                </Label>
                                <Input id="closeDate" type="date" {...register('closeDate')} className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="contractStartDate" className="flex items-center gap-2 text-sm font-medium">
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    Contract Start Date
                                </Label>
                                <Input id="contractStartDate" type="date" {...register('contractStartDate')} className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="contractTerm" className="text-sm font-medium">Contract Term</Label>
                                <Input id="contractTerm" {...register('contractTerm')} placeholder="e.g. 12 months, Annual" className="h-10" />
                            </div>

                            {/* contractAttached checkbox */}
                            <div className="form-field flex items-center gap-3 pt-6">
                                <input
                                    id="contractAttached"
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-border accent-primary"
                                    {...register('contractAttached')}
                                />
                                <Label htmlFor="contractAttached" className="text-sm font-medium cursor-pointer">
                                    Signed contract attached
                                </Label>
                            </div>
                        </div>

                        {/* Section: Pipeline Context */}
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" /> Pipeline Context
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5">
                                <Label htmlFor="pipelineStage" className="text-sm font-medium">Pipeline Stage</Label>
                                <Input id="pipelineStage" {...register('pipelineStage')} placeholder="e.g. Proposal/Price Quote" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="probability" className="text-sm font-medium">Probability (%)</Label>
                                <Input id="probability" type="number" min="0" max="100" {...register('probability')} placeholder="0 – 100" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="forecastCategory" className="text-sm font-medium">Forecast Category</Label>
                                <Input id="forecastCategory" {...register('forecastCategory')} placeholder="e.g. Commit, Best Case, Pipeline" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="campaign" className="text-sm font-medium">Campaign</Label>
                                <Input id="campaign" {...register('campaign')} placeholder="e.g. Q2 Outbound, Partner Referral" className="h-10" />
                            </div>

                            <div className="form-field space-y-1.5 md:col-span-2">
                                <Label htmlFor="nextStep" className="text-sm font-medium">Next Step</Label>
                                <Input id="nextStep" {...register('nextStep')} placeholder="e.g. Send revised proposal by Friday" className="h-10" />
                            </div>
                        </div>

                        {/* Section: Notes */}
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Notes</p>

                        <div className="form-field space-y-1.5">
                            <Label htmlFor="opportunityNotes" className="flex items-center gap-2 text-sm font-medium">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                Opportunity Notes
                            </Label>
                            <Textarea
                                id="opportunityNotes"
                                {...register('opportunityNotes')}
                                placeholder="Pricing exceptions, pilot terms, rollout details, discounts, open questions…"
                                rows={3}
                                className="resize-none"
                            />
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={() => navigate('/deals')} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <FileCheck className="w-4 h-4 mr-2" />
                                    Save Deal
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DealsCreate;

