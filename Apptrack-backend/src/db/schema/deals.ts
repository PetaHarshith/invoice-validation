import {
    pgTable,
    uuid,
    text,
    integer,
    date,
    numeric,
    boolean,
    jsonb,
    timestamp,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { dealStageEnum, readinessStatusEnum } from "./enums";
import { accounts } from "./accounts";
import { productCatalog } from "./products";

// Reusable timestamps — same pattern as original codebase
const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
};

/**
 * deals — core handoff record between sales and finance.
 * A deal is NOT the same as an invoice: billed output and sold context are stored separately.
 * Grounded in: won-opportunities export + finance review workbook columns.
 */
export const deals = pgTable(
    "deals",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        // Nullable: manual deals may not have a CRM opportunity ID yet
        opportunityId: text("opportunity_id"),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "restrict" }),

        // ── Opportunity-level fields from exports ──────────────────────────────
        opportunityName: text("opportunity_name"),
        opportunityOwner: text("opportunity_owner"),
        opportunityType: text("opportunity_type"),
        oppCreatedDate: date("opp_created_date"),
        oppCloseDate: date("opp_close_date"),
        // Preserve original CRM stage string for audit / import traceability
        oppStageRaw: text("opp_stage_raw"),

        // ── Handoff workflow stage ─────────────────────────────────────────────
        dealStage: dealStageEnum("deal_stage").notNull().default("needs_info"),
        readinessStatus: readinessStatusEnum("readiness_status").notNull().default("blocked"),

        // ── Financial summary ─────────────────────────────────────────────────
        opportunityAmountRollup: numeric("opportunity_amount_rollup", { precision: 12, scale: 2 }),
        opportunityTerm: text("opportunity_term"),
        opportunitySource: text("opportunity_source"),
        opportunityCloseReason: text("opportunity_close_reason"),
        // Kept: exists in source exports and referenced by finance review workbook
        opportunityNotes: text("opportunity_notes"),

        // ── Snapshots — so readiness logic survives later account/contact edits ──
        accountProductSnapshot: text("account_product_snapshot"),
        accountTotalSeatsSnapshot: integer("account_total_seats_snapshot"),
        primaryContactNameSnapshot: text("primary_contact_name_snapshot"),
        primaryContactTitleSnapshot: text("primary_contact_title_snapshot"),
        primaryContactLocationSnapshot: text("primary_contact_location_snapshot"),

        // ── Contract fields (grounded in PDFs + spreadsheets) ─────────────────
        contractStartDate: date("contract_start_date"),
        contractTermText: text("contract_term_text"),
        totalContractValue: numeric("total_contract_value", { precision: 12, scale: 2 }),
        contractAttached: boolean("contract_attached").default(false).notNull(),

        // ── Structured context to replace over-reliance on free text ──────────
        // PDF evidence: reps use notes for pricing / rollout detail; finance can't reconstruct from that
        pricingContext: text("pricing_context"),
        rolloutContext: text("rollout_context"),
        specialRemarks: text("special_remarks"),

        // ── Pipeline context fields (sales-side visibility only) ─────────────
        // These are CRM snapshot fields — they do NOT affect readiness logic.
        // pipeline_stage = raw CRM stage label (e.g. "Proposal/Price Quote")
        pipelineStage: text("pipeline_stage"),
        // 0–100 close probability as set by the rep in CRM
        probability: integer("probability"),
        nextStep: text("next_step"),
        // Typical values: Commit, Best Case, Pipeline, Omitted — free text, not enum
        forecastCategory: text("forecast_category"),
        campaign: text("campaign"),

        // ── Sales tracker enrichment (from Tom's Deal Tracker) ───────────────
        // These overlay CRM data with richer sales-side context.
        // discount can be a decimal fraction (0.21 = 21%) or a dollar amount — stored as-is.
        trackerDiscount: numeric("tracker_discount", { precision: 12, scale: 4 }),
        trackerYear1Price: numeric("tracker_year_1_price", { precision: 12, scale: 2 }),
        trackerNotes: text("tracker_notes"),

        // ── Readiness diagnostic fields ───────────────────────────────────────
        missingFields: jsonb("missing_fields").$type<string[]>(),
        warnings: jsonb("warnings").$type<string[]>(),
        // Grounded in Finance_Research column in disputed invoice workbook
        financeResearch: text("finance_research"),

        ...timestamps,
    },
    (table) => ({
        opportunityIdIdx: uniqueIndex("deals_opportunity_id_idx").on(table.opportunityId),
        accountIdIdx: index("deals_account_id_idx").on(table.accountId),
        dealStageIdx: index("deals_deal_stage_idx").on(table.dealStage),
        readinessStatusIdx: index("deals_readiness_status_idx").on(table.readinessStatus),
        opportunityOwnerIdx: index("deals_opportunity_owner_idx").on(table.opportunityOwner),
    })
);

/**
 * deal_line_items — normalized line-item table.
 * Grounded in: SKU1-4 columns in the finance review workbook.
 * Those columns are clearly line-item data; storing them as SKU1/SKU2/etc. was denormalized.
 * product_catalog_id is nullable: historical records may not map cleanly to current catalog.
 * Snapshot fields protect readiness logic from later catalog price/seat changes.
 */
export const dealLineItems = pgTable(
    "deal_line_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        dealId: uuid("deal_id")
            .notNull()
            .references(() => deals.id, { onDelete: "cascade" }),

        // Nullable FK — only set once the raw sku_id is matched to a catalog entry
        productCatalogId: uuid("product_catalog_id").references(
            () => productCatalog.id,
            { onDelete: "set null" }
        ),

        // Raw SKU from finance review data — kept even if catalog mapping is missing
        skuId: text("sku_id"),
        lineOrder: integer("line_order").default(1).notNull(),

        // Snapshot of product name at time of deal — survives catalog renames
        productNameSnapshot: text("product_name_snapshot"),
        quantity: integer("quantity"),
        // Snapshot of included_seats from catalog at deal time
        includedSeatsSnapshot: integer("included_seats_snapshot"),

        unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
        lineTotal: numeric("line_total", { precision: 12, scale: 2 }),
        billingFrequency: text("billing_frequency"),

        // Flexible text — grounded values: base_subscription, add_on, renewal, partial_year, pilot_rollout
        // Not hard-enum: new types emerge and existing style doesn't force enum for this
        lineType: text("line_type"),

        discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
        // Grounded in Discount_Approved column in finance review workbook
        discountApprovedText: text("discount_approved_text"),
        lineDescription: text("line_description"),

        ...timestamps,
    },
    (table) => ({
        dealIdIdx: index("deal_line_items_deal_id_idx").on(table.dealId),
        skuIdIdx: index("deal_line_items_sku_id_idx").on(table.skuId),
        productCatalogIdIdx: index("deal_line_items_product_catalog_id_idx").on(
            table.productCatalogId
        ),
    })
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;

export type DealLineItem = typeof dealLineItems.$inferSelect;
export type NewDealLineItem = typeof dealLineItems.$inferInsert;

