import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router';
import { ListView } from "@/components/refine-ui/views/list-view.tsx";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb.tsx";
import { Search, ChevronDown, ArrowUp, ArrowDown, FileCheck, AlertTriangle, XCircle, CheckCircle2, Clock, ReceiptText, Eye } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { DEAL_STATUS_LABELS, DEAL_STATUS_OPTIONS, BACKEND_URL } from "@/constants";
import { CreateButton } from "@/components/refine-ui/buttons/create.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DataTable } from "@/components/refine-ui/data-table/data-table.tsx";
import { useTable } from "@refinedev/react-table";
import { Deal, DealStatus, ReadinessStatus } from "@/types";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";

// Status colours — one per deal workflow step
const statusColors: Record<DealStatus, string> = {
    closed_won: 'var(--chart-2)',
    needs_info: 'var(--chart-4)',
    ready_for_invoice: '#22c55e',
    invoiced: 'var(--chart-1)',
    disputed: 'var(--chart-3)',
};

const statusIcons: Record<DealStatus, React.ReactNode> = {
    closed_won: <FileCheck className="h-3 w-3" />,
    needs_info: <Clock className="h-3 w-3" />,
    ready_for_invoice: <CheckCircle2 className="h-3 w-3" />,
    invoiced: <ReceiptText className="h-3 w-3" />,
    disputed: <XCircle className="h-3 w-3" />,
};

// Readiness badge colours
const readinessColors: Record<ReadinessStatus, string> = {
    ready: '#22c55e',
    warning: '#f59e0b',
    blocked: 'var(--chart-3)',
};

const readinessIcons: Record<ReadinessStatus, React.ReactNode> = {
    ready: <CheckCircle2 className="h-3 w-3" />,
    warning: <AlertTriangle className="h-3 w-3" />,
    blocked: <XCircle className="h-3 w-3" />,
};

