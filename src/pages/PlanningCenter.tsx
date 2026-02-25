import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface SyncSummary {
  sourceCount: number;
  eventCount: number;
  setlistCount: number;
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
    // Keep the original error message when response body is not JSON.
  }

  return details;
};

export default function PlanningCenter() {
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleConnectedAt, setGoogleConnectedAt] = useState<string | null>(null);
  const [googleStatusError, setGoogleStatusError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  const autoSyncAttemptedRef = useRef(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const googleConnected = searchParams.get("google_connected") === "1";
  const googleError = searchParams.get("error");

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
        .select("id, updated_at, created_at")
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
    setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Integrations</h1>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Planning Center</h2>
        <p className="text-sm text-gray-400">Sync your Planning Center team and schedule data.</p>
        <div className="text-green-500 font-medium">Connected</div>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Google Calendar</h2>
        <p className="text-sm text-gray-400">Sync scheduled dates to Google Calendar.</p>

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
              {syncSummary.setlistCount} setlist(s)
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
          <button
            onClick={handleConnectGoogleCalendar}
            disabled={loading}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded text-white disabled:opacity-50"
          >
            {loading ? "Connecting..." : isGoogleConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </button>

          <button
            onClick={handleGoogleResync}
            disabled={syncLoading || !isGoogleConnected}
            className="px-6 py-3 bg-sky-600 hover:bg-sky-700 rounded text-white disabled:opacity-50"
          >
            {syncLoading ? "Syncing..." : "Sync Upcoming Dates Now"}
          </button>

          {(googleConnected || googleError) && (
            <button
              onClick={clearGoogleQueryParams}
              className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            >
              Clear status
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
