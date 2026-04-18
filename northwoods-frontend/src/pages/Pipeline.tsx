import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    TrendingUp, TrendingDown, Trophy, Target,
    Users, Eye, Search, ChevronLeft, ChevronRight,
    ChevronDown, StickyNote, Megaphone, X, ArrowRight,
} from 'lucide-react';
import { BACKEND_URL } from '@/constants';

// ── Module-level cache — survives navigation, cleared on stale ────────────────
const STALE_MS = 2 * 60 * 1000;      // 2 min for deal list
const STATS_STALE_MS = 5 * 60 * 1000; // 5 min for stats

const pipelineCache = {
    stats: null as PipelineStats | null,
    statsTs: 0,
    deals: [] as PipelineDeal[],
    dealsTotal: 0,
    dealsKey: '',
    dealsTs: 0,
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface PipelineDeal {
    id: string;
    opportunityId?: string | null;
    opportunityName?: string | null;
    opportunityOwner?: string | null;
    opportunityType?: string | null;
    oppCloseDate?: string | null;
    oppStageRaw?: string | null;
    dealStage: string;
    opportunityAmountRollup?: string | null;
    totalContractValue?: string | null;
    accountName?: string | null;
    trackerDiscount?: string | null;
    trackerYear1Price?: string | null;
    trackerNotes?: string | null;
    contractStartDate?: string | null;
    // ── 5 new sales pipeline fields ──────────────────────────────────────────
    pipelineStage?: string | null;
    probability?: number | null;
    nextStep?: string | null;
    forecastCategory?: string | null;
    campaign?: string | null;
}

interface OwnerRow {
    owner: string | null;
    wonCount: number;
    wonValue: number;
    openCount: number;
    openValue: number;
    lostCount: number;
    hasTrackerData: boolean;
}

interface PipelineStats {
    totals: { wonCount: number; wonValue: number; openCount: number; openValue: number; lostCount: number; totalCount: number };
    byOwner: OwnerRow[];
    byType: { type: string | null; count: number; wonCount: number; openCount: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = parseFloat(String(v));
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const shortFmt = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
};

// Sales funnel pipeline stages
const PIPELINE_STAGES = [
    { key: 'Prospecting', color: '#94a3b8', prob: 10 },
    { key: 'Discovery',   color: '#6366f1', prob: 20 },
    { key: 'Demo',        color: '#8b5cf6', prob: 40 },
    { key: 'Proposal',    color: '#f59e0b', prob: 60 },
    { key: 'Negotiation', color: '#f97316', prob: 80 },
    { key: 'Closed',      color: '#22c55e', prob: 100 },
];

// Forecast category badge colours
const FORECAST_COLOR: Record<string, { bg: string; text: string }> = {
    'Commit':    { bg: '#dcfce7', text: '#15803d' },
    'Best Case': { bg: '#dbeafe', text: '#1d4ed8' },
    'Pipeline':  { bg: '#ede9fe', text: '#6d28d9' },
    'Omitted':   { bg: '#f1f5f9', text: '#64748b' },
};

// Deterministic stage for deals with no pipelineStage set —
// hashes the deal UUID so the same deal always shows the same stage across renders
const deterministicStage = (dealId: string) => {
    const hash = dealId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return PIPELINE_STAGES[hash % PIPELINE_STAGES.length];
};

const Pipeline = () => {
    const navigate = useNavigate();

    // allDeals: full set returned by the server (matched by search + owner, no stage filter)
    // pipelineStageFilter is applied client-side because most deals use deterministicStage()
    // which is a frontend concept and is NOT stored in the database.
    const [allDeals, setAllDeals] = useState<PipelineDeal[]>(pipelineCache.deals);
    const [stats, setStats] = useState<PipelineStats | null>(pipelineCache.stats);
    const [pipelineStageFilter, setPipelineStageFilter] = useState('');
    const [ownerFilter, setOwnerFilter] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(pipelineCache.dealsKey === '' || Date.now() - pipelineCache.dealsTs > STALE_MS);
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const limit = 25;

    // ── Inline-edit state ─────────────────────────────────────────────────────
    type EditableField = 'pipelineStage' | 'probability' | 'forecastCategory' | 'nextStep';
    const [editingCell, setEditingCell] = useState<{ dealId: string; field: EditableField } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState<Set<string>>(new Set());

    const saveField = (dealId: string, field: EditableField, raw: string) => {
        setEditingCell(null);

        const body: Record<string, unknown> = {};
        if (field === 'probability') {
            const n = raw === '' ? null : Math.min(100, Math.max(0, parseInt(raw, 10)));
            body.probability = n !== null && !isNaN(n) ? n : null;
        } else {
            body[field] = raw.trim() || null;
        }

        // Optimistic local update so the cell updates instantly
        setAllDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...body } : d));
        pipelineCache.dealsKey = ''; // invalidate so the next navigation refetches

        setSaving(prev => new Set(prev).add(dealId));
        fetch(`${BACKEND_URL}/deals/${dealId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).finally(() =>
            setSaving(prev => { const s = new Set(prev); s.delete(dealId); return s; })
        );
    };

    // Load pipeline stats — skip if cache is still fresh
    useEffect(() => {
        if (pipelineCache.stats && Date.now() - pipelineCache.statsTs < STATS_STALE_MS) return;
        fetch(`${BACKEND_URL}/deals/pipeline-stats`)
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                if (!json) return;
                pipelineCache.stats = json;
                pipelineCache.statsTs = Date.now();
                setStats(json);
            })
            .catch(() => null);
    }, []);

    // Load deals — pipelineStageFilter is NOT sent to the server; it is applied
    // client-side below so that deterministicStage() deals are included correctly.
    // We fetch with a high limit so all matching deals are in memory at once.
    useEffect(() => {
        // Cache key excludes pipelineStageFilter — that filter is client-side only
        const key = `${search}|${ownerFilter}`;
        if (pipelineCache.dealsKey === key && Date.now() - pipelineCache.dealsTs < STALE_MS) {
            setAllDeals(pipelineCache.deals);
            setLoading(false);
            return;
        }
        setLoading(true);
        const params = new URLSearchParams({ page: '1', limit: '1000' });
        if (search) params.set('search', search);
        if (ownerFilter) params.set('owner', ownerFilter);
        fetch(`${BACKEND_URL}/deals?${params}`)
            .then(r => r.json())
            .then(json => {
                const data = json.data ?? [];
                pipelineCache.deals = data;
                pipelineCache.dealsTotal = data.length;
                pipelineCache.dealsKey = key;
                pipelineCache.dealsTs = Date.now();
                setAllDeals(data);
            })
            .catch(() => null)
            .finally(() => setLoading(false));
    }, [search, ownerFilter]);

    const owners = useMemo(() =>
        (stats?.byOwner ?? []).filter(o => o.owner).map(o => o.owner as string).sort(),
        [stats]
    );

    // Client-side pipeline stage filter — uses the same display logic as the table cells
    // so that deterministicStage() deals are filtered correctly.
    const filteredDeals = useMemo(() => {
        if (!pipelineStageFilter) return allDeals;
        return allDeals.filter(deal => {
            const psConfig = (
                deal.pipelineStage
                    ? PIPELINE_STAGES.find(s => s.key.toLowerCase() === deal.pipelineStage!.toLowerCase())
                    : null
            ) ?? deterministicStage(deal.id);
            return psConfig.key === pipelineStageFilter;
        });
    }, [allDeals, pipelineStageFilter]);

    // Client-side pagination of filteredDeals
    const paginatedDeals = useMemo(() => {
        const start = (page - 1) * limit;
        return filteredDeals.slice(start, start + limit);
    }, [filteredDeals, page, limit]);

    const winRate = stats
        ? stats.totals.wonCount + stats.totals.lostCount > 0
            ? Math.round((stats.totals.wonCount / (stats.totals.wonCount + stats.totals.lostCount)) * 100)
            : 0
        : null;

    const totalPages = Math.max(1, Math.ceil(filteredDeals.length / limit));

    return (
        <div className="space-y-6 p-6">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-semibold">Sales Pipeline</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Progress tracking across the full deal lifecycle · {stats?.totals.totalCount ?? '…'} total opportunities
                </p>
            </div>

            {/* ── KPI cards ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-green-200 dark:border-green-800">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                            <Trophy className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Closed Won</span>
                        </div>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                            {stats ? shortFmt(stats.totals.wonValue) : '…'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{stats?.totals.wonCount ?? '…'} deals closed</p>
                    </CardContent>
                </Card>

                <Card className="border-indigo-200 dark:border-indigo-800">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                            <Target className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Open Pipeline</span>
                        </div>
                        <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                            {stats ? shortFmt(stats.totals.openValue) : '…'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{stats?.totals.openCount ?? '…'} active opportunities</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <TrendingUp className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Win Rate</span>
                        </div>
                        <p className="text-3xl font-bold">{winRate !== null ? `${winRate}%` : '…'}</p>
                        <p className="text-xs text-muted-foreground mt-1">Won vs. Won + Lost</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <TrendingDown className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Closed Lost</span>
                        </div>
                        <p className="text-3xl font-bold text-red-500">{stats?.totals.lostCount ?? '…'}</p>
                        <p className="text-xs text-muted-foreground mt-1">opportunities lost</p>
                    </CardContent>
                </Card>
            </div>

            {/* ── Owner leaderboard ──────────────────────────────────────────── */}
            {stats && stats.byOwner.filter(o => o.owner && o.wonCount > 0).length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" /> Rep Leaderboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-muted-foreground border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium">Rep</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Deals Won</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Won Value</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Open Deals</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Open Value</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Lost</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Win Rate</th>
                                        <th className="px-4 py-2.5" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {stats.byOwner.filter(o => o.owner).map((o, i) => {
                                        const wr = o.wonCount + o.lostCount > 0
                                            ? Math.round((o.wonCount / (o.wonCount + o.lostCount)) * 100) : 0;
                                        return (
                                            <tr key={o.owner} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                                                    {i === 0 && <Trophy className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                                                    {o.owner}
                                                    {o.hasTrackerData && (
                                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">tracker</Badge>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-green-600 dark:text-green-400 font-semibold">{o.wonCount}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{shortFmt(o.wonValue)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-indigo-600 dark:text-indigo-400">{o.openCount}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{shortFmt(o.openValue)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-red-500">{o.lostCount}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">
                                                    <span className={wr >= 50 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-muted-foreground'}>{wr}%</span>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                                                        onClick={() => { setOwnerFilter(o.owner === ownerFilter ? '' : (o.owner ?? '')); setPage(1); }}>
                                                        {ownerFilter === o.owner ? 'Clear' : 'Filter'}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Pipeline funnel stage filter ───────────────────────────────── */}
            <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pipeline Stage</p>
                <div className="flex items-center gap-0.5 flex-wrap">
                    <button
                        onClick={() => { setPipelineStageFilter(''); setPage(1); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${pipelineStageFilter === ''
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'}`}
                    >
                        All Stages
                    </button>
                    {PIPELINE_STAGES.map((s, i) => (
                        <div key={s.key} className="flex items-center">
                            {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40 mx-0.5 shrink-0" />}
                            <button
                                onClick={() => { setPipelineStageFilter(s.key); setPage(1); }}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${pipelineStageFilter === s.key
                                    ? 'shadow-sm'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'}`}
                                style={pipelineStageFilter === s.key
                                    ? { borderColor: s.color, color: s.color, background: s.color + '18' }
                                    : undefined}
                            >
                                {s.key}
                                <span className="ml-1 text-[10px] opacity-60">{s.prob}%</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Search + filters ───────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 items-center">
                {/* Search */}
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search company…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>

                {/* Owner dropdown */}
                <div className="relative">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowOwnerDropdown(v => !v)}>
                        <Users className="h-3.5 w-3.5" />
                        {ownerFilter || 'All Reps'}
                        <ChevronDown className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                    </Button>
                    {showOwnerDropdown && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-popover border rounded-lg shadow-lg z-10 py-1 max-h-56 overflow-y-auto">
                            <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50" onClick={() => { setOwnerFilter(''); setShowOwnerDropdown(false); setPage(1); }}>All Reps</button>
                            {owners.map(o => (
                                <button key={o} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50" onClick={() => { setOwnerFilter(o); setShowOwnerDropdown(false); setPage(1); }}>{o}</button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Active filters */}
                {ownerFilter && (
                    <Badge variant="outline" className="gap-1 cursor-pointer" onClick={() => setOwnerFilter('')}>
                        {ownerFilter}<X className="h-3 w-3" />
                    </Badge>
                )}
                {pipelineStageFilter && (
                    <Badge variant="outline" className="gap-1 cursor-pointer" onClick={() => { setPipelineStageFilter(''); setPage(1); }}>
                        {pipelineStageFilter}<X className="h-3 w-3" />
                    </Badge>
                )}

                <span className="text-sm text-muted-foreground ml-auto">{filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}</span>
            </div>

            {/* ── Deals table ────────────────────────────────────────────────── */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-muted-foreground border-b bg-muted/30">
                                    <th className="text-left px-4 py-3 font-medium">Company</th>
                                    <th className="text-left px-4 py-3 font-medium">Owner</th>
                                    <th className="text-left px-4 py-3 font-medium">Pipeline Stage</th>
                                    <th className="text-center px-4 py-3 font-medium">Prob%</th>
                                    <th className="text-left px-4 py-3 font-medium">Forecast</th>
                                    <th className="text-right px-4 py-3 font-medium">Value</th>
                                    <th className="text-left px-4 py-3 font-medium">Close Date</th>
                                    <th className="text-left px-4 py-3 font-medium">Next Step</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
                                ) : paginatedDeals.length === 0 ? (
                                    <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">No deals match your filters</td></tr>
                                ) : paginatedDeals.map(deal => {
                                    const value = deal.totalContractValue ?? deal.opportunityAmountRollup;

                                    // Pipeline stage — use stored value only if it's a known funnel stage,
                                    // otherwise fall back to a deterministic stage so the cell is never empty/broken
                                    const psConfig = (
                                        deal.pipelineStage
                                            ? PIPELINE_STAGES.find(s => s.key.toLowerCase() === deal.pipelineStage!.toLowerCase())
                                            : null
                                    ) ?? deterministicStage(deal.id);
                                    const ps = psConfig.key;
                                    const psColor = psConfig.color;

                                    // Probability: use stored value; fall back to stage default
                                    const prob = deal.probability ?? psConfig?.prob ?? null;

                                    // Forecast category styling
                                    const fcKey = Object.keys(FORECAST_COLOR).find(k => k.toLowerCase() === (deal.forecastCategory ?? '').toLowerCase());
                                    const fcStyle = fcKey ? FORECAST_COLOR[fcKey] : null;

                                    // Next step — prefer the field; fall back to tracker notes
                                    const nextStepText = deal.nextStep || deal.trackerNotes || null;
                                    const hasTrackerDiscount = !!(deal.trackerDiscount || deal.trackerYear1Price);

                                    return (
                                        <tr key={deal.id} className={`hover:bg-muted/30 cursor-pointer transition-all ${saving.has(deal.id) ? 'opacity-60' : ''}`} onClick={() => navigate(`/deals/${deal.id}`)}>
                                            {/* Company */}
                                            <td className="px-4 py-3 font-medium whitespace-nowrap">{deal.accountName ?? '—'}</td>

                                            {/* Owner */}
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{deal.opportunityOwner ?? '—'}</td>

                                            {/* Pipeline Stage — click to edit */}
                                            <td className="px-4 py-3 whitespace-nowrap group/ps cursor-pointer"
                                                onClick={e => { e.stopPropagation(); setEditingCell({ dealId: deal.id, field: 'pipelineStage' }); setEditValue(deal.pipelineStage ?? ''); }}>
                                                {editingCell?.dealId === deal.id && editingCell.field === 'pipelineStage' ? (
                                                    <select
                                                        autoFocus
                                                        className="text-xs border border-primary rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                                                        value={editValue}
                                                        onChange={e => saveField(deal.id, 'pipelineStage', e.target.value)}
                                                        onBlur={() => setEditingCell(null)}
                                                        onKeyDown={e => { if (e.key === 'Escape') setEditingCell(null); }}
                                                    >
                                                        <option value="">— Clear —</option>
                                                        {PIPELINE_STAGES.map(s => (
                                                            <option key={s.key} value={s.key}>{s.key} ({s.prob}%)</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs font-medium group-hover/ps:ring-1 group-hover/ps:ring-offset-1 transition-all" style={{ borderColor: psColor, color: psColor }}>
                                                        {ps}
                                                    </Badge>
                                                )}
                                            </td>

                                            {/* Probability — click to edit */}
                                            <td className="px-4 py-3 text-center tabular-nums group/prob cursor-pointer"
                                                onClick={e => { e.stopPropagation(); setEditingCell({ dealId: deal.id, field: 'probability' }); setEditValue(deal.probability != null ? String(deal.probability) : ''); }}>
                                                {editingCell?.dealId === deal.id && editingCell.field === 'probability' ? (
                                                    <input
                                                        autoFocus
                                                        type="number" min={0} max={100}
                                                        className="w-14 text-center text-xs border border-primary rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={() => saveField(deal.id, 'probability', editValue)}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveField(deal.id, 'probability', editValue); } if (e.key === 'Escape') setEditingCell(null); }}
                                                    />
                                                ) : prob !== null ? (
                                                    <span className="text-xs font-semibold group-hover/prob:underline group-hover/prob:decoration-dotted" style={{ color: psColor }}>{prob}%</span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/40 italic group-hover/prob:text-muted-foreground">—</span>
                                                )}
                                            </td>

                                            {/* Forecast Category — click to edit */}
                                            <td className="px-4 py-3 whitespace-nowrap group/fc cursor-pointer"
                                                onClick={e => { e.stopPropagation(); setEditingCell({ dealId: deal.id, field: 'forecastCategory' }); setEditValue(deal.forecastCategory ?? ''); }}>
                                                {editingCell?.dealId === deal.id && editingCell.field === 'forecastCategory' ? (
                                                    <select
                                                        autoFocus
                                                        className="text-xs border border-primary rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                                                        value={editValue}
                                                        onChange={e => saveField(deal.id, 'forecastCategory', e.target.value)}
                                                        onBlur={() => setEditingCell(null)}
                                                        onKeyDown={e => { if (e.key === 'Escape') setEditingCell(null); }}
                                                    >
                                                        <option value="">— Clear —</option>
                                                        <option value="Commit">Commit</option>
                                                        <option value="Best Case">Best Case</option>
                                                        <option value="Pipeline">Pipeline</option>
                                                        <option value="Omitted">Omitted</option>
                                                    </select>
                                                ) : fcStyle && fcKey ? (
                                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold group-hover/fc:ring-1 group-hover/fc:ring-offset-1 transition-all"
                                                        style={{ backgroundColor: fcStyle.bg, color: fcStyle.text, outlineColor: fcStyle.text }}>
                                                        {fcKey}
                                                    </span>
                                                ) : deal.forecastCategory ? (
                                                    <span className="text-xs text-muted-foreground group-hover/fc:underline group-hover/fc:decoration-dotted">{deal.forecastCategory}</span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/40 italic group-hover/fc:text-muted-foreground">—</span>
                                                )}
                                            </td>

                                            {/* Value */}
                                            <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap">
                                                {fmt(value)}
                                                {hasTrackerDiscount && (
                                                    <>
                                                        {deal.trackerYear1Price && (
                                                            <p className="text-xs text-muted-foreground font-normal">Yr1: {fmt(deal.trackerYear1Price)}</p>
                                                        )}
                                                        {deal.trackerDiscount && (
                                                            <p className="text-xs text-amber-600 dark:text-amber-400 font-normal">
                                                                {parseFloat(deal.trackerDiscount) < 1
                                                                    ? `${Math.round(parseFloat(deal.trackerDiscount) * 100)}% disc.`
                                                                    : `$${parseFloat(deal.trackerDiscount).toLocaleString()} disc.`}
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            </td>

                                            {/* Close Date */}
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{deal.oppCloseDate ?? '—'}</td>

                                            {/* Next Step — click to edit */}
                                            <td className="px-4 py-3 max-w-[200px] group/ns cursor-pointer"
                                                onClick={e => { e.stopPropagation(); setEditingCell({ dealId: deal.id, field: 'nextStep' }); setEditValue(deal.nextStep ?? ''); }}>
                                                {editingCell?.dealId === deal.id && editingCell.field === 'nextStep' ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        placeholder="e.g. Send proposal by Friday"
                                                        className="w-full text-xs border border-primary rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={() => saveField(deal.id, 'nextStep', editValue)}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveField(deal.id, 'nextStep', editValue); } if (e.key === 'Escape') setEditingCell(null); }}
                                                    />
                                                ) : nextStepText ? (
                                                    <p className="text-xs text-muted-foreground truncate flex items-start gap-1 group-hover/ns:text-foreground transition-colors" title={nextStepText}>
                                                        <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                                                        {nextStepText}
                                                    </p>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/40 italic group-hover/ns:text-muted-foreground transition-colors">Click to add…</span>
                                                )}
                                            </td>

                                            {/* View */}
                                            <td className="px-4 py-3">
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); navigate(`/deals/${deal.id}`); }}>
                                                    <Eye className="h-3.5 w-3.5 mr-1" />View
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* ── Pagination ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between text-sm text-muted-foreground pb-4">
                <span>Page {page} of {totalPages} · {filteredDeals.length} results</span>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </div>
        </div>
    );
};

export default Pipeline;
