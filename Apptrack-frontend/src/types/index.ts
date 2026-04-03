// Deal workflow stage — matches deal_stage_enum in the backend schema
export type DealStatus = 'closed_won' | 'needs_info' | 'ready_for_invoice' | 'invoiced' | 'disputed';

// Readiness status — output of the readiness checker utility
export type ReadinessStatus = 'ready' | 'warning' | 'blocked';

// Deal type — aligned with the normalized deals table + accounts join
// id is a UUID string; dealStage replaces the old "status" field.
export type Deal = {
    id: string; // uuid

    // From accounts join (populated by GET /deals list endpoint)
    accountId: string;
    accountName: string | null;

    // Opportunity-level fields
    opportunityId: string | null;
    opportunityName: string | null;
    opportunityOwner: string | null;
    opportunityType: string | null;
    oppCloseDate: string | null;

    // Workflow + readiness
    dealStage: DealStatus;
    readinessStatus: ReadinessStatus;

    // Financial summary
    totalContractValue: string | null; // numeric comes back as string from Postgres

    // Contract
    contractAttached: boolean;

    // Pipeline context (sales-side, never affects readiness)
    pipelineStage: string | null;
    probability: number | null;
    nextStep: string | null;
    forecastCategory: string | null;
    campaign: string | null;

    // Readiness diagnostics
    missingFields: string[] | null;
    warnings: string[] | null;

    createdAt: string;
    updatedAt: string;
};

// Contact record — matches contacts table
export type Contact = {
    id: string;
    accountId: string;
    contactName: string;
    contactTitle: string | null;
    contactEmail: string | null;
    contactLocation: string | null;
    contactRole: string | null;
    isPrimaryContact: boolean;
    isBillingContact: boolean;
    createdAt: string;
    updatedAt: string;
};

// Line item record — matches deal_line_items table
export type DealLineItem = {
    id: string;
    dealId: string;
    productCatalogId: string | null;
    skuId: string | null;
    lineOrder: number;
    productNameSnapshot: string | null;
    quantity: number | null;
    includedSeatsSnapshot: number | null;
    unitPrice: string | null;
    lineTotal: string | null;
    billingFrequency: string | null;
    lineType: string | null;
    discountAmount: string | null;
    discountApprovedText: string | null;
    lineDescription: string | null;
    createdAt: string;
    updatedAt: string;
};

// Full deal detail — returned by GET /deals/:id with nested relations
export type DealDetail = Deal & {
    // All deal-level fields beyond the list view
    opportunityId: string | null;
    opportunityType: string | null;
    opportunitySource: string | null;
    opportunityCloseReason: string | null;
    opportunityNotes: string | null;
    opportunityAmountRollup: string | null;
    opportunityTerm: string | null;
    oppCreatedDate: string | null;
    oppStageRaw: string | null;

    // Snapshot fields
    accountProductSnapshot: string | null;
    accountTotalSeatsSnapshot: number | null;
    primaryContactNameSnapshot: string | null;
    primaryContactTitleSnapshot: string | null;
    primaryContactLocationSnapshot: string | null;

    // Contract
    contractStartDate: string | null;
    contractTermText: string | null;

    // Pipeline context (also on DealDetail for the show page)
    pipelineStage: string | null;
    probability: number | null;
    nextStep: string | null;
    forecastCategory: string | null;
    campaign: string | null;

    // Structured context
    pricingContext: string | null;
    rolloutContext: string | null;
    specialRemarks: string | null;
    financeResearch: string | null;

    // Nested relations
    account: {
        id: string;
        accountName: string;
        accountCity: string | null;
        accountState: string | null;
        accountIndustry: string | null;
        accountSize: string | null;
        accountStatus: string | null;
        accountProduct: string | null;
        totalSeats: number | null;
        contacts: Contact[];
    } | null;
    lineItems: DealLineItem[];
};

// Invoice record — matches the invoices table + deal join for accountName
export type Invoice = {
    id: string;
    invoiceNumber: string;
    opportunityId: string | null;
    dealId: string | null;
    accountId: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    paymentDate: string | null;
    invoiceAmount: string | null; // numeric comes as string from Postgres
    paymentStatus: string | null;
    paymentTerms: string | null;
    product: string | null;
    opportunityType: string | null;
    seats: number | null;
    poNumber: string | null;
    billingContactName: string | null;
    billingContactEmail: string | null;
    crmContactName: string | null;
    opportunityOwner: string | null;
    invoiceNotes: string | null;
    isDisputed: boolean;
    accountName: string | null; // joined from deals.opportunityName
    createdAt: string;
    updatedAt: string;
};

// Invoice issue — disputes / finance review findings tied to an invoice
export type InvoiceIssue = {
    id: string;
    invoiceId: string | null;
    dealId: string | null;
    accountId: string | null;
    issueSource: string | null;
    issueSummary: string;
    issueDetail: string | null;
    issueStatus: string | null;
    reportedDate: string | null;
    reportedBy: string | null;
    createdAt: string;
    updatedAt: string;
};

export type InvoiceWithIssues = Invoice & { issues: InvoiceIssue[] };

// Invoice list stats — returned by GET /invoices/stats
export type InvoiceStats = {
    total: number;
    paid: number;
    outstanding: number;
    pending: number;
    disputed: number;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
};

// API Response types for Refine data provider
export type ListResponse<T = unknown> = {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

export type GetOneResponse<T = unknown> = {
    data: T;
};

export type CreateResponse<T = unknown> = {
    data: T;
};

export type UpdateResponse<T = unknown> = {
    data: T;
};

export type DeleteResponse<T = unknown> = {
    data: T;
};

// ── Wholesale / Branch types ─────────────────────────────────────────────────

export type Branch = {
    id: string;
    accountId: string;
    companyIdExternal?: string | null;
    branchIdExternal?: string | null;
    name: string;
    branchType?: string | null;
    branchCity?: string | null;
    branchState?: string | null;
    branchCountry?: string | null;
    billingEntityName?: string | null;
    billingStateProv?: string | null;
    billingCountry?: string | null;
    procurementModel?: string | null;
    erpSystem?: string | null;
    estAnnualSpend?: string | null;
    skuCountEst?: number | null;
    branchStatus?: string | null;
    needsReview?: boolean | null;
    notes?: string | null;
    // Nested — populated by GET /deals/:id
    contacts?: Contact[];
    lineItems?: DealLineItem[];
};

export type BranchReadinessResult = {
    branchId:   string;
    branchName: string;
    status:     'ready' | 'warning' | 'blocked';
    blockers:   string[];
    warnings:   string[];
};
