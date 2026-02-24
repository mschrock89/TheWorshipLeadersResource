import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"

export default function PlanningCenter() {
  const [loading, setLoading] = useState(false)

  const handleConnectGoogleCalendar = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(
      "https://fgemlokxbugfihaxbfyp.functions.supabase.co/google-calendar-auth-start",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to start Google auth")
    }

    window.location.href = data.url
  } catch (error) {
    console.error("Failed to start Google auth:", error)
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

        <button
          onClick={handleConnectGoogleCalendar}
          disabled={loading}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded text-white disabled:opacity-50"
        >
          {loading ? "Connecting..." : "Connect Google Calendar"}
        </button>
      </div>
    </div>
  )
}