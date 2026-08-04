import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarOff,
  Check,
  Clock,
  Coffee,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  BreakRequest,
  useAdminBreakRequests,
  useReviewBreakRequest,
} from "@/hooks/useBreakRequests";
import { CAPABILITIES } from "@/lib/capabilities";
import { getMinistryLabel } from "@/lib/constants";

const REQUEST_TYPE_LABELS = {
  need_break: "Needs Break",
  willing_break: "Willing to Break",
} as const;

const MANAGED_SIT_REASON_PREFIX = "Sat from Team Builder";

function NotAuthorized() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <Coffee className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Breaks & Blackouts</h1>
      <p className="mt-2 text-muted-foreground">You don't have access to view break requests.</p>
    </div>
  );
}

function formatBlackoutDates(dates: string[] | null | undefined) {
  if (!dates?.length) return null;
  return dates
    .slice()
    .sort()
    .map((date) => format(new Date(`${date}T00:00:00`), "MMM d, yyyy"))
    .join(" · ");
}

function StatusBadge({ status }: { status: BreakRequest["status"] }) {
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Check className="h-3 w-3" />
        Approved
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs text-destructive">
      <X className="h-3 w-3" />
      Denied
    </Badge>
  );
}

function RequestMeta({ request }: { request: BreakRequest }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {request.period_name && <span>{request.period_name}</span>}
      {request.campus_name && <span>{request.campus_name}</span>}
      <span>{format(new Date(request.created_at), "MMM d, yyyy")}</span>
    </div>
  );
}

function BreakRequestRow({
  request,
  onApprove,
  onDeny,
  isLoading,
}: {
  request: BreakRequest;
  onApprove?: () => void;
  onDeny?: () => void;
  isLoading?: boolean;
}) {
  const isManagedSit = request.reason?.startsWith(MANAGED_SIT_REASON_PREFIX);
  const requestTypeLabel = isManagedSit
    ? "Break Given"
    : REQUEST_TYPE_LABELS[request.request_type] || request.request_type;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{request.user_name}</span>
          <StatusBadge status={request.status} />
          <Badge
            variant="outline"
            className={
              isManagedSit
                ? "text-xs border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                : "text-xs"
            }
          >
            {requestTypeLabel}
          </Badge>
          {request.ministry_type && (
            <Badge variant="secondary" className="text-xs capitalize">
              {getMinistryLabel(request.ministry_type)}
            </Badge>
          )}
        </div>
        {request.reason && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{request.reason}</p>
        )}
        <RequestMeta request={request} />
      </div>

      {onApprove && onDeny && request.status === "pending" && (
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDeny} disabled={isLoading}>
            Deny
          </Button>
          <Button size="sm" onClick={onApprove} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}

function BlackoutRow({ request }: { request: BreakRequest }) {
  const datesLabel = formatBlackoutDates(request.blackout_dates);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{request.user_name}</span>
        <Badge variant="outline" className="text-xs">
          {request.blackout_dates?.length || 0} date
          {(request.blackout_dates?.length || 0) === 1 ? "" : "s"}
        </Badge>
        <StatusBadge status={request.status} />
      </div>
      {datesLabel && <p className="mt-1.5 text-sm text-muted-foreground">{datesLabel}</p>}
      {request.reason && (
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{request.reason}</p>
      )}
      <RequestMeta request={request} />
    </div>
  );
}

