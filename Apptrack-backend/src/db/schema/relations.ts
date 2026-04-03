import { relations } from "drizzle-orm";
import { accounts, contacts } from "./accounts";
import { productCatalog } from "./products";
import { deals, dealLineItems } from "./deals";
import { invoices, invoiceIssues } from "./invoices";
import { branches } from "./wholesale";

export const accountsRelations = relations(accounts, ({ many }) => ({
    contacts: many(contacts),
    deals: many(deals),
    invoices: many(invoices),
    invoiceIssues: many(invoiceIssues),
    branches: many(branches),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
    account: one(accounts, {
        fields: [contacts.accountId],
        references: [accounts.id],
    }),
    // Optional: set when this contact belongs to a specific branch (wholesale customers)
    branch: one(branches, {
        fields: [contacts.branchId],
        references: [branches.id],
    }),
}));

// ── Wholesale branch relations ───────────────────────────────────────────────

export const branchesRelations = relations(branches, ({ one, many }) => ({
    account: one(accounts, {
        fields: [branches.accountId],
        references: [accounts.id],
    }),
    contacts:  many(contacts),
    lineItems: many(dealLineItems),
}));

export const productCatalogRelations = relations(productCatalog, ({ many }) => ({
    dealLineItems: many(dealLineItems),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
    account: one(accounts, {
        fields: [deals.accountId],
        references: [accounts.id],
    }),
    lineItems: many(dealLineItems),
    invoices: many(invoices),
    invoiceIssues: many(invoiceIssues),
}));

export const dealLineItemsRelations = relations(dealLineItems, ({ one }) => ({
    deal: one(deals, {
        fields: [dealLineItems.dealId],
        references: [deals.id],
    }),
    // Optional: only set when raw sku_id has been matched to product catalog
    productCatalog: one(productCatalog, {
        fields: [dealLineItems.productCatalogId],
        references: [productCatalog.id],
    }),
    // Optional: set when this line item is attributed to a specific branch (wholesale)
    branch: one(branches, {
        fields: [dealLineItems.branchId],
        references: [branches.id],
    }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
    deal: one(deals, {
        fields: [invoices.dealId],
        references: [deals.id],
    }),
    account: one(accounts, {
        fields: [invoices.accountId],
        references: [accounts.id],
    }),
    issues: many(invoiceIssues),
}));

export const invoiceIssuesRelations = relations(invoiceIssues, ({ one }) => ({
    invoice: one(invoices, {
        fields: [invoiceIssues.invoiceId],
        references: [invoices.id],
    }),
    deal: one(deals, {
        fields: [invoiceIssues.dealId],
        references: [deals.id],
    }),
    account: one(accounts, {
        fields: [invoiceIssues.accountId],
        references: [accounts.id],
    }),
}));

