import {
    pgTable,
    pgEnum,
    integer,
    varchar,
    text,
    timestamp,
    date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// reusable timestamps
const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
};

// status enum
export const applicationStatusEnum = pgEnum("application_status", [
    "Applied",
    "OA",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
]);

// users table
export const users = pgTable("users", {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),

    authUserId: varchar("auth_user_id", { length: 255 }).notNull().unique(),

    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 120 }),

    ...timestamps,
});

// applications table
export const applications = pgTable("applications", {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),

    userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),

    company: varchar("company", { length: 120 }).notNull(),
    position: varchar("position", { length: 150 }).notNull(),

    status: applicationStatusEnum("status").notNull().default("Applied"),
    dateApplied: date("date_applied"),

    jobUrl: text("job_url"),
    notes: text("notes"),

    ...timestamps,
});

export const usersRelations = relations(users, ({ many }) => ({
    applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
    user: one(users, {
        fields: [applications.userId],
        references: [users.id],
    }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;