import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Loader2, Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses } from "@/hooks/useCampuses";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  useDeleteServiceScript,
  useNotifyServiceScript,
  useSaveServiceScript,
  useServiceScripts,
  type ServiceScriptNotifyEvent,
  type ServiceScriptNotifyResult,
  type ServiceScriptRow,
} from "@/hooks/useServiceScripts";
import { getViewMinistryFilterOptions } from "@/lib/constants";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import {
  canManageServiceScripts,
  currentMonthStart,
  defaultScriptMinistry,
  formatScriptMonthLabel,
  formatScriptWeekendLabel,
  SERVICE_SCRIPT_KIND_LABELS,
  SERVICE_SCRIPT_KINDS,
  shiftMonthStart,
  weekendStartsInMonth,
  type ServiceScriptKind,
  type ServiceScriptStatus,
} from "@/lib/serviceScripts";

type Draft = {
  id: string | null;
  body: string;
  status: ServiceScriptStatus;
  sentAt: string | null;
};

const KIND_ICONS = {
  announcement: Megaphone,
  closing_prayer: Heart,
} as const;

function draftFromRow(row?: ServiceScriptRow): Draft {
  return {
    id: row?.id ?? null,
    body: row?.body ?? "",
    status: row?.status ?? "draft",
    sentAt: row?.sent_at ?? null,
  };
}

function notifySummary(result: ServiceScriptNotifyResult, event: ServiceScriptNotifyEvent) {
  if (result.recipients === 0) {
    return "Saved. Nobody is scheduled for this role in that window yet, so no notification went out.";
  }
  const people = `${result.recipients} ${result.recipients === 1 ? "person" : "people"}`;
  if (event === "removed") return `Removed the tweak and notified ${people}.`;
  if (event === "updated") return `Updated the script and notified ${people}.`;
  return `Sent the script to ${people}.`;
}

