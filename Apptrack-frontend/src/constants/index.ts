export const APPLICATION_STATUSES = ['Applied', 'OA', 'Interview', 'Offer', 'Rejected', 'Withdrawn'] as const;

export const APPLICATION_STATUS_OPTIONS = APPLICATION_STATUSES.map((status) => ({
    value: status,
    label: status,
}));

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;