function FiltersBar({
  search,
  onSearchChange,
  periodKey,
  onPeriodChange,
  periodOptions,
  status,
  onStatusChange,
  showStatus,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  periodKey: string;
  onPeriodChange: (value: string) => void;
  periodOptions: { key: string; label: string }[];
  status?: string;
  onStatusChange?: (value: string) => void;
  showStatus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name…"
          className="pl-8"
        />
      </div>
      <Select value={periodKey} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-full sm:w-[240px]">
          <SelectValue placeholder="Period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All periods</SelectItem>
          <SelectItem value="active">Active periods</SelectItem>
          {periodOptions.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showStatus && onStatusChange && status && (
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default function BreakRequestsAdmin() {
  const { can, isLoading: capsLoading } = useCapabilities();
  const { data: requests = [], isLoading } = useAdminBreakRequests();
  const reviewRequest = useReviewBreakRequest();

  const [search, setSearch] = useState("");
  const [periodKey, setPeriodKey] = useState("active");
  const [breakStatus, setBreakStatus] = useState("all");
  const [blackoutStatus, setBlackoutStatus] = useState("all");

  const canView =
    can(CAPABILITIES.ADMIN_TOOLS) ||
    can(CAPABILITIES.ADMIN_FULL) ||
    can(CAPABILITIES.MANAGE_TEAM);

  const periodOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const request of requests) {
      if (!request.rotation_period_id || !request.period_name) continue;
      if (seen.has(request.rotation_period_id)) continue;
      const campusSuffix = request.campus_name ? ` · ${request.campus_name}` : "";
      seen.set(request.rotation_period_id, `${request.period_name}${campusSuffix}`);
    }
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [requests]);

  const filteredByPeriodAndSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (periodKey === "active" && !request.period_is_active) return false;
      if (periodKey !== "all" && periodKey !== "active" && request.rotation_period_id !== periodKey) {
        return false;
      }
      if (q && !(request.user_name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, periodKey, search]);

  const breakRequests = useMemo(
    () =>
      filteredByPeriodAndSearch.filter(
        (r) =>
          r.request_scope === "full_trimester" &&
          (breakStatus === "all" || r.status === breakStatus)
      ),
    [filteredByPeriodAndSearch, breakStatus]
  );

  const blackoutRequests = useMemo(
    () =>
      filteredByPeriodAndSearch.filter(
        (r) =>
          r.request_scope === "blackout_dates" &&
          (blackoutStatus === "all" || r.status === blackoutStatus)
      ),
    [filteredByPeriodAndSearch, blackoutStatus]
  );

  const pendingBreakCount = useMemo(
    () =>
      filteredByPeriodAndSearch.filter(
        (r) => r.request_scope === "full_trimester" && r.status === "pending"
      ).length,
    [filteredByPeriodAndSearch]
  );

  const blackoutTabCount = useMemo(
    () => filteredByPeriodAndSearch.filter((r) => r.request_scope === "blackout_dates").length,
    [filteredByPeriodAndSearch]
  );

  if (capsLoading) {
    return <div className="px-4 py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (!canView) {
    return <NotAuthorized />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Button asChild variant="ghost" className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground">
        <Link to="/admin-tools">
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Tools
        </Link>
      </Button>

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Coffee className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-bold text-foreground">Breaks & Blackouts</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          View trimester break requests and volunteer blackout dates across campuses.
        </p>
      </div>

      <Tabs defaultValue="breaks">
        <TabsList>
          <TabsTrigger value="breaks" className="gap-1.5">
            <Coffee className="h-3.5 w-3.5" />
            Break Requests
            {pendingBreakCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {pendingBreakCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="blackouts" className="gap-1.5">
            <CalendarOff className="h-3.5 w-3.5" />
            Blackout Dates
            {blackoutTabCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {blackoutTabCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="breaks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Break requests</CardTitle>
              <CardDescription>
                Full-trimester break requests. Approve or deny pending ones here, or continue in Team Builder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FiltersBar
                search={search}
                onSearchChange={setSearch}
                periodKey={periodKey}
                onPeriodChange={setPeriodKey}
                periodOptions={periodOptions}
                status={breakStatus}
                onStatusChange={setBreakStatus}
                showStatus
              />

              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : breakRequests.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No break requests match these filters.
                </p>
              ) : (
                <div className="space-y-2">
                  {breakRequests.map((request) => (
                    <BreakRequestRow
                      key={request.id}
                      request={request}
                      onApprove={() =>
                        reviewRequest.mutate({ requestId: request.id, status: "approved" })
                      }
                      onDeny={() =>
                        reviewRequest.mutate({ requestId: request.id, status: "denied" })
                      }
                      isLoading={reviewRequest.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blackouts" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Blackout dates</CardTitle>
              <CardDescription>
                Specific weekends volunteers marked unavailable. These are auto-approved when submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FiltersBar
                search={search}
                onSearchChange={setSearch}
                periodKey={periodKey}
                onPeriodChange={setPeriodKey}
                periodOptions={periodOptions}
                status={blackoutStatus}
                onStatusChange={setBlackoutStatus}
                showStatus
              />

              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : blackoutRequests.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No blackout dates match these filters.
                </p>
              ) : (
                <div className="space-y-2">
                  {blackoutRequests.map((request) => (
                    <BlackoutRow key={request.id} request={request} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
