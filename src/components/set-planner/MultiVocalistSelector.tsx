import { useState } from "react";
import { Check, Mic2, UserCircle2, ArrowRightLeft, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ScheduledVocalist } from "@/hooks/useScheduledVocalists";
import { useIsMobile } from "@/hooks/use-mobile";

interface MultiVocalistSelectorProps {
  value: string[];
  onChange: (vocalistIds: string[]) => void;
  vocalists: ScheduledVocalist[];
  disabled?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getPositionLabel(position: string): string {
  const labels: Record<string, string> = {
    lead_vocals: "Lead",
    harmony_vocals: "Harmony",
    background_vocals: "BGV",
    vocalist: "Vocalist",
  };
  return labels[position] || position;
}

export function MultiVocalistSelector({
  value,
  onChange,
  vocalists,
  disabled = false,
}: MultiVocalistSelectorProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const selectedVocalists = vocalists.filter((v) => value.includes(v.userId));

  if (vocalists.length === 0) {
    return null;
  }

  const toggleVocalist = (vocalistId: string) => {
    if (value.includes(vocalistId)) {
      onChange(value.filter((id) => id !== vocalistId));
    } else {
      onChange([...value, vocalistId]);
    }
  };

  const clearAll = () => {
    onChange([]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 gap-1 px-1.5 hover:bg-primary/10 shrink-0",
            value.length > 0 && "bg-primary/5",
            isMobile && "h-7 px-1"
          )}
        >
          {selectedVocalists.length === 0 ? (
            <Mic2 className={cn("h-4 w-4 text-muted-foreground", isMobile && "h-3.5 w-3.5")} />
          ) : selectedVocalists.length === 1 ? (
            <Avatar className={cn("h-5 w-5", isMobile && "h-5 w-5")}>
              <AvatarImage src={selectedVocalists[0].avatarUrl || undefined} />
              <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                {getInitials(selectedVocalists[0].name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="flex items-center">
              <div className="flex -space-x-2">
                {selectedVocalists.slice(0, 2).map((v, i) => (
                  <Avatar key={v.userId} className={cn("h-5 w-5 ring-1 ring-background", isMobile && "h-5 w-5")}>
                    <AvatarImage src={v.avatarUrl || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                      {getInitials(v.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {selectedVocalists.length > 2 && (
                <span className="text-[10px] text-muted-foreground ml-0.5">
                  +{selectedVocalists.length - 2}
                </span>
              )}
            </div>
          )}
          <span className={cn(
            "text-xs truncate",
            isMobile ? "hidden" : "max-w-[60px]"
          )}>
            {selectedVocalists.length === 0 
              ? "Vocalist" 
              : selectedVocalists.length === 1 
                ? selectedVocalists[0].name.split(" ")[0]
                : `${selectedVocalists.length} vocalists`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="p-2 border-b">
          <p className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Assign Vocalist(s)
          </p>
          <p className="text-xs text-muted-foreground">
            Select one or more vocalists for co-lead songs
          </p>
        </div>
        <ScrollArea className="max-h-[280px]">
          <div className="p-1">
            {/* Clear all option */}
            <button
              onClick={clearAll}
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                "hover:bg-muted/80",
                value.length === 0 && "bg-muted"
              )}
            >
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <UserCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Unassigned
                </p>
              </div>
              {value.length === 0 && <Check className="h-4 w-4 text-primary" />}
            </button>

            {/* Vocalist options with checkboxes */}
            {vocalists.map((vocalist) => {
              const isSelected = value.includes(vocalist.userId);
              return (
                <button
                  key={vocalist.userId}
                  onClick={() => toggleVocalist(vocalist.userId)}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                    "hover:bg-muted/80",
                    isSelected && "bg-primary/10"
                  )}
                >
                  <Avatar className="h-8 w-8 ring-2 ring-background">
                    <AvatarImage src={vocalist.avatarUrl || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-xs font-medium">
                      {getInitials(vocalist.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{vocalist.name}</p>
                      {vocalist.isSwappedIn && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/50 text-amber-600 gap-0.5">
                          <ArrowRightLeft className="h-2.5 w-2.5" />
                          Swap
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {getPositionLabel(vocalist.position)}
                    </p>
                  </div>
                  <div className={cn(
                    "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected 
                      ? "bg-primary border-primary" 
                      : "border-muted-foreground/30"
                  )}>
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {value.length > 0 && (
          <div className="p-2 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              {value.length} vocalist{value.length > 1 ? 's' : ''} selected
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
