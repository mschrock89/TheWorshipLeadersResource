import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useDisconnectPco,
  usePcoConnection,
  useSavePcoConnection,
  useStartPcoAuth,
  useSyncPcoPlans,
  useSyncPcoTeam,
  useUpdatePcoSettings,
} from "@/hooks/usePlanningCenter";
import { useCampuses } from "@/hooks/useCampuses";
import { MemberCleanupDialog } from "@/components/team/MemberCleanupDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertCircle,
  CheckCircle2,
  Home,
  Link2,
  Loader2,
  Music,
  RefreshCw,
  Unlink,
  UserX,
} from "lucide-react";

interface SyncSummary {
  sourceCount: number;
  eventCount: number;
  setlistCount: number;
  scheduleCount: number;
  created: number;
  updated: number;
  removed: number;
  failed: number;
  syncedAt: string | null;
}

const getFunctionAuthHeaders = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("missing_session_access_token");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
};

const extractFunctionErrorMessage = async (error: unknown): Promise<string> => {
  if (!(error instanceof Error)) {
    return "Edge Function returned a non-2xx status code";
  }

  let details = error.message || "Edge Function returned a non-2xx status code";
  const response = (error as { context?: Response }).context;
  if (!response) {
    return details;
  }

  try {
    const payload = await response.json();
    if (payload?.error && payload?.details) {
      details = `${payload.error}:${payload.details}`;
    } else if (payload?.error) {
      details = payload.error;
    }
  } catch {
    // Keep original message when response body is not JSON.
  }

  return details;
};

