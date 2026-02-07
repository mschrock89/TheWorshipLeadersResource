import { X, Plus, User, Edit2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MINISTRY_TYPES } from "@/lib/constants";

interface PositionSlotProps {
  label: string;
  memberName?: string;
  avatarUrl?: string | null;
  isEmpty: boolean;
  onRemove: () => void;
  onAdd: () => void;
  readOnly?: boolean;
  ministryTypes?: string[];
  onEditMinistry?: () => void;
  showMinistryBadges?: boolean;
}

export function PositionSlot({
  label,
  memberName,
  avatarUrl,
  isEmpty,
  onRemove,
  onAdd,
  readOnly = false,
  ministryTypes = [],
  onEditMinistry,
  showMinistryBadges = true,
}: PositionSlotProps) {
  const ministryBadges = showMinistryBadges 
    ? ministryTypes.map(mt => MINISTRY_TYPES.find(m => m.value === mt)).filter(Boolean)
    : [];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2 transition-colors",
        isEmpty
          ? "border-dashed border-muted-foreground/30 bg-muted/30"
          : "border-border bg-card"
      )}
    >
      {isEmpty ? (
        <>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-xs text-muted-foreground/60">Empty</p>
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </>
      ) : (
        <>
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl || undefined} alt={memberName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {memberName?.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{memberName}</p>
              <div className="flex-1" />
              {ministryBadges.map(badge => (
                <span 
                  key={badge!.value}
                  className={cn(
                    "text-[10px] font-medium px-1 py-0.5 rounded text-white flex-shrink-0",
                    badge!.color
                  )}
                  title={badge!.label}
                >
                  {badge!.shortLabel}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
          {!readOnly && onEditMinistry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:bg-muted"
              onClick={onEditMinistry}
              title="Edit ministries"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
