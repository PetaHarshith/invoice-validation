import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { ListView } from "@/components/refine-ui/views/list-view.tsx";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb.tsx";
import { Search, Send, FileText, Briefcase, Award, XCircle, Clock, ChevronDown, X, Pencil, Check, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { APPLICATION_STATUS_OPTIONS, APPLICATION_STATUSES, BACKEND_URL } from "@/constants";
import { CreateButton } from "@/components/refine-ui/buttons/create.tsx";
import { DataTable } from "@/components/refine-ui/data-table/data-table.tsx";
import { useTable } from "@refinedev/react-table";
import { Application, ApplicationStatus } from "@/types";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

// Status colors matching dashboard (using CSS variables)
const statusColors: Record<ApplicationStatus, string> = {
    'Applied': 'var(--chart-1)',
    'OA': 'var(--chart-4)',
    'Interview': 'var(--chart-2)',
    'Offer': '#22c55e',
    'Rejected': 'var(--chart-3)',
    'Withdrawn': 'var(--chart-5)'
};

// Status icons matching dashboard
const statusIcons: Record<ApplicationStatus, React.ReactNode> = {
    'Applied': <Send className="h-3 w-3" />,
    'OA': <FileText className="h-3 w-3" />,
    'Interview': <Briefcase className="h-3 w-3" />,
    'Offer': <Award className="h-3 w-3" />,
    'Rejected': <XCircle className="h-3 w-3" />,
    'Withdrawn': <Clock className="h-3 w-3" />
};

// Status Badge Component with Dropdown
const StatusBadge = ({
    status,
    applicationId,
    onStatusChange
}: {
    status: ApplicationStatus,
    applicationId: number,
    onStatusChange: (id: number, newStatus: ApplicationStatus) => void
}) => {
    const color = statusColors[status];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    onClick={(e) => e.stopPropagation()}
                    className="focus:outline-none"
                >
                    <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-muted/50 transition-colors gap-1"
                        style={{ borderColor: color, color: color }}
                    >
                        {statusIcons[status]}
                        {status}
                        <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
                    </Badge>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
                {APPLICATION_STATUSES.map((s) => (
                    <DropdownMenuItem
                        key={s}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (s !== status) {
                                onStatusChange(applicationId, s);
                            }
                        }}
                        className="flex items-center gap-2 cursor-pointer"
                        style={status === s ? { backgroundColor: 'var(--muted)' } : undefined}
                    >
                        <span style={{ color: statusColors[s] }}>{statusIcons[s]}</span>
                        <span>{s}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

// Editable Notes Cell Component
const EditableNotesCell = ({
    notes,
    applicationId,
    onNotesChange
}: {
    notes: string | null,
    applicationId: number,
    onNotesChange: (id: number, newNotes: string) => void
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(notes || '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        onNotesChange(applicationId, editValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditValue(notes || '');
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    if (isEditing) {
        return (
            <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                <Textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] text-sm resize-none"
                    placeholder="Add notes..."
                />
                <div className="flex gap-1 justify-end">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                        className="h-6 px-2"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                    <Button
                        size="sm"
                        variant="default"
                        onClick={handleSave}
                        className="h-6 px-2"
                    >
                        <Check className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 min-h-[28px]"
            onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
            }}
        >
            <span className="truncate line-clamp-2 flex-1">
                {notes || <span className="text-muted-foreground italic">Click to add notes</span>}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
    );
};

const ApplicationsList = () => {

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc'); // desc = newest, asc = oldest

    // Local state for optimistic status updates (prevents row reordering)
    const [statusOverrides, setStatusOverrides] = useState<Record<number, ApplicationStatus>>({});
    // Local state for optimistic notes updates
    const [notesOverrides, setNotesOverrides] = useState<Record<number, string>>({});

    // Filter by status
    const statusFilters = selectedStatus === "all" ? [] : [
        { field: "status", operator: "eq" as const, value: selectedStatus },
    ];

    // Search by company name
    const searchFilters = searchQuery ? [
        { field: 'company', operator: "contains" as const, value: searchQuery },
    ] : [];

    // Handle status change - optimistic update (no refetch to prevent row movement)
    const handleStatusChange = useCallback(async (applicationId: number, newStatus: ApplicationStatus) => {
        // Optimistic update - immediately update UI
        setStatusOverrides(prev => ({ ...prev, [applicationId]: newStatus }));

        try {
            const response = await fetch(`${BACKEND_URL}/applications/${applicationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) {
                // Revert optimistic update on error
                setStatusOverrides(prev => {
                    const next = { ...prev };
                    delete next[applicationId];
                    return next;
                });
                throw new Error('Failed to update status');
            }

            toast.success(`Status updated to ${newStatus}`);
        } catch (error) {
            console.error('Failed to update status:', error);
            toast.error('Failed to update status');
        }
    }, []);

    // Handle notes change - optimistic update
    const handleNotesChange = useCallback(async (applicationId: number, newNotes: string) => {
        // Optimistic update - immediately update UI
        setNotesOverrides(prev => ({ ...prev, [applicationId]: newNotes }));

        try {
            const response = await fetch(`${BACKEND_URL}/applications/${applicationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ notes: newNotes }),
            });

            if (!response.ok) {
                // Revert optimistic update on error
                setNotesOverrides(prev => {
                    const next = { ...prev };
                    delete next[applicationId];
                    return next;
                });
                throw new Error('Failed to update notes');
            }

            toast.success('Notes updated');
        } catch (error) {
            console.error('Failed to update notes:', error);
            toast.error('Failed to update notes');
        }
    }, []);

    const applicationTable = useTable<Application>({
        columns: useMemo<ColumnDef<Application>[]>(() => [
            {
                id: 'company',
                accessorKey: 'company',
                size: 150,
                header: () => <p className="column-title">Company</p>,
                cell: ({ getValue }) => <span className="text-foreground font-medium">{getValue<string>()}</span>,
                filterFn: 'includesString'
            },
            {
                id: 'position',
                accessorKey: 'position',
                size: 200,
                header: () => <p className="column-title">Position</p>,
                cell: ({ getValue }) => <span className="text-foreground">{getValue<string>()}</span>,
            },
            {
                id: 'status',
                accessorKey: 'status',
                size: 160,
                header: () => <p className="column-title">Status</p>,
                cell: ({ row }) => {
                    // Use optimistic status if available, otherwise use original
                    const displayStatus = statusOverrides[row.original.id] || row.original.status;
                    return (
                        <StatusBadge
                            status={displayStatus}
                            applicationId={row.original.id}
                            onStatusChange={handleStatusChange}
                        />
                    );
                },
            },
            {
                id: 'dateApplied',
                accessorKey: 'dateApplied',
                size: 160,
                header: () => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 focus:outline-none hover:text-foreground transition-colors">
                                <p className="column-title">Date Applied</p>
                                {dateSort === 'desc' ? (
                                    <ArrowDown className="h-3 w-3" />
                                ) : (
                                    <ArrowUp className="h-3 w-3" />
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem
                                onClick={() => setDateSort('desc')}
                                className={dateSort === 'desc' ? 'bg-muted' : ''}
                            >
                                <ArrowDown className="h-4 w-4 mr-2" />
                                Newest First
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDateSort('asc')}
                                className={dateSort === 'asc' ? 'bg-muted' : ''}
                            >
                                <ArrowUp className="h-4 w-4 mr-2" />
                                Oldest First
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
                cell: ({ getValue }) => {
                    const date = getValue<string | null>();
                    return date ? new Date(date).toLocaleDateString() : '-';
                },
            },
            {
                id: 'notes',
                accessorKey: 'notes',
                size: 250,
                header: () => <p className="column-title">Notes</p>,
                cell: ({ row }) => {
                    // Use optimistic notes if available, otherwise use original
                    const displayNotes = notesOverrides[row.original.id] ?? row.original.notes;
                    return (
                        <EditableNotesCell
                            notes={displayNotes}
                            applicationId={row.original.id}
                            onNotesChange={handleNotesChange}
                        />
                    );
                },
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        ], [statusOverrides, handleStatusChange, notesOverrides, handleNotesChange, dateSort]),

        refineCoreProps: {
            resource: 'applications',
            pagination: { pageSize: 10, mode: 'server' },
            filters: {
                permanent: [...statusFilters, ...searchFilters],
            },
            sorters: {
                permanent: [
                    { field: 'dateApplied', order: dateSort }
                ]
            },
        }
    });

    return (
        <ListView>
            <Breadcrumb />
            <h1 className="page-title">Applications</h1>

            <div className="intro-row">
                <p>Track and manage your job applications in one place.</p>

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
                                <SelectItem value={"all"}>
                                    All Status
                                </SelectItem>
                                {APPLICATION_STATUS_OPTIONS.map(status => (
                                    <SelectItem key={status.value} value={status.value}>
                                        {status.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <CreateButton />
                    </div>
                </div>
            </div>

            <DataTable table={applicationTable} />
        </ListView>
    )
}
export default ApplicationsList
