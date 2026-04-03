/**
 * readiness.ts — Invoice Readiness Checker
 *
 * Computes whether a deal has all the information finance needs to safely invoice.
 * Called after every POST /deals and PUT /deals/:id.
 * Also used by the stage gate to block premature ready_for_invoice transitions.
 *
 * WHOLESALE EXTENSION (backward compatible):
 *   If branches are provided, per-branch readiness is computed in addition to the
 *   deal-level checks. The deal is READY only when ALL branches are ready.
 *   Existing deals with no branches use the original single-level logic unchanged.
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

// ── Wholesale / branch types ─────────────────────────────────────────────────

/** Minimal branch fields needed by the readiness checker */
export type ReadinessBranchInput = {
    id: string;
    name: string;
    billingEntityName?: string | null;
    // Contacts scoped to this branch (is_billing_contact flag)
    contacts: ReadinessContact[];
    // Line items attributed to this branch (deal_line_items.branch_id = branch.id)
    lineItems: ReadinessLineItem[];
};

export type BranchReadinessResult = {
    branchId:   string;
    branchName: string;
    status:     'ready' | 'warning' | 'blocked';
    blockers:   string[];
    warnings:   string[];
};

/** Returns true only if the string is a non-empty, non-zero numeric value */
function hasValue(v: string | null | undefined): boolean {
    if (v == null || v.trim() === '') return false;
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
}

/**
 * Compute readiness for a single branch.
 * Called once per branch when the deal has wholesale branches.
 *
 * Per-branch requirements:
 *   1. billingEntityName must be set (so finance knows what legal entity to invoice)
 *   2. At least one contact on this branch must be marked as billing contact
 *   3. At least one line item must be attributed to this branch
 */
function computeBranchReadiness(branch: ReadinessBranchInput): BranchReadinessResult {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!branch.billingEntityName?.trim()) {
        blockers.push('billingEntityName — no legal billing entity set for this branch');
    }

    const hasBillingContact = branch.contacts.some((c) => c.isBillingContact);
    if (!hasBillingContact) {
        blockers.push('billingContact — no billing contact assigned to this branch');
    }

    if (branch.lineItems.length === 0) {
        blockers.push('lineItems — no line items attributed to this branch');
    }

    const status: BranchReadinessResult['status'] =
        blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';

    return { branchId: branch.id, branchName: branch.name, status, blockers, warnings };
}

export function computeReadiness(
    deal: ReadinessDealInput,
    contacts: ReadinessContact[],
    lineItems: ReadinessLineItem[],
    branches?: ReadinessBranchInput[]
): ReadinessResult & { branches?: BranchReadinessResult[] } {
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

    // 5 & 6: For wholesale deals with branches, billing contacts and line items are
    // validated per-branch below. For standard (non-branch) deals, check at deal level.
    const hasBranches = branches && branches.length > 0;

    if (!hasBranches) {
        // 5. Billing contact — finance must know who receives invoices
        const hasBillingContact = contacts.some((c) => c.isBillingContact);
        if (!hasBillingContact) {
            missingFields.push('billingContact — no contact marked as billing contact for this account');
        }

        // 6. Line items — finance must know what was actually purchased
        if (lineItems.length === 0) {
            missingFields.push('lineItems — no products/SKUs attached to this deal');
        }
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

    // ── Branch-level readiness (wholesale deals only) ────────────────────────
    let branchResults: BranchReadinessResult[] | undefined;
    if (hasBranches) {
        branchResults = branches!.map(computeBranchReadiness);
        const anyBranchBlocked  = branchResults.some((b) => b.status === 'blocked');
        const anyBranchWarning  = branchResults.some((b) => b.status === 'warning');
        if (anyBranchBlocked) {
            missingFields.push('branches — one or more branches have missing billing information');
        } else if (anyBranchWarning) {
            warnings.push('branches — one or more branches have advisory warnings');
        }
    }

    // ── Determine overall readiness status ──────────────────────────────────
    const readinessStatus: ReadinessResult['readinessStatus'] =
        missingFields.length > 0
            ? 'blocked'
            : warnings.length > 0
                ? 'warning'
                : 'ready';

    // Only include branches key when it was computed (exactOptionalPropertyTypes compat)
    return branchResults !== undefined
        ? { readinessStatus, missingFields, warnings, branches: branchResults }
        : { readinessStatus, missingFields, warnings };
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

