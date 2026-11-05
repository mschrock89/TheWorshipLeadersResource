import { Loader2, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAdminPushPrefs, useAdminPushSettings, useSetAdminPushPref } from "@/hooks/useAdminPushPrefs";
import { ADMIN_PUSH_GROUPS, adminPushChannelEnabled } from "@/lib/adminPushPrefs";

interface AdminPushPreferencesProps {
  userId: string;
  campuses: Array<{ id: string; name: string }>;
  canEdit: boolean;
}

export function AdminPushPreferences({ userId, campuses, canEdit }: AdminPushPreferencesProps) {
  const prefsQuery = useAdminPushPrefs(userId);
  const settingsQuery = useAdminPushSettings(userId);
  const setPref = useSetAdminPushPref();
  const prefs = prefsQuery.data ?? [];
  const explicitOnly = settingsQuery.data?.explicit_only === true;
  const isLoading = prefsQuery.isLoading || settingsQuery.isLoading;
  const failed = prefsQuery.isError || settingsQuery.isError;

  return (
    <div className="space-y-4">
      <div>
        <Label className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Admin notifications by campus
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the leadership notifications this person gets at each campus. Serving reminders, chat, and a swap sent directly to them stay separate.
        </p>
      </div>

      {failed ? (
        <p className="text-sm text-muted-foreground">Couldn’t load notification choices.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notification choices…
        </div>
      ) : campuses.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No campuses to configure.</p>
      ) : (
        <div className="space-y-4">
          {campuses.map((campus) => (
            <div key={campus.id} className="space-y-4 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {campus.name}
              </p>

              {ADMIN_PUSH_GROUPS.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {group.channels.map((channel) => {
                      const saved = prefs.find(
                        (pref) => pref.campus_id === campus.id && pref.channel === channel.key,
                      );
                      const checked = adminPushChannelEnabled({
                        explicitOnly,
                        enabled: saved ? saved.enabled : null,
                      });
                      const inputId = `admin-push-${campus.id}-${channel.key}`;

                      return (
                        <label
                          key={channel.key}
                          htmlFor={inputId}
                          className="flex min-w-[160px] items-center gap-2 text-sm"
                        >
                          <Checkbox
                            id={inputId}
                            className="h-3.5 w-3.5"
                            checked={checked}
                            disabled={!canEdit || setPref.isPending}
                            onCheckedChange={(value) => {
                              setPref.mutate({
                                userId,
                                campusId: campus.id,
                                channel: channel.key,
                                enabled: value === true,
                              });
                            }}
                          />
                          {channel.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
