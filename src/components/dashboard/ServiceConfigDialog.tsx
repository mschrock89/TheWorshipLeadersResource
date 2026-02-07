import { useState, useEffect } from "react";
import { Campus, useUpdateCampusServiceConfig } from "@/hooks/useCampuses";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, X } from "lucide-react";

interface ServiceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campuses: Campus[];
}

interface CampusServiceConfig {
  id: string;
  name: string;
  has_saturday_service: boolean;
  has_sunday_service: boolean;
  saturday_service_times: string[];
  sunday_service_times: string[];
}

export function ServiceConfigDialog({ open, onOpenChange, campuses }: ServiceConfigDialogProps) {
  const updateConfig = useUpdateCampusServiceConfig();
  const [configs, setConfigs] = useState<CampusServiceConfig[]>([]);

  // Initialize configs when dialog opens
  useEffect(() => {
    if (open && campuses.length > 0) {
      setConfigs(
        campuses.map((campus) => ({
          id: campus.id,
          name: campus.name,
          has_saturday_service: campus.has_saturday_service ?? false,
          has_sunday_service: campus.has_sunday_service ?? true,
          saturday_service_times: campus.saturday_service_time?.map(t => t.slice(0, 5)) || ["17:00"],
          sunday_service_times: campus.sunday_service_time?.map(t => t.slice(0, 5)) || ["10:00"],
        }))
      );
    }
  }, [open, campuses]);

  const toggleService = (campusId: string, field: "has_saturday_service" | "has_sunday_service") => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const newValue = !c[field];
        // If enabling and no times exist, add a default time
        if (newValue) {
          if (field === "has_saturday_service" && c.saturday_service_times.length === 0) {
            return { ...c, [field]: newValue, saturday_service_times: ["17:00"] };
          }
          if (field === "has_sunday_service" && c.sunday_service_times.length === 0) {
            return { ...c, [field]: newValue, sunday_service_times: ["10:00"] };
          }
        }
        return { ...c, [field]: newValue };
      })
    );
  };

  const addServiceTime = (campusId: string, day: "saturday" | "sunday") => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const field = day === "saturday" ? "saturday_service_times" : "sunday_service_times";
        const defaultTime = day === "saturday" ? "18:00" : "11:30";
        return { ...c, [field]: [...c[field], defaultTime] };
      })
    );
  };

  const removeServiceTime = (campusId: string, day: "saturday" | "sunday", index: number) => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const field = day === "saturday" ? "saturday_service_times" : "sunday_service_times";
        const newTimes = c[field].filter((_, i) => i !== index);
        return { ...c, [field]: newTimes };
      })
    );
  };

  const handleTimeChange = (campusId: string, day: "saturday" | "sunday", index: number, value: string) => {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== campusId) return c;
        const field = day === "saturday" ? "saturday_service_times" : "sunday_service_times";
        const newTimes = [...c[field]];
        newTimes[index] = value;
        return { ...c, [field]: newTimes };
      })
    );
  };

  const handleSave = async () => {
    await updateConfig.mutateAsync(
      configs.map((c) => ({
        id: c.id,
        has_saturday_service: c.has_saturday_service,
        has_sunday_service: c.has_sunday_service,
        saturday_service_time: c.saturday_service_times,
        sunday_service_time: c.sunday_service_times,
      }))
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Campus Service Settings</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {configs.map((config) => (
              <div key={config.id} className="border border-border rounded-lg p-4 space-y-4">
                <p className="font-semibold text-foreground">{config.name}</p>

                {/* Saturday Services */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={config.has_saturday_service ? "destructive" : "outline"}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => toggleService(config.id, "has_saturday_service")}
                      >
                        {config.has_saturday_service ? (
                          <Minus className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <span className={`text-sm font-medium ${config.has_saturday_service ? 'text-foreground' : 'text-muted-foreground'}`}>
                        Saturday
                      </span>
                    </div>
                    {config.has_saturday_service && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => addServiceTime(config.id, "saturday")}
                      >
                        <Plus className="h-3 w-3" />
                        Add Time
                      </Button>
                    )}
                  </div>
                  
                  {config.has_saturday_service ? (
                    <div className="ml-9 space-y-2">
                      {config.saturday_service_times.map((time, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={time}
                            onChange={(e) => handleTimeChange(config.id, "saturday", idx, e.target.value)}
                            className="w-[130px]"
                          />
                          {config.saturday_service_times.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeServiceTime(config.id, "saturday", idx)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ml-9 text-xs text-muted-foreground italic">No service</p>
                  )}
                </div>

                {/* Sunday Services */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={config.has_sunday_service ? "destructive" : "outline"}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => toggleService(config.id, "has_sunday_service")}
                      >
                        {config.has_sunday_service ? (
                          <Minus className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <span className={`text-sm font-medium ${config.has_sunday_service ? 'text-foreground' : 'text-muted-foreground'}`}>
                        Sunday
                      </span>
                    </div>
                    {config.has_sunday_service && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => addServiceTime(config.id, "sunday")}
                      >
                        <Plus className="h-3 w-3" />
                        Add Time
                      </Button>
                    )}
                  </div>
                  
                  {config.has_sunday_service ? (
                    <div className="ml-9 space-y-2">
                      {config.sunday_service_times.map((time, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={time}
                            onChange={(e) => handleTimeChange(config.id, "sunday", idx, e.target.value)}
                            className="w-[130px]"
                          />
                          {config.sunday_service_times.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeServiceTime(config.id, "sunday", idx)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ml-9 text-xs text-muted-foreground italic">No service</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
