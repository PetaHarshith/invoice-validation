import {
    pgTable,
    uuid,
    text,
    integer,
    numeric,
    timestamp,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";

// Reusable timestamps — same pattern as original codebase
const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
};

/**
 * product_catalog — canonical SKU / product table.
 * Grounded in both product catalog spreadsheets.
 * "Dependancies" typo in source files is normalized to "dependencies".
 * discount_approval kept as text — values vary ("Manager Approval", "VP Required", etc.)
 */
export const productCatalog = pgTable(
    "product_catalog",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        // SKU is the unique identifier from the product catalog workbook
        skuId: text("sku_id").notNull(),
        productName: text("product_name").notNull(),
        productCategory: text("product_category"),
        includedSeats: integer("included_seats"),
        basePriceUsd: numeric("base_price_usd", { precision: 12, scale: 2 }),
        billingFrequency: text("billing_frequency"),
        // Mapped from "Type" column in product catalog
        productType: text("product_type"),
        productDescription: text("product_description"),
        recommendations: text("recommendations"),
        // Normalized from source typo "Dependancies"
        dependencies: text("dependencies"),
        restrictions: text("restrictions"),
        // Approval requirement text, e.g. "Manager Approval", "VP Required"
        discountApproval: text("discount_approval"),

        ...timestamps,
    },
    (table) => ({
        skuIdIdx: uniqueIndex("product_catalog_sku_id_idx").on(table.skuId),
        productNameIdx: index("product_catalog_product_name_idx").on(table.productName),
    })
);

export type ProductCatalog = typeof productCatalog.$inferSelect;
export type NewProductCatalog = typeof productCatalog.$inferInsert;

