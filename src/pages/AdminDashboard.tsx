import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  FileText,
  LayoutDashboard,
  Server,
  Star,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  fetchAdminStats,
  fetchAdminSystem,
  fetchAdminUsers,
} from "@/lib/admin";
import type { AdminStats, AdminSystem, AdminUser } from "@/lib/types";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const USERS_PAGE_SIZE = 50;

interface LoadingState {
  stats: boolean;
  users: boolean;
  system: boolean;
}

interface ErrorState {
  stats: boolean;
  users: boolean;
  system: boolean;
}

export default function AdminDashboard() {
  const { t } = useTranslation("admin");

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userOffset, setUserOffset] = useState(0);
  const [system, setSystem] = useState<AdminSystem | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    stats: true,
    users: true,
    system: true,
  });
  const [error, setError] = useState<ErrorState>({
    stats: false,
    users: false,
    system: false,
  });

  useEffect(() => {
    let alive = true;
    async function loadStats() {
      try {
        const data = await fetchAdminStats();
        if (alive) setStats(data);
      } catch {
        if (alive) setError((prev) => ({ ...prev, stats: true }));
      } finally {
        if (alive) setLoading((prev) => ({ ...prev, stats: false }));
      }
    }
    async function loadSystem() {
      try {
        const data = await fetchAdminSystem();
        if (alive) setSystem(data);
      } catch {
        if (alive) setError((prev) => ({ ...prev, system: true }));
      } finally {
        if (alive) setLoading((prev) => ({ ...prev, system: false }));
      }
    }
    void loadStats();
    void loadSystem();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadUsers() {
      setLoading((prev) => ({ ...prev, users: true }));
      setError((prev) => ({ ...prev, users: false }));
      try {
        const data = await fetchAdminUsers(USERS_PAGE_SIZE, userOffset);
        if (alive) setUsers(data.users);
      } catch {
        if (alive) setError((prev) => ({ ...prev, users: true }));
      } finally {
        if (alive) setLoading((prev) => ({ ...prev, users: false }));
      }
    }
    void loadUsers();
    return () => {
      alive = false;
    };
  }, [userOffset]);

  const kpiCards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: t("kpi.totalUsers"),
        value: stats.users.total,
        sub: t("kpi.newToday", { count: stats.users.today }),
        icon: Users,
      },
      {
        label: t("kpi.totalSessions"),
        value: stats.sessions.total,
        sub: t("kpi.publicSessions", { count: stats.sessions.public }),
        icon: FileText,
      },
      {
        label: t("kpi.activeUsers7d"),
        value: stats.activeUsers.last7Days,
        sub: t("kpi.activeUsers30d", { count: stats.activeUsers.last30Days }),
        icon: Activity,
      },
      {
        label: t("kpi.sessionsPerUser"),
        value: stats.averages.sessionsPerUser,
        sub: t("kpi.averageRating", { value: stats.averages.averageRating }),
        icon: Star,
      },
    ];
  }, [stats, t]);

  const chartData = useMemo(() => {
    return stats?.dailySeries.map((point) => ({
      day: point.day,
      sessions: point.sessions,
      publicSessions: point.publicSessions,
    }));
  }, [stats]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString();
  }

  if (error.stats && !stats) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 size-5 text-destructive" />
        <p className="text-sm font-medium text-destructive">
          {t("error.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard className="mr-1 size-4" />
            {t("tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-1 size-4" />
            {t("tabs.users")}
          </TabsTrigger>
          <TabsTrigger value="system">
            <Server className="mr-1 size-4" />
            {t("tabs.system")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      {card.label}
                    </CardTitle>
                    <Icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tabular-nums">
                      {loading.stats ? "—" : card.value}
                    </div>
                    <p className="text-xs text-muted-foreground">{card.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Daily sessions chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.dailySessionsTitle")}</CardTitle>
              <CardDescription>
                {t("overview.dailySessionsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                {loading.stats ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t("loading")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickFormatter={(value: string) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "0.5rem",
                          border: "1px solid hsl(var(--border))",
                          backgroundColor: "hsl(var(--background))",
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="sessions"
                        stroke="hsl(var(--herb))"
                        strokeWidth={2}
                        dot={false}
                        name={t("overview.dailySessionsLegend")}
                      />
                      <Line
                        type="monotone"
                        dataKey="publicSessions"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        dot={false}
                        name={t("overview.publicSessionsLegend")}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top lists */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <TopListCard
              title={t("overview.topStrains")}
              items={stats?.topStrains.map((s) => ({ label: s.slug, count: s.count })) ?? []}
              loading={loading.stats}
              empty={t("overview.emptyStrains")}
            />
            <TopListCard
              title={t("overview.topDevices")}
              items={
                stats?.topDevices.map((d) => ({ label: d.name, count: d.count })) ?? []
              }
              loading={loading.stats}
              empty={t("overview.emptyDevices")}
            />
            <TopListCard
              title={t("overview.topMoods")}
              items={stats?.topMoods.map((m) => ({ label: m.tag, count: m.count })) ?? []}
              loading={loading.stats}
              empty={t("overview.emptyMoods")}
            />
            <TopListCard
              title={t("overview.topUnwantedEffects")}
              items={stats?.topUnwantedEffects.map((m) => ({ label: m.tag, count: m.count })) ?? []}
              loading={loading.stats}
              empty={t("overview.emptyUnwantedEffects")}
            />
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("users.title")}</CardTitle>
              <CardDescription>{t("users.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading.users ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </div>
              ) : error.users ? (
                <div className="py-8 text-center text-sm text-destructive">
                  {t("error.loadingUsers")}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("users.handle")}</TableHead>
                        <TableHead>{t("users.role")}</TableHead>
                        <TableHead>{t("users.joined")}</TableHead>
                        <TableHead>{t("users.sessions")}</TableHead>
                        <TableHead>{t("users.lastSession")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            @{user.handle}
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={user.role} />
                          </TableCell>
                          <TableCell>{formatDate(user.createdAt)}</TableCell>
                          <TableCell>{user.sessionCount}</TableCell>
                          <TableCell>
                            {user.lastSessionAt
                              ? formatDate(user.lastSessionAt)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={userOffset === 0}
                      onClick={() => setUserOffset((o) => Math.max(0, o - USERS_PAGE_SIZE))}
                    >
                      <ChevronLeft className="mr-1 size-4" />
                      {t("users.previous")}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {t("users.offset", { offset: userOffset })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={users.length < USERS_PAGE_SIZE}
                      onClick={() => setUserOffset((o) => o + USERS_PAGE_SIZE)}
                    >
                      {t("users.next")}
                      <ChevronRight className="ml-1 size-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SystemCard
              label={t("system.dbStatus")}
              value={system?.db ?? "—"}
              loading={loading.system}
              icon={Database}
              status={system?.db === "up" ? "success" : "error"}
            />
            <SystemCard
              label={t("system.activeTokens")}
              value={system?.activeTokens ?? 0}
              loading={loading.system}
              icon={Clock}
            />
            <SystemCard
              label={t("system.deviceCount")}
              value={system?.deviceCount ?? 0}
              loading={loading.system}
              icon={Server}
            />
            <SystemCard
              label={t("system.reviewCount")}
              value={system?.deviceReviewCount ?? 0}
              loading={loading.system}
              icon={Star}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("system.migrationsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading.system ? (
                <div className="text-sm text-muted-foreground">{t("loading")}</div>
              ) : system?.migrations.length ? (
                <ul className="space-y-1 text-sm">
                  {system.migrations.map((name) => (
                    <li key={name} className="font-mono text-muted-foreground">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("system.noMigrations")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TopListCard({
  title,
  items,
  loading,
  empty,
}: {
  title: string;
  items: { label: string; count: number }[];
  loading: boolean;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">…</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={item.label} className="flex items-center justify-between text-sm">
                <span className="truncate">
                  <span className="text-muted-foreground">#{index + 1}</span>{" "}
                  {item.label}
                </span>
                <span className="ml-2 shrink-0 tabular-nums font-medium">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return <Badge variant="default">admin</Badge>;
  }
  if (role === "moderator") {
    return <Badge variant="secondary">moderator</Badge>;
  }
  return <Badge variant="outline">user</Badge>;
}

function SystemCard({
  label,
  value,
  loading,
  icon: Icon,
  status,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  status?: "success" | "error";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-semibold tabular-nums ${
            status === "success"
              ? "text-herb"
              : status === "error"
                ? "text-destructive"
                : ""
          }`}
        >
          {loading ? "—" : value}
        </div>
      </CardContent>
    </Card>
  );
}
