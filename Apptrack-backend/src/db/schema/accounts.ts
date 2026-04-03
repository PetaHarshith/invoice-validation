import {
    pgTable,
    uuid,
    text,
    integer,
    date,
    boolean,
    timestamp,
    index,
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
 * accounts — canonical customer record.
 * Grounded in: active/lost customer lists + won-opportunity exports.
 * account_name is NOT given a unique constraint because duplicate account names
 * can appear across data imports from different source files.
 */
export const accounts = pgTable(
    "accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        accountName: text("account_name").notNull(),
        accountCity: text("account_city"),
        accountState: text("account_state"),
        accountIndustry: text("account_industry"),
        // Free text: "active", "churned", etc. — not enum; values vary across sources
        accountSize: text("account_size"),
        accountStatus: text("account_status"),
        accountProduct: text("account_product"),
        originalPurchaseDate: date("original_purchase_date"),
        nextRenewalDate: date("next_renewal_date"),
        accountLostDate: date("account_lost_date"),
        totalSeats: integer("total_seats"),

        ...timestamps,
    },
    (table) => ({
        accountNameIdx: index("accounts_account_name_idx").on(table.accountName),
        accountStatusIdx: index("accounts_account_status_idx").on(table.accountStatus),
    })
);

/**
 * contacts — separate contact records per account.
 * Grounded in: Opportunity_Primary_Contact, Billing_Contact_*, CRM_Contact_* columns.
 * Keeps billing vs primary vs CRM contacts distinct instead of stuffing them into the deal row.
 * Email uniqueness is NOT enforced globally — the same person can appear on multiple accounts.
 */
export const contacts = pgTable(
    "contacts",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),

        contactName: text("contact_name").notNull(),
        contactTitle: text("contact_title"),
        contactEmail: text("contact_email"),
        // Grounded in Opportunity_Contact_Location column
        contactLocation: text("contact_location"),
        // Flexible role text: primary_contact, billing_contact, crm_contact, implementation_contact
        contactRole: text("contact_role"),

        isPrimaryContact: boolean("is_primary_contact").default(false).notNull(),
        isBillingContact: boolean("is_billing_contact").default(false).notNull(),

        ...timestamps,
    },
    (table) => ({
        accountIdIdx: index("contacts_account_id_idx").on(table.accountId),
        contactNameIdx: index("contacts_contact_name_idx").on(table.contactName),
    })
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