export default function PlanningCenter() {
  const { canManageTeam } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleConnectedAt, setGoogleConnectedAt] = useState<string | null>(null);
  const [googleStatusError, setGoogleStatusError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  const autoSyncAttemptedRef = useRef(false);

  const googleConnected = searchParams.get("google_connected") === "1";
  const googleError = searchParams.get("error");

  const { data: connection, isLoading: connectionLoading } = usePcoConnection();
  const { data: campuses } = useCampuses();
  const startAuth = useStartPcoAuth();
  const saveConnection = useSavePcoConnection();
  const disconnect = useDisconnectPco();
  const syncTeam = useSyncPcoTeam();
  const syncPlans = useSyncPcoPlans();
  const updateSettings = useUpdatePcoSettings();

  // Handle PCO OAuth callback.
  useEffect(() => {
    const connectionCode = searchParams.get("pco_connection");
    const error = searchParams.get("error");

    if (connectionCode) {
      saveConnection.mutate(connectionCode);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("pco_connection");
        next.delete("error");
        return next;
      }, { replace: true });
    }

    // For PCO callback errors only, clear params after hooks show toast.
    if (error && !googleConnected) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("error");
        return next;
      }, { replace: true });
    }
  }, [googleConnected, saveConnection, searchParams, setSearchParams]);

  const loadGoogleConnectionStatus = async () => {
    setGoogleStatusLoading(true);
    setGoogleStatusError(null);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message || "Unable to load signed-in user");
      }

      if (!user) {
        setIsGoogleConnected(false);
        setGoogleConnectedAt(null);
        return;
      }

      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("google_integrations")
        .select("id,updated_at,created_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to load Google connection status");
      }

      const connected = Boolean(data?.id);
      setIsGoogleConnected(connected);
      setGoogleConnectedAt(connected ? data?.updated_at ?? data?.created_at ?? null : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Google connection status";
      setGoogleStatusError(message);
      setIsGoogleConnected(false);
      setGoogleConnectedAt(null);
    } finally {
      setGoogleStatusLoading(false);
    }
  };

  const handleGoogleResync = async () => {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("google-calendar-resync", {
        headers,
        body: {},
      });

      if (error) {
        throw new Error(await extractFunctionErrorMessage(error));
      }

      setSyncSummary({
        sourceCount: data?.totals?.source_count ?? 0,
        eventCount: data?.totals?.event_count ?? 0,
        setlistCount: data?.totals?.setlist_count ?? 0,
        scheduleCount: data?.totals?.schedule_count ?? 0,
        created: data?.results?.created ?? 0,
        updated: data?.results?.updated ?? 0,
        removed: data?.results?.removed ?? 0,
        failed: data?.results?.failed ?? 0,
        syncedAt: data?.synced_at ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync Google Calendar";
      setSyncError(message);
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    void loadGoogleConnectionStatus();
  }, [googleConnected]);

  useEffect(() => {
    if (!googleConnected || !isGoogleConnected || autoSyncAttemptedRef.current) {
      return;
    }

    autoSyncAttemptedRef.current = true;
    void handleGoogleResync();
  }, [googleConnected, isGoogleConnected]);

  const clearGoogleQueryParams = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("google_connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
  };

  const handleConnectGoogleCalendar = async () => {
    setGoogleLoading(true);
    setSyncError(null);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-start", {
        headers,
      });

      if (error) {
        throw new Error(await extractFunctionErrorMessage(error));
      }

      if (!data?.url) {
        throw new Error("Google auth URL was not returned");
      }

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Google auth";
      setGoogleStatusError(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleConnectPco = () => {
    startAuth.mutate(selectedCampus === "all" ? undefined : selectedCampus || undefined);
  };

  const handleSettingChange = (setting: string, value: boolean) => {
    updateSettings.mutate({ [setting]: value });
  };

  if (!canManageTeam) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need to be a Campus Pastor or Leader to access Planning Center integration.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (connectionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <Breadcrumb className="mb-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard" className="flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Planning Center</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-3xl font-bold text-foreground">Planning Center</h1>
        <p className="text-muted-foreground mt-2">
          Connect your Planning Center account to sync team member data.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {connection ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Connected
              </>
            ) : (
              <>
                <Link2 className="h-5 w-5" />
                Connect Account
              </>
            )}
          </CardTitle>
          <CardDescription>
            {connection
              ? `Connected to ${connection.pco_organization_name || "Planning Center"}`
              : "Link your Planning Center account to import and sync team data."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {connection ? (
            <>
              <div className="p-4 rounded-lg bg-muted/50">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd className="text-foreground text-right">{connection.pco_organization_name || "Unknown"}</dd>

                  <dt className="text-muted-foreground">Connected</dt>
                  <dd className="text-foreground text-right">
                    {format(new Date(connection.connected_at), "MMM d, yyyy 'at' h:mm a")}
                  </dd>

                  {connection.last_sync_at && (
                    <>
                      <dt className="text-muted-foreground">Last Sync</dt>
                      <dd className="text-foreground text-right">
                        {format(new Date(connection.last_sync_at), "MMM d, yyyy 'at' h:mm a")}
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-foreground">What to Sync</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="sync_team_members"
                      checked={connection.sync_team_members}
                      onCheckedChange={(checked) => handleSettingChange("sync_team_members", !!checked)}
                    />
                    <Label htmlFor="sync_team_members" className="text-sm">
                      Team members (names, emails)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="sync_phone_numbers"
                      checked={connection.sync_phone_numbers}
                      onCheckedChange={(checked) => handleSettingChange("sync_phone_numbers", !!checked)}
                    />
                    <Label htmlFor="sync_phone_numbers" className="text-sm">
                      Phone numbers
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="sync_birthdays"
                      checked={connection.sync_birthdays}
                      onCheckedChange={(checked) => handleSettingChange("sync_birthdays", !!checked)}
                    />
                    <Label htmlFor="sync_birthdays" className="text-sm">
                      Birthdays & anniversaries
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="sync_positions"
                      checked={connection.sync_positions}
                      onCheckedChange={(checked) => handleSettingChange("sync_positions", !!checked)}
                    />
                    <Label htmlFor="sync_positions" className="text-sm">
                      Team positions
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-border">
                <h3 className="font-medium text-foreground">Filter Options</h3>
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="sync_active_only"
                    checked={connection.sync_active_only}
                    onCheckedChange={(checked) => handleSettingChange("sync_active_only", !!checked)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="sync_active_only" className="text-sm">
                      Only sync active members
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Only import members who have been scheduled in the last year. Disable to sync all team members
                      regardless of activity.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-border">
                <h3 className="font-medium text-foreground">Data Cleanup</h3>
                <div className="flex items-start space-x-3">
                  <UserX className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="space-y-2 flex-1">
                    <p className="text-sm text-muted-foreground">
                      Remove members who were imported but have never been scheduled to serve.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCleanupDialogOpen(true)}
                      disabled={!connection.campus_id}
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Clean Up Inactive Members
                    </Button>
                    {!connection.campus_id && (
                      <p className="text-xs text-amber-600">
                        Cleanup is only available when connected to a specific campus.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <div className="flex gap-3">
                  <Button
                    onClick={() => syncTeam.mutate()}
                    disabled={syncTeam.isPending || syncPlans.isPending}
                    className="flex-1"
                  >
                    {syncTeam.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Team
                  </Button>
                  <Button
                    onClick={() => syncPlans.mutate()}
                    disabled={syncPlans.isPending || syncTeam.isPending}
                    variant="secondary"
                    className="flex-1"
                  >
                    {syncPlans.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Music className="h-4 w-4 mr-2" />
                    )}
                    Sync Plans
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                  className="w-full"
                >
                  {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}
                  Disconnect
                </Button>
              </div>

              <MemberCleanupDialog
                open={cleanupDialogOpen}
                onOpenChange={setCleanupDialogOpen}
                campusId={connection.campus_id || undefined}
                campusName={campuses?.find((campus) => campus.id === connection.campus_id)?.name}
              />
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="campus">Select Campus (Optional)</Label>
                <Select value={selectedCampus} onValueChange={setSelectedCampus}>
                  <SelectTrigger id="campus">
                    <SelectValue placeholder="All campuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All campuses</SelectItem>
                    {campuses?.map((campus) => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">New team members will be assigned to this campus.</p>
              </div>

              <Button onClick={handleConnectPco} disabled={startAuth.isPending} className="w-full">
                {startAuth.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect to Planning Center
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Planning Center to authorize access.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Sync scheduled dates to Google Calendar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded border border-border bg-muted/20 p-3 text-sm">
            {googleStatusLoading ? (
              <span className="text-muted-foreground">Checking Google connection status...</span>
            ) : isGoogleConnected ? (
              <span className="text-green-400">
                Connected
                {googleConnectedAt ? ` (updated ${new Date(googleConnectedAt).toLocaleString()})` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">Not connected</span>
            )}
            {googleStatusError && <div className="mt-2 text-red-300">Status check failed: {googleStatusError}</div>}
          </div>

          {googleConnected && (
            <div className="rounded border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
              Google Calendar connected successfully.
            </div>
          )}

          {googleError && (
            <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              Google Calendar error: {googleError}
            </div>
          )}

          {syncError && (
            <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              Sync failed: {syncError}
            </div>
          )}

          {syncSummary && (
            <div className="rounded border border-border bg-muted/20 p-3 text-sm space-y-1">
              <div>
                Synced {syncSummary.sourceCount} item(s): {syncSummary.eventCount} team event(s),{" "}
                {syncSummary.setlistCount} setlist(s), {syncSummary.scheduleCount} scheduled date(s)
              </div>
              <div>
                Created {syncSummary.created}, updated {syncSummary.updated}, removed {syncSummary.removed}, failed{" "}
                {syncSummary.failed}
              </div>
              {syncSummary.syncedAt && (
                <div className="text-muted-foreground">Last sync: {new Date(syncSummary.syncedAt).toLocaleString()}</div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleConnectGoogleCalendar} disabled={googleLoading}>
              {googleLoading ? "Connecting..." : isGoogleConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
            </Button>

            <Button onClick={handleGoogleResync} disabled={syncLoading || !isGoogleConnected} variant="secondary">
              {syncLoading ? "Syncing..." : "Sync Upcoming Dates Now"}
            </Button>

            {(googleConnected || googleError) && (
              <Button onClick={clearGoogleQueryParams} variant="outline">
                Clear status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
