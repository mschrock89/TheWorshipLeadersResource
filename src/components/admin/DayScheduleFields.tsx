import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DayScheduleDraft } from "@/lib/campusMinistrySchedule";

type DayScheduleFieldsProps = {
  drafts: DayScheduleDraft[];
  onChange: (day: number, update: (draft: DayScheduleDraft) => DayScheduleDraft) => void;
};

export function DayScheduleFields({ drafts, onChange }: DayScheduleFieldsProps) {
  return (
    <div className="space-y-4">
      {drafts.map((draft) => (
        <div key={draft.day} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={draft.enabled ? "destructive" : "outline"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onChange(draft.day, (current) => ({ ...current, enabled: !current.enabled }))}
                aria-label={draft.enabled ? `Remove ${draft.label}` : `Add ${draft.label}`}
              >
                {draft.enabled ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
              <span className={`text-sm font-medium ${draft.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                {draft.label}
              </span>
            </div>
            {draft.enabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => onChange(draft.day, (current) => ({
                  ...current,
                  times: [...current.times, current.day === 0 ? "11:30" : "18:00"],
                }))}
              >
                <Plus className="h-3 w-3" />
                Add Time
              </Button>
            ) : null}
          </div>
          {draft.enabled ? (
            <div className="ml-9 space-y-2">
              {draft.times.map((time, index) => (
                <div key={`${draft.day}-${index}`} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={time}
                    onChange={(event) => onChange(draft.day, (current) => {
                      const times = [...current.times];
                      times[index] = event.target.value;
                      return { ...current, times };
                    })}
                    className="w-[130px]"
                  />
                  {draft.times.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onChange(draft.day, (current) => ({
                        ...current,
                        times: current.times.filter((_, timeIndex) => timeIndex !== index),
                      }))}
                      aria-label={`Remove ${draft.label} time`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="ml-9 text-xs italic text-muted-foreground">No service</p>
          )}
        </div>
      ))}
    </div>
  );
}
