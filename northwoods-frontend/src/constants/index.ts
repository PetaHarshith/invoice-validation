// Deal workflow statuses — grounded in the sales-to-finance handoff process
export const DEAL_STATUSES = [
    'closed_won',
    'needs_info',
    'ready_for_invoice',
    'invoiced',
    'disputed',
] as const;

export const DEAL_STATUS_LABELS: Record<string, string> = {
    closed_won: 'Closed Won',
    needs_info: 'Needs Info',
    ready_for_invoice: 'Ready for Invoice',
    invoiced: 'Invoiced',
    disputed: 'Disputed',
};

export const DEAL_STATUS_OPTIONS = DEAL_STATUSES.map((status) => ({
    value: status,
    label: DEAL_STATUS_LABELS[status],
}));

// Readiness statuses — result of the readiness checker utility
export const READINESS_STATUSES = ['ready', 'warning', 'blocked'] as const;

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;