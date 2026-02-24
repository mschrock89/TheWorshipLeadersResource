import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"

export default function PlanningCenter() {
  const [loading, setLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const googleConnected = searchParams.get("google_connected") === "1"
  const googleError = searchParams.get("error")

  const clearGoogleQueryParams = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("google_connected")
    next.delete("error")
    setSearchParams(next, { replace: true })
  }

  const handleConnectGoogleCalendar = async () => {
    setLoading(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        throw new Error(sessionError.message || "Failed to load auth session")
      }

      const accessToken = sessionData.session?.access_token
      const userId = sessionData.session?.user?.id
      if (!accessToken) {
        throw new Error("Not authenticated. Please sign in again.")
      }
      if (!userId) {
        throw new Error("No signed-in user ID found. Please sign in again.")
      }

      const { data, error } = await supabase.functions.invoke("google-calendar-auth-start", {
        body: { userId },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (error) {
        throw new Error(error.message || "Failed to start Google auth")
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
