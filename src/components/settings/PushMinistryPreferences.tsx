import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useUserMinistryAssignments } from "@/hooks/useMinistryAssignments";
import { useMutedPushMinistryTypes, useTogglePushMinistryPref } from "@/hooks/usePushMinistryPrefs";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { CALENDAR_MINISTRY_FILTER_ORDER, getMinistryLabel } from "@/lib/constants";
import { uniqueNormalizedPushMinistryTypes } from "@/lib/pushMinistryPrefs";

function sortAssignedMinistries(ministryTypes: string[]) {
  const order = new Map(
    CALENDAR_MINISTRY_FILTER_ORDER.map((value, index) => [value, index]),
  );
  return [...ministryTypes].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return getMinistryLabel(left).localeCompare(getMinistryLabel(right));
  });
}

export function PushMinistryPreferences() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission } = usePushNotifications();
  const { data: assignments = [], isLoading: assignmentsLoading } =
    useUserMinistryAssignments(user?.id);
  const { muted, isLoading: prefsLoading } = useMutedPushMinistryTypes(user?.id);
  const togglePref = useTogglePushMinistryPref();

  if (!isSupported || permission === "denied" || !isSubscribed) {
    return null;
  }

  const assignedMinistries = sortAssignedMinistries(
    uniqueNormalizedPushMinistryTypes(assignments.map((row) => row.ministry_type)),
  );

  if (!assignmentsLoading && assignedMinistries.length === 0) {
    return null;
  }

  const isLoading = assignmentsLoading || prefsLoading;

  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-4">
      <div>
        <p className="text-sm font-medium">Ministries</p>
        <p className="text-xs text-muted-foreground">
          Choose which of your ministries can send you push notifications
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ministry preferences…
        </div>
      ) : (
        <div className="space-y-3">
          {assignedMinistries.map((ministryType) => {
            const enabled = !muted.has(ministryType);
            const switchId = `push-ministry-${ministryType}`;
            const isSaving =
              togglePref.isPending &&
              togglePref.variables?.ministryType === ministryType;

            return (
              <div key={ministryType} className="flex items-center justify-between gap-3">
                <Label htmlFor={switchId} className="cursor-pointer text-sm font-normal">
                  {getMinistryLabel(ministryType)}
                </Label>
                <div className="flex items-center gap-2">
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Switch
                    id={switchId}
                    checked={enabled}
                    disabled={togglePref.isPending}
                    onCheckedChange={(checked) => {
                      togglePref.mutate({ ministryType, enabled: checked });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
