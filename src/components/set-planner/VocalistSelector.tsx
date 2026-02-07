import { useState } from "react";
import { Check, Mic2, UserCircle2, ArrowRightLeft } from "lucide-react";
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

interface VocalistSelectorProps {
  value: string | null;
  onChange: (vocalistId: string | null) => void;
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

export function VocalistSelector({
  value,
  onChange,
  vocalists,
  disabled = false,
}: VocalistSelectorProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const selectedVocalist = vocalists.find((v) => v.userId === value);

  if (vocalists.length === 0) {
    return null; // Don't show if no vocalists scheduled
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 gap-1 px-1.5 hover:bg-primary/10 shrink-0",
            value && "bg-primary/5",
            // Smaller on mobile
            isMobile && "h-7 px-1"
          )}
        >
          {selectedVocalist ? (
            <Avatar className={cn("h-5 w-5", isMobile && "h-5 w-5")}>
              <AvatarImage src={selectedVocalist.avatarUrl || undefined} />
              <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                {getInitials(selectedVocalist.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Mic2 className={cn("h-4 w-4 text-muted-foreground", isMobile && "h-3.5 w-3.5")} />
          )}
          {/* Hide name on mobile, show only on desktop */}
          <span className={cn(
            "text-xs truncate",
            isMobile ? "hidden" : "max-w-[60px]"
          )}>
            {selectedVocalist?.name.split(" ")[0] || "Vocalist"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <div className="p-2 border-b">
          <p className="text-sm font-medium flex items-center gap-2">
            <Mic2 className="h-4 w-4" />
            Assign Vocalist
          </p>
          <p className="text-xs text-muted-foreground">
            Who's leading this song?
          </p>
        </div>
        <ScrollArea className="max-h-[280px]">
          <div className="p-1">
            {/* Unassign option */}
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                "hover:bg-muted/80",
                !value && "bg-muted"
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
              {!value && <Check className="h-4 w-4 text-primary" />}
            </button>

            {/* Vocalist options */}
            {vocalists.map((vocalist) => (
              <button
                key={vocalist.userId}
                onClick={() => {
                  onChange(vocalist.userId);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                  "hover:bg-muted/80",
                  value === vocalist.userId && "bg-primary/10"
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
                {value === vocalist.userId && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
