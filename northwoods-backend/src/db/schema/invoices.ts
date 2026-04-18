import {
    pgTable,
    uuid,
    text,
    integer,
    numeric,
    boolean,
    date,
    timestamp,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { deals } from "./deals";

// Reusable timestamps — same pattern as original codebase
const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
};

/**
 * invoices — actual invoice records imported from invoice exports / PDFs.
 * Kept separate from deals: billed output and sold context are not the same thing.
 * deal_id and account_id are nullable because some invoice rows may not map cleanly
 * until opportunity_id joins are complete during import.
 * bill_to_text / ship_to_text kept as text for MVP — full address parsing is out of scope.
 */
export const invoices = pgTable(
    "invoices",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        invoiceNumber: text("invoice_number").notNull(),

        // Nullable until opportunity_id join resolves
        dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
        // Raw source join key — kept alongside dealId for traceability
        opportunityId: text("opportunity_id"),
        accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),

        // ── Invoice register columns ────────────────────────────────────────────
        invoiceDate: date("invoice_date"),
        billingAddress: text("billing_address"),
        accountCity: text("account_city"),
        accountState: text("account_state"),
        billingContactName: text("billing_contact_name"),
        billingContactTitle: text("billing_contact_title"),
        billingContactEmail: text("billing_contact_email"),
        crmContactName: text("crm_contact_name"),
        crmContactTitle: text("crm_contact_title"),
        product: text("product"),
        opportunityType: text("opportunity_type"),
        seats: integer("seats"),
        poNumber: text("po_number"),
        invoiceAmount: numeric("invoice_amount", { precision: 12, scale: 2 }),
        paymentTerms: text("payment_terms"),
        dueDate: date("due_date"),
        // Free text: paid, unpaid, overdue, disputed — not enum; varies across source files
        paymentStatus: text("payment_status"),
        paymentDate: date("payment_date"),
        opportunityOwner: text("opportunity_owner"),
        invoiceNotes: text("invoice_notes"),

        // ── Dispute flag — set when invoice appears in DisputedInvoicesExport ──
        isDisputed: boolean("is_disputed").default(false).notNull(),

        // ── Extra fields from invoice PDFs (kept as text for MVP) ──────────────
        billToText: text("bill_to_text"),
        shipToText: text("ship_to_text"),
        description: text("description"),
        subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
        salesTax: numeric("sales_tax", { precision: 12, scale: 2 }),
        balanceDue: numeric("balance_due", { precision: 12, scale: 2 }),
        specialTerms: text("special_terms"),

        ...timestamps,
    },
    (table) => ({
        invoiceNumberIdx: uniqueIndex("invoices_invoice_number_idx").on(table.invoiceNumber),
        opportunityIdIdx: index("invoices_opportunity_id_idx").on(table.opportunityId),
        accountIdIdx: index("invoices_account_id_idx").on(table.accountId),
        paymentStatusIdx: index("invoices_payment_status_idx").on(table.paymentStatus),
    })
);

/**
 * invoice_issues — disputes / finance review findings tied to invoices.
 * Grounded in: finance review workbook + disputed invoice export.
 * All FKs nullable: issues can be raised before invoice import is complete.
 * issue_status kept as text — do not over-model to enum at MVP stage.
 */
export const invoiceIssues = pgTable(
    "invoice_issues",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
        dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
        accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),

        // Source of the issue: customer_email, finance_review, manual
        issueSource: text("issue_source"),
        issueSummary: text("issue_summary").notNull(),
        issueDetail: text("issue_detail"),
        // Flexible: open, resolved, escalated, etc. — not enum at this stage
        issueStatus: text("issue_status"),
        reportedDate: date("reported_date"),
        reportedBy: text("reported_by"),

        ...timestamps,
    },
    (table) => ({
        invoiceIdIdx: index("invoice_issues_invoice_id_idx").on(table.invoiceId),
        dealIdIdx: index("invoice_issues_deal_id_idx").on(table.dealId),
        accountIdIdx: index("invoice_issues_account_id_idx").on(table.accountId),
        issueSourceIdx: index("invoice_issues_issue_source_idx").on(table.issueSource),
    })
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type InvoiceIssue = typeof invoiceIssues.$inferSelect;
export type NewInvoiceIssue = typeof invoiceIssues.$inferInsert;

