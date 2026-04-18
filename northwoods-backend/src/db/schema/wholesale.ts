import {
    pgTable,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
};

/**
 * branches — physical branch locations for wholesale distribution customers.
 *
 * Each branch belongs to an account (the parent company) and may have:
 *   - a different billing entity from the parent (e.g. "GPD Missouri LLC")
 *   - its own billing contacts (contacts.branch_id FK)
 *   - its own line items (deal_line_items.branch_id FK)
 *
 * Backward compatible: existing deals with no branches use the account-level
 * contacts and line items as before. Branch logic is additive.
 *
 * companyIdExternal  — preserves "WD-001" from the import file
 * branchIdExternal   — preserves "BR-001-01" for cross-referencing engagement logs
 */
export const branches = pgTable(
    "branches",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        // Every branch belongs to one account (the parent company)
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),

        // External IDs from the import file — kept for traceability and re-import idempotency
        companyIdExternal: text("company_id_external"),       // e.g. "WD-001"
        branchIdExternal:  text("branch_id_external"),        // e.g. "BR-001-01"

        // Branch identity
        name:       text("name").notNull(),                   // Branch_Name
        branchType: text("branch_type"),                      // HQ / Regional DC / Local Branch
        branchCity:    text("branch_city"),
        branchState:   text("branch_state"),
        branchCountry: text("branch_country"),

        // Billing entity — may differ from the parent company and from the branch name.
        // This is the legal name that will appear on invoices for this branch.
        billingEntityName: text("billing_entity_name"),       // Billing_Entity
        billingStateProv:  text("billing_state_prov"),        // Billing_State_Prov
        billingCountry:    text("billing_country"),           // Billing_Country

        // Inherited from parent company at import time — useful for readiness context
        procurementModel: text("procurement_model"),          // Centralized / Decentralized / Hybrid
        erpSystem:        text("erp_system"),                 // e.g. Prophet 21, Epicor, SAP

        // Sizing / qualification data
        estAnnualSpend: text("est_annual_spend"),             // kept as text: "$2.1M", "C$940K"
        skuCountEst:    integer("sku_count_est"),
        branchStatus:   text("branch_status"),                // Active / Seasonal / Planned

        // Y from the import → true; N or missing → false
        needsReview: boolean("needs_review").default(false),

        notes: text("notes"),

        ...timestamps,
    },
    (table) => ({
        accountIdIdx:       index("branches_account_id_idx").on(table.accountId),
        branchIdExternalIdx: uniqueIndex("branches_branch_id_external_idx").on(table.branchIdExternal),
        companyIdExternalIdx: index("branches_company_id_external_idx").on(table.companyIdExternal),
    })
);

export type Branch    = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
