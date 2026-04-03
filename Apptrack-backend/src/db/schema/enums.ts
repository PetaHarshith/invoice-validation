import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Deal workflow stage.
 * "closed_won" and "ready_for_invoice" are intentionally separate:
 * a deal must pass the readiness checker before finance can invoice it.
 */
export const dealStageEnum = pgEnum("deal_stage", [
    "closed_won",
    "needs_info",
    "ready_for_invoice",
    "invoiced",
    "disputed",
]);

/**
 * Output of the readiness checker — computed from structured handoff completeness.
 * blocked  = required fields missing
 * warning  = data present but inconsistent or flagged
 * ready    = all required fields present and validated
 */
export const readinessStatusEnum = pgEnum("readiness_status", [
    "blocked",
    "warning",
    "ready",
]);

