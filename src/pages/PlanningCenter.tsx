import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Loader2, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, UserX, Home, Music } from "lucide-react";
import { usePcoConnection, useStartPcoAuth, useSavePcoConnection, useDisconnectPco, useSyncPcoTeam, useSyncPcoPlans, useUpdatePcoSettings } from "@/hooks/usePlanningCenter";
import {
  useDisconnectGoogleCalendar,
  useGoogleCalendars,
  useGoogleCalendarConnection,
  useResyncGoogleCalendar,
  useSaveGoogleCalendarConnection,
  useStartGoogleCalendarAuth,
  useUpdateGoogleCalendarSettings,
} from "@/hooks/useGoogleCalendar";
import { useCampuses } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { MemberCleanupDialog } from "@/components/team/MemberCleanupDialog";
import { supabase } from "@/integrations/supabase/client";

async function getAuthHeaders() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }

  if (session?.access_token) {
    const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
    if (userError || !userData?.user) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session ?? null;
    }
  }

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return session?.access_token
    ? {
        Authorization: `Bearer ${session.access_token}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      }
    : undefined;
}

export default function PlanningCenter() {
  const { canManageTeam } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const processedPcoCodeRef = useRef<string | null>(null);
  const processedGoogleCodeRef = useRef<string | null>(null);
  
  const { data: connection, isLoading: connectionLoading } = usePcoConnection();
  const { data: campuses } = useCampuses();
  const startAuth = useStartPcoAuth();
  const saveConnection = useSavePcoConnection();
  const disconnect = useDisconnectPco();
  const syncTeam = useSyncPcoTeam();
  const syncPlans = useSyncPcoPlans();
  const updateSettings = useUpdatePcoSettings();
  const { data: googleStatus, isLoading: googleConnectionLoading } = useGoogleCalendarConnection();
  const startGoogleAuth = useStartGoogleCalendarAuth();
  const saveGoogleConnection = useSaveGoogleCalendarConnection();
  const disconnectGoogle = useDisconnectGoogleCalendar();
  const updateGoogleSettings = useUpdateGoogleCalendarSettings();
  const resyncGoogle = useResyncGoogleCalendar();
  const googleConnection = googleStatus?.connection || null;
  const { data: googleCalendars = [] } = useGoogleCalendars(Boolean(googleConnection));

  // Handle OAuth callback
  useEffect(() => {
    const connectionCode = searchParams.get("pco_connection");
    const googleConnectionCode = searchParams.get("google_connection");
    const googleConnected = searchParams.get("google_connected");
    const error = searchParams.get("error");
    const googleError = searchParams.get("google_error");

    if (connectionCode && processedPcoCodeRef.current !== connectionCode) {
      processedPcoCodeRef.current = connectionCode;
      saveConnection.mutate(connectionCode);
      // Clear the URL params
      setSearchParams({});
    }

    if (googleConnectionCode && processedGoogleCodeRef.current !== googleConnectionCode) {
      processedGoogleCodeRef.current = googleConnectionCode;
      let cancelled = false;

      const saveGoogleWithAuthRetry = async () => {
        const maxAttempts = 8;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (cancelled) return;

          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            await supabase.auth.refreshSession();
            await new Promise((resolve) => setTimeout(resolve, 400));
            continue;
          }

          try {
            await saveGoogleConnection.mutateAsync(googleConnectionCode);
            if (!cancelled) setSearchParams({});
            return;
          } catch (e) {
            const status = (e as unknown as { context?: { status?: number } })?.context?.status;
            if (status === 401 && attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }
            throw e;
          }
        }

        if (!cancelled) {
          toast({
            title: "Google Calendar connection failed",
            description: "Your session was not ready after redirect. Please try again.",
            variant: "destructive",
          });
          setSearchParams({});
        }
      };

      saveGoogleWithAuthRetry();
      return () => {
        cancelled = true;
      };
    }

    if (googleConnected === "1") {
      toast({
        title: "Google Calendar connected",
        description: "Your setlists and events can now sync automatically.",
      });
      setSearchParams({});
    }

    if (error) {
      // Error is shown via toast in the hook
      setSearchParams({});
    }

    if (googleError) {
      toast({
        title: "Google Calendar connection failed",
        description: googleError,
        variant: "destructive",
      });
      setSearchParams({});
    }
  }, [searchParams, saveConnection, saveGoogleConnection, setSearchParams, toast]);

  const handleConnect = () => {
    startAuth.mutate(selectedCampus === "all" ? undefined : selectedCampus || undefined);
  };

  const handleSettingChange = (setting: string, value: boolean) => {
    updateSettings.mutate({ [setting]: value });
  };

  const handleGoogleSettingChange = (setting: "syncSetlists" | "syncEvents", value: boolean) => {
    updateGoogleSettings.mutate({
      [setting]: value,
    });
  };

  if (!canManageTeam) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
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
      </>
    );
  }

  if (connectionLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (googleConnectionLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container max-w-2xl py-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-4">
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

        <div className="mb-8">
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
                {/* Connection Info */}
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

                {/* Sync Options */}
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

                {/* Active Members Filter */}
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
                        Only import members who have been scheduled in the last year. Disable to sync all team members regardless of activity.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Member Cleanup Section */}
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

                {/* Action Buttons */}
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
                    {disconnect.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Disconnect
                  </Button>
                </div>

                {/* Cleanup Dialog */}
                <MemberCleanupDialog
                  open={cleanupDialogOpen}
                  onOpenChange={setCleanupDialogOpen}
                  campusId={connection.campus_id || undefined}
                  campusName={campuses?.find(c => c.id === connection.campus_id)?.name}
                />
              </>
            ) : (
              <>
                {/* Campus Selection */}
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
                  <p className="text-xs text-muted-foreground">
                    New team members will be assigned to this campus.
                  </p>
                </div>

                {/* Connect Button */}
                <Button
                  onClick={handleConnect}
                  disabled={startAuth.isPending}
                  className="w-full"
                >
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

        <Card className="bg-card border-border mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {googleConnection ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Google Calendar Connected
                </>
              ) : (
                <>
                  <Link2 className="h-5 w-5" />
                  Google Calendar
                </>
              )}
            </CardTitle>
            <CardDescription>
              {googleConnection
                ? "Automatically sync published setlists and events to your Google Calendar."
                : "Connect Google Calendar to auto-sync your published setlists and team events."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {googleConnection ? (
              <>
                <div className="p-4 rounded-lg bg-muted/50">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Google Account</dt>
                    <dd className="text-foreground text-right">{googleConnection.google_email || "Connected"}</dd>
                    <dt className="text-muted-foreground">Calendar</dt>
                    <dd className="text-foreground text-right">{googleConnection.calendar_name || googleConnection.calendar_id}</dd>
                    <dt className="text-muted-foreground">Connected</dt>
                    <dd className="text-foreground text-right">
                      {format(new Date(googleConnection.connected_at), "MMM d, yyyy 'at' h:mm a")}
                    </dd>
                    {googleConnection.last_synced_at && (
                      <>
                        <dt className="text-muted-foreground">Last Sync</dt>
                        <dd className="text-foreground text-right">
                          {format(new Date(googleConnection.last_synced_at), "MMM d, yyyy 'at' h:mm a")}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={googleConnection.last_sync_status === "failed" ? "destructive" : "secondary"}>
                    {googleConnection.last_sync_status === "failed" ? "Sync Error" : "Sync Healthy"}
                  </Badge>
                  {googleConnection.last_sync_error && (
                    <span className="text-xs text-muted-foreground truncate">
                      {googleConnection.last_sync_error}
                    </span>
                  )}
                </div>
                <div className="space-y-4 p-4 rounded-lg border border-border">
                  <h4 className="font-medium text-sm">Google Sync Settings</h4>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="google-sync-setlists"
                      checked={googleConnection.sync_setlists !== false}
                      onCheckedChange={(checked) => handleGoogleSettingChange("syncSetlists", Boolean(checked))}
                    />
                    <Label htmlFor="google-sync-setlists" className="text-sm">
                      Sync published setlists
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="google-sync-events"
                      checked={googleConnection.sync_events !== false}
                      onCheckedChange={(checked) => handleGoogleSettingChange("syncEvents", Boolean(checked))}
                    />
                    <Label htmlFor="google-sync-events" className="text-sm">
                      Sync team events
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-picker" className="text-sm">Default Google Calendar</Label>
                    <Select
                      value={googleConnection.calendar_id || "primary"}
                      onValueChange={(value) => {
                        const selected = googleCalendars.find((c) => c.id === value);
                        updateGoogleSettings.mutate({
                          calendarId: value,
                          calendarName: selected?.summary || value,
                        });
                      }}
                    >
                      <SelectTrigger id="google-calendar-picker">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(googleCalendars.length > 0 ? googleCalendars : [{ id: "primary", summary: "Primary Calendar", primary: true, accessRole: "owner" }]).map((calendar) => (
                          <SelectItem key={calendar.id} value={calendar.id}>
                            {calendar.summary}{calendar.primary ? " (Primary)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => resyncGoogle.mutate()}
                  disabled={resyncGoogle.isPending}
                  className="w-full"
                >
                  {resyncGoogle.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Re-sync My Calendar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => disconnectGoogle.mutate()}
                  disabled={disconnectGoogle.isPending}
                  className="w-full"
                >
                  {disconnectGoogle.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Unlink className="h-4 w-4 mr-2" />
                  )}
                  Disconnect Google Calendar
                </Button>
              </>
            ) : (
              <Button
                onClick={() => startGoogleAuth.mutate()}
                disabled={startGoogleAuth.isPending}
                className="w-full"
              >
                {startGoogleAuth.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect Google Calendar
              </Button>
            )}
          </CardContent>
        </Card>

        {googleStatus?.isAdmin && (
          <Card className="bg-card border-border mt-6">
            <CardHeader>
              <CardTitle>Google Sync Troubleshooting</CardTitle>
              <CardDescription>
                Recent failed Google Calendar syncs across the org.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const headers = await getAuthHeaders();
                      if (!headers) throw new Error("Not authenticated");
                      const { data, error } = await supabase.functions.invoke("google-calendar-process-queue", { headers });
                      if (error) throw error;
                      toast({
                        title: "Retry queue processed",
                        description: `${data?.processed || 0} jobs checked.`,
                      });
                    } catch (error) {
                      toast({
                        title: "Queue retry failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Retry Failed Queue
                </Button>
              </div>
              {googleStatus.recentFailures?.length ? (
                <div className="space-y-2">
                  {googleStatus.recentFailures.map((failure) => (
                    <div key={failure.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {failure.user_name || failure.user_id} · {failure.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(failure.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {failure.error_message || "Unknown error"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent sync failures.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