function ScriptKindCard({
  kind,
  rows,
  campusId,
  ministryType,
  monthStart,
  weekends,
  userId,
}: {
  kind: ServiceScriptKind;
  rows: ServiceScriptRow[];
  campusId: string;
  ministryType: string;
  monthStart: string;
  weekends: string[];
  userId: string;
}) {
  const saveScript = useSaveServiceScript();
  const deleteScript = useDeleteServiceScript();
  const notifyScript = useNotifyServiceScript();
  const [monthly, setMonthly] = useState<Draft>(() => draftFromRow(rows.find((row) => !row.weekend_date)));
  const [weeks, setWeeks] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    for (const weekend of weekends) {
      initial[weekend] = draftFromRow(rows.find((row) => row.weekend_date === weekend));
    }
    return initial;
  });
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(
    () => new Set(rows.filter((row) => row.weekend_date && row.body.trim()).map((row) => row.weekend_date as string)),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const Icon = KIND_ICONS[kind];
  const label = SERVICE_SCRIPT_KIND_LABELS[kind];
  const monthlyChanged = monthly.body.trim() !== (rows.find((row) => !row.weekend_date)?.body || "").trim();

  const persist = async (
    target: "month" | string,
    status: ServiceScriptStatus,
    event?: ServiceScriptNotifyEvent,
  ) => {
    const draft = target === "month" ? monthly : weeks[target];
    if (!draft) return;
    const body = draft.body.trim();
    const key = target === "month" ? "month" : target;
    setPendingKey(key);

    try {
      if (!body) {
        if (!draft.id) return;
        if (draft.status === "sent") {
          const result = await notifyScript.mutateAsync({ scriptId: draft.id, event: "removed" });
          toast.success(notifySummary(result, "removed"));
        }
        await deleteScript.mutateAsync(draft.id);
        const cleared = draftFromRow();
        if (target === "month") setMonthly(cleared);
        else setWeeks((current) => ({ ...current, [target]: cleared }));
        if (draft.status !== "sent") toast.success("Tweak removed.");
        return;
      }

      const saved = await saveScript.mutateAsync({
        id: draft.id,
        campusId,
        ministryType,
        scriptKind: kind,
        monthStart,
        weekendDate: target === "month" ? null : target,
        body,
        status,
        userId,
      });

      const nextDraft: Draft = {
        id: saved.id,
        body: saved.body,
        status: saved.status,
        sentAt: saved.sent_at,
      };
      if (target === "month") setMonthly(nextDraft);
      else setWeeks((current) => ({ ...current, [target]: nextDraft }));

      if (status === "sent" && event) {
        const result = await notifyScript.mutateAsync({ scriptId: saved.id, event });
        toast.success(notifySummary(result, event));
      } else {
        toast.success("Draft saved.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save the script.";
      toast.error(message);
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icon className="h-5 w-5 text-primary" />
              {label}
            </CardTitle>
            <CardDescription className="mt-1">
              This is the script for the whole month. Open a weekend below when that week needs different wording.
            </CardDescription>
          </div>
          <Badge variant={monthly.status === "sent" ? "default" : "secondary"}>
            {monthly.status === "sent" ? "Sent" : "Draft"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Textarea
          value={monthly.body}
          onChange={(event) => setMonthly((current) => ({ ...current, body: event.target.value }))}
          placeholder={`Write the ${label.toLowerCase()} script for ${formatScriptMonthLabel(monthStart)}…`}
          className="min-h-[180px] text-base leading-6"
        />
        <div className="flex flex-wrap gap-2">
          {monthly.status !== "sent" && (
            <Button
              type="button"
              variant="outline"
              disabled={pendingKey !== null || !monthly.body.trim()}
              onClick={() => persist("month", "draft")}
            >
              {pendingKey === "month" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save draft
            </Button>
          )}
          <Button
            type="button"
            disabled={pendingKey !== null || !monthly.body.trim()}
            onClick={() =>
              persist("month", "sent", monthly.status === "sent" ? "updated" : "sent")
            }
          >
            {pendingKey === "month" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {monthly.status === "sent" ? (monthlyChanged ? "Update & notify" : "Send again") : "Send to team"}
          </Button>
        </div>
        {monthly.sentAt && (
          <p className="text-sm text-muted-foreground">
            Last sent {new Date(monthly.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
          </p>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <h3 className="font-medium text-foreground">Weekly tweaks</h3>
            <p className="text-sm text-muted-foreground">
              A tweak replaces the monthly script for that weekend only.
            </p>
          </div>
          {weekends.map((weekend) => {
            const draft = weeks[weekend] || draftFromRow();
            const isOpen = openWeeks.has(weekend) || Boolean(draft.body.trim());
            return (
              <div key={weekend} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{formatScriptWeekendLabel(weekend)}</p>
                    {draft.status === "sent" && draft.body.trim() ? (
                      <Badge variant="outline">Sent</Badge>
                    ) : draft.body.trim() ? (
                      <Badge variant="secondary">Draft</Badge>
                    ) : null}
                  </div>
                  {!isOpen && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenWeeks((current) => new Set(current).add(weekend))}
                    >
                      Tweak this week
                    </Button>
                  )}
                </div>
                {isOpen && (
                  <div className="mt-3 space-y-3">
                    <Textarea
                      value={draft.body}
                      onChange={(event) =>
                        setWeeks((current) => ({
                          ...current,
                          [weekend]: { ...draft, body: event.target.value },
                        }))
                      }
                      placeholder="Leave this blank to keep using the monthly script."
                      className="min-h-[120px] text-base leading-6"
                    />
                    <div className="flex flex-wrap gap-2">
                      {draft.status !== "sent" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pendingKey !== null || (!draft.body.trim() && !draft.id)}
                          onClick={() => persist(weekend, "draft")}
                        >
                          {pendingKey === weekend ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {draft.body.trim() ? "Save tweak" : "Remove tweak"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={pendingKey !== null || (!draft.body.trim() && !draft.id)}
                        onClick={() => {
                          if (!draft.body.trim()) {
                            void persist(weekend, "draft");
                            return;
                          }
                          void persist(weekend, "sent", draft.status === "sent" ? "updated" : "sent");
                        }}
                      >
                        {pendingKey === weekend ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {!draft.body.trim()
                          ? "Remove & notify"
                          : draft.status === "sent"
                            ? "Update tweak & notify"
                            : "Send tweak"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ServiceScriptsAdmin() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles(user?.id);
  const { data: campuses = [], isLoading: campusesLoading } = useCampuses();
  const canManage = canManageServiceScripts(roles.map((role) => role.role));
  const ministries = useMemo(() => getViewMinistryFilterOptions(null), []);
  const [campusId, setCampusId] = useState(() => localStorage.getItem("service-scripts-campus") || "");
  const [ministryType, setMinistryType] = useState(
    () => localStorage.getItem("service-scripts-ministry") || defaultScriptMinistry(getCurrentResourceAppKey()),
  );
  const [monthStart, setMonthStart] = useState(() => currentMonthStart());

  const selectedCampusId = campusId || campuses[0]?.id || "";
  const weekends = useMemo(() => weekendStartsInMonth(monthStart), [monthStart]);
  const scriptsQuery = useServiceScripts(canManage ? selectedCampusId : null, ministryType, monthStart);

  const handleCampusChange = (value: string) => {
    setCampusId(value);
    localStorage.setItem("service-scripts-campus", value);
  };

  const handleMinistryChange = (value: string) => {
    setMinistryType(value);
    localStorage.setItem("service-scripts-ministry", value);
  };

  if (authLoading || rolesLoading || campusesLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl py-2 sm:py-8">
        <Skeleton className="mb-6 h-8 w-56" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!canManage || !user) {
    return (
      <div className="mx-auto w-full max-w-3xl py-8">
        <h1 className="font-display text-3xl font-bold">Service Scripts</h1>
        <p className="mt-2 text-muted-foreground">You need an admin role to write announcements and closing prayer scripts.</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-0 sm:py-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/admin-tools")}
        className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Tools
      </Button>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-foreground">Service Scripts</h1>
        <p className="mt-2 text-muted-foreground">
          Write the announcements and closing prayer scripts once for the month. Tweak a single weekend when that week needs something different. Sending a script notifies everyone scheduled for that role.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Campus</Label>
          <Select value={selectedCampusId} onValueChange={handleCampusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select campus" />
            </SelectTrigger>
            <SelectContent>
              {campuses.map((campus) => (
                <SelectItem key={campus.id} value={campus.id}>
                  {campus.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Ministry</Label>
          <Select value={ministryType} onValueChange={handleMinistryChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ministries.map((ministry) => (
                <SelectItem key={ministry.value} value={ministry.value}>
                  {ministry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => setMonthStart((current) => shiftMonthStart(current, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[9.5rem] text-center font-medium">{formatScriptMonthLabel(monthStart)}</div>
          <Button type="button" variant="outline" size="icon" onClick={() => setMonthStart((current) => shiftMonthStart(current, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        People scheduled for Announcements or Closing Prayer on this ministry get the script and a notification when you send or update it.
        {monthStart !== currentMonthStart() && (
          <Button type="button" variant="link" className="h-auto px-2" onClick={() => setMonthStart(currentMonthStart())}>
            Jump to this month
          </Button>
        )}
      </p>

      {scriptsQuery.isError && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Scripts couldn't be loaded. Apply the latest database migration, then refresh this page.
          </CardContent>
        </Card>
      )}

      {scriptsQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : selectedCampusId ? (
        <div className="space-y-6">
          {SERVICE_SCRIPT_KINDS.map((kind) => (
            <ScriptKindCard
              key={`${selectedCampusId}-${ministryType}-${monthStart}-${kind}`}
              kind={kind}
              rows={(scriptsQuery.data || []).filter((row) => row.script_kind === kind)}
              campusId={selectedCampusId}
              ministryType={ministryType}
              monthStart={monthStart}
              weekends={weekends}
              userId={user.id}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Add a campus before writing scripts.</p>
      )}

      <p className="mt-8 text-sm text-muted-foreground">
        Assigned people can read what you send from their dashboard or <Link to="/my-scripts" className="text-primary underline-offset-4 hover:underline">My Scripts</Link>.
      </p>
    </div>
  );
}
