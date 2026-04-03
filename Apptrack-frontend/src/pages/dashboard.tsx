import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
    AlertTriangle, CheckCircle2, XCircle,
    ArrowRight, Clock, ReceiptText,
} from 'lucide-react'
import { BACKEND_URL } from '@/constants'

// ── Types ──────────────────────────────────────────────────────────────────────
type ActionDeal = {
    id: string
    opportunityName: string | null
    accountName: string | null
    opportunityOwner: string | null
    totalContractValue: string | null
    opportunityAmountRollup: string | null
    oppCloseDate: string | null
    missingFields: string[] | null
    updatedAt: string
}

type OverdueInvoice = {
    id: string
    invoiceNumber: string
    dueDate: string | null
    invoiceAmount: string | null
    paymentStatus: string | null
    billingContactName: string | null
    opportunityOwner: string | null
    dealId: string | null
    accountName: string | null
}

type ActionCenter = {
    needsInfo: ActionDeal[]
    readyForInvoice: ActionDeal[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysAgo(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function daysOverdue(dateStr: string): number {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function fmt$(raw: string | null): string {
    const n = parseFloat(raw ?? '0')
    if (isNaN(n)) return '—'
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
    return `$${n.toFixed(0)}`
}

const Dashboard = () => {
    const navigate = useNavigate()
    const [actionCenter, setActionCenter] = useState<ActionCenter | null>(null)
    const [overdue, setOverdue] = useState<OverdueInvoice[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [acRes, ovRes] = await Promise.all([
                    fetch(`${BACKEND_URL}/deals/action-center`),
                    fetch(`${BACKEND_URL}/invoices/overdue`),
                ])
                if (!acRes.ok) throw new Error('Failed to fetch action center data')
                const [acData, ovData] = await Promise.all([acRes.json(), ovRes.json()])
                setActionCenter(acData)
                setOverdue(ovData.data ?? [])
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred')
            } finally {
                setLoading(false)
            }
        }
        fetchAll()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        )
    }

    if (error || !actionCenter) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <p className="text-destructive">{error ?? 'No data'}</p>
            </div>
        )
    }

    const { needsInfo, readyForInvoice } = actionCenter

    return (
        <div className="flex flex-col -mx-2 -mt-4 md:-mx-4 md:-mt-4 lg:-mx-6 lg:-mt-6 min-h-[calc(100vh-3.5rem)]">
            {/* ── Hero Header ─────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-7 flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Action Center</h1>
                    <p className="text-slate-400 text-sm mt-0.5">Items that need your attention right now</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-amber-300 font-semibold text-lg tabular-nums">{needsInfo.length}</span>
                        <span className="text-amber-400/70 text-xs uppercase tracking-wide">stale</span>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-4 py-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-300 font-semibold text-lg tabular-nums">{readyForInvoice.length}</span>
                        <span className="text-emerald-400/70 text-xs uppercase tracking-wide">ready</span>
                    </div>
                    <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 rounded-lg px-4 py-2">
                        <XCircle className="h-4 w-4 text-red-400" />
                        <span className="text-red-300 font-semibold text-lg tabular-nums">{overdue.length}</span>
                        <span className="text-red-400/70 text-xs uppercase tracking-wide">overdue</span>
                    </div>
                </div>
            </div>

            {/* ── 3-column action grid ────────────────────────────────────────── */}
            <div className="flex-1 grid grid-cols-3 divide-x border-t overflow-hidden" style={{ minHeight: 0 }}>

                {/* ── Col 1: Stale Needs Info ───────────────────────────────────── */}
                <div className="flex flex-col min-h-0">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 px-5 py-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
                                <AlertTriangle className="h-4.5 w-4.5 text-white h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm leading-tight">Needs Info</p>
                                <p className="text-amber-700 dark:text-amber-400 text-[11px]">Stale — longest waiting first</p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/deals?stage=needs_info')}
                            className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-medium transition-colors"
                        >
                            All <ArrowRight className="h-3 w-3" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {needsInfo.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
                                <CheckCircle2 className="h-6 w-6 text-amber-400" />
                                <p className="text-sm">Queue is clear!</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60">
                                {needsInfo.map(deal => (
                                    <div
                                        key={deal.id}
                                        className="px-5 py-3.5 hover:bg-amber-50/60 dark:hover:bg-amber-950/10 cursor-pointer transition-colors group"
                                        onClick={() => navigate(`/deals/${deal.id}`)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-sm font-medium text-foreground truncate leading-snug group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                                                {deal.opportunityName ?? '—'}
                                            </p>
                                            <span className="text-sm font-semibold tabular-nums text-foreground flex-shrink-0">
                                                {fmt$(deal.totalContractValue ?? deal.opportunityAmountRollup)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                            {deal.accountName ?? ''}{deal.opportunityOwner ? ` · ${deal.opportunityOwner}` : ''}
                                        </p>
                                        <div className="flex items-center justify-between mt-2 gap-2">
                                            <div className="flex flex-wrap gap-1">
                                                {(deal.missingFields ?? []).slice(0, 2).map((f, i) => (
                                                    <span key={i} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-medium">
                                                        {f.split(' — ')[0]}
                                                    </span>
                                                ))}
                                                {(deal.missingFields?.length ?? 0) > 2 && (
                                                    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                                        +{(deal.missingFields?.length ?? 0) - 2}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                                                <Clock className="h-2.5 w-2.5" />
                                                {daysAgo(deal.updatedAt)}d ago
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Col 2: Ready for Invoice ──────────────────────────────────── */}
                <div className="flex flex-col min-h-0">
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200 dark:border-emerald-800 px-5 py-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm">
                                <CheckCircle2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-sm leading-tight">Ready for Invoice</p>
                                <p className="text-emerald-700 dark:text-emerald-400 text-[11px]">All fields complete — send to finance</p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/deals?stage=ready_for_invoice')}
                            className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 font-medium transition-colors"
                        >
                            All <ArrowRight className="h-3 w-3" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {readyForInvoice.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
                                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                                <p className="text-sm">Queue is clear!</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60">
                                {readyForInvoice.map(deal => (
                                    <div
                                        key={deal.id}
                                        className="px-5 py-3.5 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/10 cursor-pointer transition-colors group"
                                        onClick={() => navigate(`/deals/${deal.id}`)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-sm font-medium text-foreground truncate leading-snug group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                                                {deal.opportunityName ?? '—'}
                                            </p>
                                            <span className="text-sm font-semibold tabular-nums text-foreground flex-shrink-0">
                                                {fmt$(deal.totalContractValue ?? deal.opportunityAmountRollup)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                            {deal.accountName ?? ''}{deal.opportunityOwner ? ` · ${deal.opportunityOwner}` : ''}
                                        </p>
                                        <div className="flex items-center justify-between mt-2">
                                            {deal.oppCloseDate ? (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-medium">
                                                    Closed {deal.oppCloseDate}
                                                </span>
                                            ) : <span />}
                                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                <Clock className="h-2.5 w-2.5" />
                                                {daysAgo(deal.updatedAt)}d waiting
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Col 3: Overdue Invoices ───────────────────────────────────── */}
                <div className="flex flex-col min-h-0">
                    <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-800 px-5 py-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-red-500 flex items-center justify-center shadow-sm">
                                <XCircle className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-semibold text-red-900 dark:text-red-200 text-sm leading-tight">Overdue Invoices</p>
                                <p className="text-red-700 dark:text-red-400 text-[11px]">Past due date and unpaid</p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/invoices')}
                            className="flex items-center gap-1 text-[11px] text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 font-medium transition-colors"
                        >
                            All <ArrowRight className="h-3 w-3" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {overdue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
                                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                                <p className="text-sm">All payments up to date!</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60">
                                {overdue.map(inv => (
                                    <div
                                        key={inv.id}
                                        className="px-5 py-3.5 hover:bg-red-50/60 dark:hover:bg-red-950/10 cursor-pointer transition-colors group"
                                        onClick={() => inv.dealId && navigate(`/deals/${inv.dealId}`)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <ReceiptText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                <p className="text-sm font-medium truncate group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors">
                                                    {inv.invoiceNumber}
                                                </p>
                                            </div>
                                            <span className="text-sm font-semibold tabular-nums text-foreground flex-shrink-0">
                                                {fmt$(inv.invoiceAmount)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                            {inv.accountName ?? '—'}{inv.opportunityOwner ? ` · ${inv.opportunityOwner}` : ''}
                                        </p>
                                        <div className="flex items-center justify-between mt-2">
                                            {inv.billingContactName ? (
                                                <span className="text-[10px] text-muted-foreground truncate">{inv.billingContactName}</span>
                                            ) : <span />}
                                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-semibold flex-shrink-0">
                                                {inv.dueDate ? `${daysOverdue(inv.dueDate)}d overdue` : 'overdue'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}

export default Dashboard
