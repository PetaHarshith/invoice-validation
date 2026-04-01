import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Badge } from '@/components/ui/badge'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    PieChart, Pie, Cell,
    AreaChart, Area,
    ResponsiveContainer
} from 'recharts'
import {
    Briefcase, TrendingUp, CheckCircle2, Clock,
    XCircle, Send, FileText, Award
} from 'lucide-react'
import { BACKEND_URL } from '@/constants'

type StatsData = {
    total: number;
    statusCounts: Record<string, number>;
    monthlyApplications: Array<{ month: string; count: number }>;
    recentApplications: Array<{
        id: number;
        company: string;
        position: string;
        status: string;
        dateApplied: string | null;
        createdAt: string;
    }>;
    responseRate: number;
    successRate: number;
}

const statusColors: Record<string, string> = {
    Applied: 'var(--chart-1)',
    OA: 'var(--chart-4)',
    Interview: 'var(--chart-2)',
    Offer: '#22c55e',
    Rejected: 'var(--chart-3)',
    Withdrawn: 'var(--chart-5)'
}

const statusIcons: Record<string, React.ReactNode> = {
    Applied: <Send className="h-4 w-4" />,
    OA: <FileText className="h-4 w-4" />,
    Interview: <Briefcase className="h-4 w-4" />,
    Offer: <Award className="h-4 w-4" />,
    Rejected: <XCircle className="h-4 w-4" />,
    Withdrawn: <Clock className="h-4 w-4" />
}

const chartConfig: ChartConfig = {
    Applied: { label: 'Applied', color: 'var(--chart-1)' },
    OA: { label: 'Online Assessment', color: 'var(--chart-4)' },
    Interview: { label: 'Interview', color: 'var(--chart-2)' },
    Offer: { label: 'Offer', color: '#22c55e' },
    Rejected: { label: 'Rejected', color: 'var(--chart-3)' },
    Withdrawn: { label: 'Withdrawn', color: 'var(--chart-5)' },
    count: { label: 'Applications', color: 'var(--primary)' }
}

const Dashboard = () => {
    const [stats, setStats] = useState<StatsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/applications/stats`, {
                    credentials: 'include'
                })
                if (!response.ok) throw new Error('Failed to fetch stats')
                const data = await response.json()
                setStats(data.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred')
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <p className="text-destructive">{error}</p>
            </div>
        )
    }

    if (!stats) return null

    const pieData = Object.entries(stats.statusCounts).map(([status, count]) => ({
        name: status,
        value: count,
        fill: statusColors[status] || 'var(--chart-1)'
    }))

    const barData = Object.entries(stats.statusCounts).map(([status, count]) => ({
        status,
        count,
        fill: statusColors[status] || 'var(--chart-1)'
    }))

    const pendingCount = (stats.statusCounts['Applied'] || 0) +
        (stats.statusCounts['OA'] || 0) +
        (stats.statusCounts['Interview'] || 0)

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const areaData = stats.monthlyApplications.map(item => ({
        month: monthNames[parseInt(item.month.split('-')[1]) - 1],
        count: item.count
    }))

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Track your job application progress</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="relative overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Applications
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Briefcase className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground mt-1">All time applications</p>
                    </CardContent>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 to-primary"></div>
                </Card>

                <Card className="relative overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Response Rate
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-chart-2/10 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-chart-2" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.responseRate}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Got a response back</p>
                    </CardContent>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-chart-2/50 to-chart-2"></div>
                </Card>

                <Card className="relative overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Success Rate
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.successRate}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Interviews + Offers</p>
                    </CardContent>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500/50 to-green-500"></div>
                </Card>

                <Card className="relative overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Pending
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-chart-4/10 flex items-center justify-center">
                            <Clock className="h-4 w-4 text-chart-4" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{pendingCount}</div>
                        <p className="text-xs text-muted-foreground mt-1">Waiting for response</p>
                    </CardContent>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-chart-4/50 to-chart-4"></div>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Applications by Status</CardTitle>
                        <CardDescription>Breakdown of your applications</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[300px] w-full">
                            <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="status" type="category" width={80} tick={{ fontSize: 12 }} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* Pie Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Status Distribution</CardTitle>
                        <CardDescription>Visual breakdown of statuses</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[300px] w-full">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                    nameKey="name"
                                    label={({ name, percent }) =>
                                        `${name} ${(percent * 100).toFixed(0)}%`
                                    }
                                    labelLine={false}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <ChartTooltip content={<ChartTooltipContent />} />
                            </PieChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Area Chart & Recent Applications */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Area Chart */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Application Trend</CardTitle>
                        <CardDescription>Applications over the last 6 months</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <AreaChart data={areaData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorCount)"
                                />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* Recent Applications */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Applications</CardTitle>
                        <CardDescription>Your latest submissions</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {stats.recentApplications.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                No applications yet
                            </p>
                        ) : (
                            stats.recentApplications.map((app) => (
                                <div
                                    key={app.id}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                >
                                    <div
                                        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                                        style={{ backgroundColor: statusColors[app.status] }}
                                    >
                                        {app.company.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{app.company}</p>
                                        <p className="text-xs text-muted-foreground truncate">{app.position}</p>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className="text-xs shrink-0"
                                        style={{
                                            borderColor: statusColors[app.status],
                                            color: statusColors[app.status]
                                        }}
                                    >
                                        {statusIcons[app.status]}
                                        <span className="ml-1">{app.status}</span>
                                    </Badge>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Status Legend */}
            <Card>
                <CardHeader>
                    <CardTitle>Status Legend</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-4">
                        {Object.entries(statusColors).map(([status, color]) => (
                            <div key={status} className="flex items-center gap-2">
                                <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="text-sm font-medium">{status}</span>
                                <span className="text-sm text-muted-foreground">
                                    ({stats.statusCounts[status] || 0})
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default Dashboard
