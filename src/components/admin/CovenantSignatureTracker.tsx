import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CompactSelectValue } from "@/components/ui/compact-select-value";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCovenantSignatureRoster } from "@/hooks/useCovenant";
import { getCovenantTerminology, getCurrentResourceAppKey } from "@/lib/resourceApp";

type StatusFilter = "all" | "signed" | "unsigned";

const ALL_CAMPUSES = "__all__";
const NO_CAMPUS = "__none__";

function getInitials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPercent(signed: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((signed / total) * 100)}%`;
}

function rosterScopeLabel(appKey: string) {
  if (appKey === "students_hs") return "HS worship volunteers.";
  if (appKey === "students_ms") return "MS worship volunteers.";
  return "Worship volunteers on HS, MS, Weekend Worship, and Evident.";
}

export function CovenantSignatureTracker({ documentId }: { documentId: string }) {
  const terminology = getCovenantTerminology();
  const { data: roster = [], isLoading, error } = useCovenantSignatureRoster(documentId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [campusFilter, setCampusFilter] = useState(ALL_CAMPUSES);
  const [search, setSearch] = useState("");

  const campusStats = useMemo(() => {
    const stats = new Map<string, { signed: number; total: number }>();
    roster.forEach((entry) => {
      const campuses = entry.campus_names.length > 0 ? entry.campus_names : [NO_CAMPUS];
      campuses.forEach((campus) => {
        const current = stats.get(campus) ?? { signed: 0, total: 0 };
        current.total += 1;
        if (entry.signed_at) current.signed += 1;
        stats.set(campus, current);
      });
    });
    return Array.from(stats.entries())
      .map(([campus, value]) => ({ campus, ...value }))
      .sort((a, b) => {
        if (a.campus === NO_CAMPUS) return 1;
        if (b.campus === NO_CAMPUS) return -1;
        return a.campus.localeCompare(b.campus);
      });
  }, [roster]);

  const campusScoped = useMemo(() => {
    if (campusFilter === ALL_CAMPUSES) return roster;
    return roster.filter((entry) =>
      campusFilter === NO_CAMPUS ? entry.campus_names.length === 0 : entry.campus_names.includes(campusFilter),
    );
  }, [roster, campusFilter]);

  const signedCount = campusScoped.filter((entry) => entry.signed_at).length;
  const totalCount = campusScoped.length;
  const unsignedCount = totalCount - signedCount;
  const percent = totalCount === 0 ? 0 : (signedCount / totalCount) * 100;

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campusScoped.filter((entry) => {
      if (statusFilter === "signed" && !entry.signed_at) return false;
      if (statusFilter === "unsigned" && entry.signed_at) return false;
      if (!query) return true;
      return (
        entry.full_name?.toLowerCase().includes(query) ||
        entry.email.toLowerCase().includes(query) ||
        entry.typed_name?.toLowerCase().includes(query)
      );
    });
  }, [campusScoped, statusFilter, search]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load {terminology.noun} signatures: {(error as Error).message}
      </p>
    );
  }

  const campusLabel = (campus: string) => (campus === NO_CAMPUS ? "No campus" : campus);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Signature tracker</p>
            <p className="text-xs text-muted-foreground">
              {rosterScopeLabel(getCurrentResourceAppKey())}
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{formatPercent(signedCount, totalCount)}</p>
        </div>
        <Progress value={percent} className="h-2" />
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{signedCount} signed</Badge>
          <Badge variant="outline">{unsignedCount} not signed</Badge>
          <Badge variant="outline">{totalCount} total</Badge>
        </div>
      </div>

      {campusStats.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {campusStats.map((stat) => (
            <button
              key={stat.campus}
              type="button"
              onClick={() => setCampusFilter(campusFilter === stat.campus ? ALL_CAMPUSES : stat.campus)}
              className={`rounded-md border p-3 text-left transition-colors hover:bg-accent/50 ${
                campusFilter === stat.campus ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{campusLabel(stat.campus)}</span>
                <span className="text-sm tabular-nums">{formatPercent(stat.signed, stat.total)}</span>
              </div>
              <Progress value={stat.total === 0 ? 0 : (stat.signed / stat.total) * 100} className="mt-2 h-1.5" />
              <p className="mt-1 text-xs text-muted-foreground">
                {stat.signed} of {stat.total} signed
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="signed">Signed</TabsTrigger>
            <TabsTrigger value="unsigned">Not signed</TabsTrigger>
          </TabsList>
        </Tabs>
        {campusStats.length > 1 && (
          <Select value={campusFilter} onValueChange={setCampusFilter}>
            <SelectTrigger className="sm:w-48">
              <CompactSelectValue
                label={campusFilter === ALL_CAMPUSES ? "All campuses" : campusLabel(campusFilter)}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CAMPUSES}>All campuses</SelectItem>
              {campusStats.map((stat) => (
                <SelectItem key={stat.campus} value={stat.campus}>
                  {campusLabel(stat.campus)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
      </div>

      {visibleEntries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No one matches these filters.</p>
      ) : (
        <ScrollArea className="h-80 rounded-md border border-border">
          <ul className="divide-y divide-border">
            {visibleEntries.map((entry) => (
              <li key={entry.user_id} className="flex items-center gap-3 px-3 py-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={entry.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">{getInitials(entry.full_name, entry.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.full_name || entry.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.campus_names.length > 0 ? entry.campus_names.join(", ") : "No campus"}
                  </p>
                </div>
                {entry.signed_at ? (
                  <div className="text-right">
                    <Badge variant="secondary">Signed</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(entry.signed_at).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not signed
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
