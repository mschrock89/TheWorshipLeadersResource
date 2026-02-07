import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertCircle, Calendar } from "lucide-react";

interface AvailabilityBadgeProps {
  status: 'available' | 'new-song-ok' | 'too-recent' | 'upcoming';
  weeksUntilAvailable?: number | null;
  isNewSong?: boolean;
  compact?: boolean;
}

export function AvailabilityBadge({
  status,
  weeksUntilAvailable,
  isNewSong,
  compact = false,
}: AvailabilityBadgeProps) {
  const config = {
    available: {
      icon: CheckCircle2,
      label: 'Available',
      className: 'bg-green-500/10 text-green-600 border-green-500/20',
    },
    'new-song-ok': {
      icon: CheckCircle2,
      label: 'New Song OK',
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    'too-recent': {
      icon: Clock,
      label: weeksUntilAvailable ? `${weeksUntilAvailable}w` : 'Too Recent',
      className: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
    upcoming: {
      icon: Calendar,
      label: 'Scheduled',
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    },
  };

  const { icon: Icon, label, className } = config[status];

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs', className.split(' ').find(c => c.startsWith('text-')))}>
        <Icon className="h-3 w-3" />
      </span>
    );
  }

  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', className)}>
      <Icon className="h-3 w-3" />
      {label}
      {isNewSong && status === 'available' && (
        <span className="text-xs opacity-70">(new)</span>
      )}
    </Badge>
  );
}
