import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"

export default function PlanningCenter() {
  const [loading, setLoading] = useState(false)
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true)
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [googleConnectedAt, setGoogleConnectedAt] = useState<string | null>(null)
  const [googleStatusError, setGoogleStatusError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const googleConnected = searchParams.get("google_connected") === "1"
  const googleError = searchParams.get("error")

  const loadGoogleConnectionStatus = async () => {
    setGoogleStatusLoading(true)
    setGoogleStatusError(null)
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        throw new Error(userError.message || "Unable to load signed-in user")
      }

      if (!user) {
        setIsGoogleConnected(false)
        setGoogleConnectedAt(null)
        return
      }

      const supabaseAny = supabase as any
      const { data, error } = await supabaseAny
        .from("google_integrations")
        .select("id, updated_at, created_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        throw new Error(error.message || "Failed to load Google connection status")
      }

      const connected = Boolean(data?.id)
      setIsGoogleConnected(connected)
      setGoogleConnectedAt(connected ? data?.updated_at ?? data?.created_at ?? null : null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Google connection status"
      setGoogleStatusError(message)
      setIsGoogleConnected(false)
      setGoogleConnectedAt(null)
    } finally {
      setGoogleStatusLoading(false)
    }
  }

  useEffect(() => {
    void loadGoogleConnectionStatus()
  }, [googleConnected])

  const clearGoogleQueryParams = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("google_connected")
    next.delete("error")
    setSearchParams(next, { replace: true })
  }

  const handleConnectGoogleCalendar = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-start")

      if (error) {
        let details = error.message || "Failed to start Google auth"
        const response = (error as { context?: Response }).context
        if (response) {
          try {
            const payload = await response.json()
            if (payload?.error) details = payload.error
          } catch (_ignored) {
            // Keep default details when response body is not JSON.
          }
        }
        throw new Error(details)
      }

      if (!data?.url) {
        throw new Error("Google auth URL was not returned")
      }

      window.location.href = data.url
    } catch (error) {
      console.error("Failed to start Google auth:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Integrations</h1>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Planning Center</h2>
        <p className="text-sm text-gray-400">
          Sync your Planning Center team and schedule data.
        </p>
        <div className="text-green-500 font-medium">Connected</div>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Google Calendar</h2>
        <p className="text-sm text-gray-400">
          Sync scheduled dates to Google Calendar.
        </p>

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
          {googleStatusError && (
            <div className="mt-2 text-red-300">Status check failed: {googleStatusError}</div>
          )}
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

        <button
          onClick={handleConnectGoogleCalendar}
          disabled={loading}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded text-white disabled:opacity-50"
        >
          {loading ? "Connecting..." : "Connect Google Calendar"}
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
  )
}
