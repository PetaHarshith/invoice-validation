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
import { APPLICATION_STATUSES, BACKEND_URL } from '@/constants';
import { Loader2, Briefcase, Building2, Calendar, Link2, FileText, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';

// Zod schema matching backend validation
const createApplicationSchema = z.object({
    userId: z.number().int().positive(),
    company: z.string().trim().min(1, 'Company name is required').max(120, 'Company name too long'),
    position: z.string().trim().min(1, 'Position is required').max(150, 'Position too long'),
    status: z.enum(['Applied', 'OA', 'Interview', 'Offer', 'Rejected', 'Withdrawn']).optional(),
    dateApplied: z.union([
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
        z.literal(''),
        z.null(),
        z.undefined()
    ]).optional(),
    jobUrl: z.union([z.string(), z.literal(''), z.null(), z.undefined()]).optional(),
    notes: z.union([z.string(), z.literal(''), z.null(), z.undefined()]).optional(),
});

type CreateApplicationFormData = z.infer<typeof createApplicationSchema>;

const ApplicationsCreate = () => {
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
    } = useForm<CreateApplicationFormData>({
        resolver: zodResolver(createApplicationSchema),
        defaultValues: {
            userId: 1,
            company: '',
            position: '',
            status: 'Applied',
        },
        mode: 'onSubmit',
    });

    const watchedStatus = watch('status');

    // Smooth entrance animation
    useEffect(() => {
        const ctx = gsap.context(() => {
            // Background gradient animation
            gsap.to(containerRef.current, {
                backgroundPosition: '100% 50%',
                duration: 8,
                ease: 'none',
                repeat: -1,
                yoyo: true,
            });

            // Card entrance
            gsap.fromTo(cardRef.current,
                { opacity: 0, y: 40, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
            );

            // Header slide in
            gsap.fromTo(headerRef.current,
                { opacity: 0, x: -20 },
                { opacity: 1, x: 0, duration: 0.5, delay: 0.2, ease: 'power2.out' }
            );

            // Form fields stagger
            gsap.fromTo('.form-field',
                { opacity: 0, y: 15 },
                { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, delay: 0.3, ease: 'power2.out' }
            );
        });

        return () => ctx.revert();
    }, []);

    const onSubmit = async (data: CreateApplicationFormData) => {
        setIsSubmitting(true);

        try {
            const response = await fetch(`${BACKEND_URL}/applications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create application');
            }

            await response.json();

            // Success animation
            gsap.to(cardRef.current, {
                scale: 0.98,
                opacity: 0,
                y: -20,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => {
                    toast.success('Application added successfully!');
                    navigate('/applications');
                },
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create application');
            // Shake animation
            gsap.fromTo(cardRef.current,
                { x: -8 },
                { x: 8, duration: 0.08, repeat: 4, yoyo: true, ease: 'power2.inOut' }
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const onError = () => {
        toast.error('Please fill in all required fields');
        gsap.fromTo(cardRef.current,
            { x: -5 },
            { x: 5, duration: 0.08, repeat: 3, yoyo: true, ease: 'power2.inOut' }
        );
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
            {/* Header */}
            <div ref={headerRef} className="max-w-2xl mx-auto mb-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/applications')}
                    className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Applications
                </Button>
                <h1 className="text-2xl font-bold text-foreground">Track New Application</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    <span className="text-destructive">*</span> indicates required fields
                </p>
            </div>

            {/* Main Card */}
            <div
                ref={cardRef}
                className="max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-xl overflow-hidden"
            >
                <form onSubmit={handleSubmit(onSubmit, onError)}>
                    {/* Form Content */}
                    <div className="p-6 space-y-5">
                        {/* Row 1: Company & Position */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5">
                                <Label htmlFor="company" className="flex items-center gap-2 text-sm font-medium">
                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                    Company <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="company"
                                    {...register('company')}
                                    placeholder="Google, Meta, etc."
                                    className={`h-10 ${errors.company ? 'border-destructive ring-1 ring-destructive' : ''}`}
                                />
                                {errors.company && (
                                    <p className="text-xs text-destructive">{errors.company.message}</p>
                                )}
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="position" className="flex items-center gap-2 text-sm font-medium">
                                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                                    Position <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="position"
                                    {...register('position')}
                                    placeholder="Software Engineer"
                                    className={`h-10 ${errors.position ? 'border-destructive ring-1 ring-destructive' : ''}`}
                                />
                                {errors.position && (
                                    <p className="text-xs text-destructive">{errors.position.message}</p>
                                )}
                            </div>
                        </div>

                        {/* Row 2: Status & Date */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-field space-y-1.5">
                                <Label className="text-sm font-medium">Status</Label>
                                <Select
                                    value={watchedStatus}
                                    onValueChange={(value) => setValue('status', value as any)}
                                >
                                    <SelectTrigger className="h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {APPLICATION_STATUSES.map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {status}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="form-field space-y-1.5">
                                <Label htmlFor="dateApplied" className="flex items-center gap-2 text-sm font-medium">
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    Date Applied
                                </Label>
                                <Input
                                    id="dateApplied"
                                    type="date"
                                    {...register('dateApplied')}
                                    className="h-10"
                                />
                            </div>
                        </div>

                        {/* Row 3: Job URL */}
                        <div className="form-field space-y-1.5">
                            <Label htmlFor="jobUrl" className="flex items-center gap-2 text-sm font-medium">
                                <Link2 className="w-4 h-4 text-muted-foreground" />
                                Job Posting URL
                            </Label>
                            <Input
                                id="jobUrl"
                                type="url"
                                {...register('jobUrl')}
                                placeholder="https://careers.company.com/job/..."
                                className="h-10"
                            />
                        </div>

                        {/* Row 4: Notes */}
                        <div className="form-field space-y-1.5">
                            <Label htmlFor="notes" className="flex items-center gap-2 text-sm font-medium">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                Notes
                            </Label>
                            <Textarea
                                id="notes"
                                {...register('notes')}
                                placeholder="Referral contact, interview prep notes, etc."
                                rows={2}
                                className="resize-none"
                            />
                        </div>
                    </div>

                    {/* Footer / Actions */}
                    <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => navigate('/applications')}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="min-w-[140px]"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <Send className="w-4 h-4 mr-2" />
                                    Add Application
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ApplicationsCreate;