// Inline status badge with dropdown for quick workflow transitions
const StatusBadge = ({
    status,
    dealId,
    onStatusChange,
}: {
    status: DealStatus;
    dealId: string;
    onStatusChange: (id: string, newStatus: DealStatus) => void;
}) => {
    const color = statusColors[status];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button onClick={(e) => e.stopPropagation()} className="focus:outline-none">
                    <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-muted/50 transition-colors gap-1"
                        style={{ borderColor: color, color }}
                    >
                        {statusIcons[status]}
                        {DEAL_STATUS_LABELS[status]}
                        <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
                    </Badge>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
                {DEAL_STATUS_OPTIONS.map((s) => (
                    <DropdownMenuItem
                        key={s.value}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (s.value !== status) onStatusChange(dealId, s.value as DealStatus);
                        }}
                        className="flex items-center gap-2 cursor-pointer"
                        style={status === s.value ? { backgroundColor: 'var(--muted)' } : undefined}
                    >
                        <span style={{ color: statusColors[s.value as DealStatus] }}>
                            {statusIcons[s.value as DealStatus]}
                        </span>
                        <span>{s.label}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const DealsList = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');

    // Optimistic stage overrides — prevents row reordering on update (id is now UUID string)
    const [statusOverrides, setStatusOverrides] = useState<Record<string, DealStatus>>({});

    const handleStatusChange = useCallback(async (dealId: string, newStatus: DealStatus) => {
        setStatusOverrides(prev => ({ ...prev, [dealId]: newStatus }));
        try {
            const response = await fetch(`${BACKEND_URL}/deals/${dealId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dealStage: newStatus }),
            });
            if (!response.ok) {
                // Revert optimistic update
                setStatusOverrides(prev => { const next = { ...prev }; delete next[dealId]; return next; });
                const errBody = await response.json().catch(() => ({}));
                if (response.status === 400 && errBody.missingFields?.length) {
                    // Stage-gate rejection — show exactly what's missing
                    toast.error(
                        `Cannot move to "${DEAL_STATUS_LABELS[newStatus]}": ${errBody.missingFields.length} blocking issue(s). Open the deal to see details.`,
                        { duration: 6000 }
                    );
                } else {
                    toast.error(errBody.error ?? 'Failed to update stage');
                }
                return;
            }
            toast.success(`Status updated to ${DEAL_STATUS_LABELS[newStatus]}`);
        } catch {
            setStatusOverrides(prev => { const next = { ...prev }; delete next[dealId]; return next; });
            toast.error('Failed to update status — network error');
        }
    }, []);

    // Skip the very first render — useTable already fetches with no filters on mount.
    // Without this, calling setFilters([], 'replace') on mount races with the
    // initial fetch and can leave the table empty when "All Statuses" is later selected.
    const didMount = useRef(false);

    const dealTable = useTable<Deal>({
        columns: useMemo<ColumnDef<Deal>[]>(() => [
            {
                id: 'accountName',
                accessorKey: 'accountName',
                size: 180,
                header: () => <p className="column-title">Company</p>,
                cell: ({ getValue }) => <span className="font-medium text-foreground">{getValue<string | null>() ?? '—'}</span>,
            },
            {
                id: 'opportunityOwner',
                accessorKey: 'opportunityOwner',
                size: 150,
                header: () => <p className="column-title">Owner</p>,
                cell: ({ getValue }) => <span className="text-foreground">{getValue<string | null>() ?? '—'}</span>,
            },
            {
                id: 'oppCloseDate',
                accessorKey: 'oppCloseDate',
                size: 140,
                header: () => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 focus:outline-none hover:text-foreground transition-colors">
                                <p className="column-title">Close Date</p>
                                {dateSort === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => setDateSort('desc')} className={dateSort === 'desc' ? 'bg-muted' : ''}>
                                <ArrowDown className="h-4 w-4 mr-2" /> Newest First
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDateSort('asc')} className={dateSort === 'asc' ? 'bg-muted' : ''}>
                                <ArrowUp className="h-4 w-4 mr-2" /> Oldest First
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
                cell: ({ getValue }) => {
                    const d = getValue<string | null>();
                    return d ? new Date(d).toLocaleDateString() : '—';
                },
            },
            {
                id: 'dealStage',
                accessorKey: 'dealStage',
                size: 180,
                header: () => <p className="column-title">Status</p>,
                cell: ({ row }) => {
                    const displayStatus = statusOverrides[row.original.id] ?? row.original.dealStage;
                    return (
                        <StatusBadge
                            status={displayStatus}
                            dealId={row.original.id}
                            onStatusChange={handleStatusChange}
                        />
                    );
                },
            },
            {
                id: 'readinessStatus',
                accessorKey: 'readinessStatus',
                size: 160,
                header: () => <p className="column-title">Readiness</p>,
                cell: ({ getValue }) => {
                    const r = getValue<ReadinessStatus | null>();
                    if (!r) return <span className="text-muted-foreground text-sm">—</span>;
                    const color = readinessColors[r];
                    return (
                        <Badge variant="outline" className="gap-1 capitalize" style={{ borderColor: color, color }}>
                            {readinessIcons[r]}
                            {r}
                        </Badge>
                    );
                },
            },
            {
                id: 'issueCount',
                // Derived column — not a direct DB field
                accessorFn: (row) => (row.missingFields?.length ?? 0) + (row.warnings?.length ?? 0),
                size: 100,
                header: () => <p className="column-title">Issues</p>,
                cell: ({ getValue }) => {
                    const count = getValue<number>();
                    return count > 0
                        ? <span className="text-destructive font-medium text-sm">{count}</span>
                        : <span className="text-muted-foreground text-sm">0</span>;
                },
            },
            {
                id: 'updatedAt',
                accessorKey: 'updatedAt',
                size: 140,
                header: () => <p className="column-title">Last Updated</p>,
                cell: ({ getValue }) => {
                    const d = getValue<string | null>();
                    return d ? new Date(d).toLocaleDateString() : '—';
                },
            },
            {
                id: 'actions',
                size: 80,
                header: () => <p className="column-title">Detail</p>,
                cell: ({ row }) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); navigate(`/deals/${row.original.id}`); }}
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                    </Button>
                ),
            },
            // eslint-disable-next-line react-hooks/exhaustive-deps
        ], [statusOverrides, handleStatusChange, dateSort, navigate]),

        refineCoreProps: {
            resource: 'deals',
            pagination: { pageSize: 10, mode: 'server' },
            sorters: { permanent: [{ field: 'oppCloseDate', order: dateSort }] },
        },
    });

    // Reactively push search + status filters whenever either value changes.
    // We skip the initial mount because useTable already fetches with empty filters.
    const { setFilters } = dealTable.refineCore;
    useEffect(() => {
        if (!didMount.current) {
            didMount.current = true;
            return;
        }
        const filters = [];
        if (searchQuery.trim()) {
            filters.push({ field: 'accountName', operator: 'contains' as const, value: searchQuery.trim() });
        }
        if (selectedStatus !== 'all') {
            filters.push({ field: 'stage', operator: 'eq' as const, value: selectedStatus });
        }
        setFilters(filters, 'replace');
    }, [searchQuery, selectedStatus]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <ListView>
            <Breadcrumb />
            <h1 className="page-title">Deals</h1>

            <div className="intro-row">
                <p>Review closed deals and confirm invoice readiness before billing.</p>

                <div className="actions-row">
                    <div className="search-field">
                        <Search className="search-icon" />
                        <Input
                            type="text"
                            placeholder="Search by company"
                            className="pl-10 w-full"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by status..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {DEAL_STATUS_OPTIONS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <CreateButton />
                    </div>
                </div>
            </div>

            <DataTable table={dealTable} />
        </ListView>
    );
};

export default DealsList;

