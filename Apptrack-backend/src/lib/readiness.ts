/**
 * readiness.ts — Invoice Readiness Checker
 *
 * Computes whether a deal has all the information finance needs to safely invoice.
 * Called after every POST /deals and PUT /deals/:id.
 * Also used by the stage gate to block premature ready_for_invoice transitions.
 */

export type ReadinessDealInput = {
    contractStartDate?: string | null | undefined;
    contractTermText?: string | null | undefined;
    opportunityTerm?: string | null | undefined;
    totalContractValue?: string | null | undefined;
    opportunityAmountRollup?: string | null | undefined;
    contractAttached?: boolean | null | undefined;
    pricingContext?: string | null | undefined;
    rolloutContext?: string | null | undefined;
    specialRemarks?: string | null | undefined;
    opportunityNotes?: string | null | undefined;
    trackerDiscount?: number | string | null | undefined;
};

export type ReadinessContact = {
    isBillingContact: boolean;
};

export type ReadinessLineItem = {
    unitPrice?: string | null;
    lineTotal?: string | null;
    productNameSnapshot?: string | null;
};

export type ReadinessResult = {
    readinessStatus: 'ready' | 'warning' | 'blocked';
    missingFields: string[];
    warnings: string[];
};

/** Returns true only if the string is a non-empty, non-zero numeric value */
function hasValue(v: string | null | undefined): boolean {
    if (v == null || v.trim() === '') return false;
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
}

export function computeReadiness(
    deal: ReadinessDealInput,
    contacts: ReadinessContact[],
    lineItems: ReadinessLineItem[]
): ReadinessResult {
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // ── BLOCKING checks (deal cannot proceed to ready_for_invoice) ──────────

    // 1. Contract start date — finance needs to know when billing begins
    if (!deal.contractStartDate) {
        missingFields.push('contractStartDate — finance cannot determine billing start');
    }

    // 2. Contract term — at least one term field must be set
    if (!deal.contractTermText && !deal.opportunityTerm) {
        missingFields.push('contractTerm — no term length (contractTermText or opportunityTerm) provided');
    }

    // 3. Contract value — at least one value field must be set and non-zero
    if (!hasValue(deal.totalContractValue) && !hasValue(deal.opportunityAmountRollup)) {
        missingFields.push('contractValue — neither totalContractValue nor opportunityAmountRollup is set');
    }

    // 4. Signed contract — required to protect both parties
    if (!deal.contractAttached) {
        missingFields.push('contractAttached — no signed contract on record');
    }

    // 5. Billing contact — finance must know who receives invoices
    const hasBillingContact = contacts.some((c) => c.isBillingContact);
    if (!hasBillingContact) {
        missingFields.push('billingContact — no contact marked as billing contact for this account');
    }

    // 6. Line items — finance must know what was actually purchased
    if (lineItems.length === 0) {
        missingFields.push('lineItems — no products/SKUs attached to this deal');
    }

    // ── WARNING checks (advisory — deal can proceed but finance should review) ─

    // Helper: search a set of text fields for any keyword (case-insensitive)
    const searchText = [deal.specialRemarks, deal.opportunityNotes].join(' ').toLowerCase();

    // 1. Pricing context — only warn when a discount or pricing exception is likely
    if (!deal.pricingContext) {
        const hasDiscount = deal.trackerDiscount != null && Number(deal.trackerDiscount) > 0;
        const PRICING_KEYWORDS = ['discount', 'pilot', 'promo', 'special pricing', 'exception'];
        const hasPricingKeyword = PRICING_KEYWORDS.some((kw) => searchText.includes(kw));
        if (hasDiscount || hasPricingKeyword) {
            warnings.push('pricingContext is empty — pricing exceptions or discounts may be unknown to finance');
        }
    }

    // 2. Rollout context — only warn when implementation complexity is likely
    if (!deal.rolloutContext) {
        const IMPL_PRODUCT_KEYWORDS = ['implementation', 'migration', 'training', 'onboarding'];
        const hasImplProduct = lineItems.some((li) =>
            IMPL_PRODUCT_KEYWORDS.some((kw) =>
                (li.productNameSnapshot ?? '').toLowerCase().includes(kw)
            )
        );
        const ROLLOUT_KEYWORDS = ['pilot', 'rollout', 'phase', 'deployment'];
        const hasRolloutKeyword = ROLLOUT_KEYWORDS.some((kw) => searchText.includes(kw));
        if (hasImplProduct || hasRolloutKeyword) {
            warnings.push('rolloutContext is empty — implementation phasing is unclear');
        }
    }

    // 3. Incomplete line item pricing — always valid to flag
    if (lineItems.length > 0) {
        const sparse = lineItems.filter((li) => !li.unitPrice || !li.lineTotal);
        if (sparse.length > 0) {
            warnings.push(`${sparse.length} line item(s) are missing unit price or line total`);
        }
    }

    // ── Determine overall readiness status ──────────────────────────────────
    const readinessStatus: ReadinessResult['readinessStatus'] =
        missingFields.length > 0
            ? 'blocked'
            : warnings.length > 0
                ? 'warning'
                : 'ready';

    return { readinessStatus, missingFields, warnings };
}

/**
 * Auto-advance a deal's stage when it becomes fully ready.
 * Only promotes needs_info → ready_for_invoice.
 * Never touches closed_won, invoiced, or disputed.
 */
export function autoAdvanceStage(
    currentStage: string,
    readinessStatus: ReadinessResult['readinessStatus']
): string {
    if (readinessStatus === 'ready' && currentStage === 'needs_info') {
        return 'ready_for_invoice';
    }
    return currentStage;
}

