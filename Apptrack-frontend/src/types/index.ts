// User types
export type User = {
    id: number;
    authUserId: string;
    email: string;
    name: string | null;
    createdAt: string;
    updatedAt: string;
};

// Application status enum
export type ApplicationStatus = 'Applied' | 'OA' | 'Interview' | 'Offer' | 'Rejected' | 'Withdrawn';

// Application type
export type Application = {
    id: number;
    userId: number;
    company: string;
    position: string;
    status: ApplicationStatus;
    dateApplied: string | null;
    jobUrl: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
};

// API Response types for Refine data provider
export type ListResponse<T = unknown> = {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

export type GetOneResponse<T = unknown> = {
    data: T;
};

export type CreateResponse<T = unknown> = {
    data: T;
};

export type UpdateResponse<T = unknown> = {
    data: T;
};

export type DeleteResponse<T = unknown> = {
    data: T;
};