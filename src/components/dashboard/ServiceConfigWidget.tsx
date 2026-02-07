import { useState } from "react";
import { useCampuses, Campus } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Check, X } from "lucide-react";
import { ServiceConfigDialog } from "./ServiceConfigDialog";

function formatTime(timeString: string): string {
  if (!timeString) return "-";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatTimes(times: string[] | null): string {
  if (!times || times.length === 0) return "-";
  return times.map(t => formatTime(t)).join(", ");
}

export function ServiceConfigWidget() {
  const { isAdmin } = useAuth();
  const { data: campuses = [], isLoading } = useCampuses();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Only show for organization admins
  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Service Schedule
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {campuses.map((campus: Campus) => (
              <div key={campus.id} className="border-b border-border pb-2 last:border-0">
                <p className="font-medium text-sm text-foreground">{campus.name}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    {campus.has_saturday_service ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground/50" />
                    )}
                    Sat {campus.has_saturday_service ? formatTimes(campus.saturday_service_time) : "-"}
                  </span>
                  <span className="flex items-center gap-1">
                    {campus.has_sunday_service ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground/50" />
                    )}
                    Sun {campus.has_sunday_service ? formatTimes(campus.sunday_service_time) : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ServiceConfigDialog open={dialogOpen} onOpenChange={setDialogOpen} campuses={campuses} />
    </>
  );
}
