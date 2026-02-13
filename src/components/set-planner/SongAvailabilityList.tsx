import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { SongAvailability } from "@/hooks/useSetPlanner";
import { Search, Plus, Music2, Clock, ArrowUp, ArrowDown } from "lucide-react";
import { differenceInWeeks, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

type SortDirection = 'recent-first' | 'oldest-first';

interface SongAvailabilityListProps {
  availability: SongAvailability[];
  onAddSong: (song: SongAvailability) => void;
  addedSongIds: Set<string>;
  publishedSetlistSongIds?: Set<string>;
  isLoading?: boolean;
  allowSchedulingOverrides?: boolean;
}

type FilterType = 'all' | 'available' | 'new-songs' | 'deep-cuts';

export function SongAvailabilityList({
  availability,
  onAddSong,
  addedSongIds,
  publishedSetlistSongIds = new Set(),
  isLoading,
  allowSchedulingOverrides = false,
}: SongAvailabilityListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('recent-first');
  const isMobile = useIsMobile();

  // Helper to check if a song is on an active/upcoming setlist
  const isOnActiveSetlist = (songId: string) => publishedSetlistSongIds.has(songId);

  const filteredSongs = useMemo(() => {
    let filtered = availability;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        a =>
          a.song.title.toLowerCase().includes(searchLower) ||
          a.song.author?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    switch (filter) {
      case 'available': {
        // Regular rotation only + schedulable (8+ weeks since last scheduled)
        // ALSO exclude songs on active setlists
        filtered = filtered.filter(a =>
          a.isInRegularRotation &&
          !a.isNewSong &&
          a.status === 'available' &&
          (allowSchedulingOverrides || !isOnActiveSetlist(a.song.id))
        );
        break;
      }
      case 'new-songs': {
        // "New" = songs that have been scheduled 1-2 times (until they hit 3)
        // Exclude songs on active setlists
        filtered = filtered.filter(a =>
          a.totalUses > 0 && 
          a.totalUses < 3 && 
          (allowSchedulingOverrides || !isOnActiveSetlist(a.song.id))
        );
        break;
      }
      case 'deep-cuts': {
        // Songs not played in last 365 days (52+ weeks), sorted by total plays
        // Exclude songs on active setlists and songs never played
        const now = new Date();
        filtered = filtered.filter(a => {
          if (!a.lastUsedDate) return false; // Never played = not a deep cut
          const daysSinceLastUse = Math.floor((now.getTime() - new Date(a.lastUsedDate).getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceLastUse >= 365 && (allowSchedulingOverrides || !isOnActiveSetlist(a.song.id));
        });
        // Sort by total plays (most to least) for deep cuts
        return [...filtered].sort((a, b) => b.totalUses - a.totalUses);
      }
    }

    // Sort based on selected direction (for non-deep-cuts filters)
    return [...filtered].sort((a, b) => {
      const aWeeks = a.lastUsedDate ? differenceInWeeks(new Date(), new Date(a.lastUsedDate)) : null;
      const bWeeks = b.lastUsedDate ? differenceInWeeks(new Date(), new Date(b.lastUsedDate)) : null;

      // Never played goes at end for both sort directions
      if (aWeeks === null && bWeeks === null) return a.song.title.localeCompare(b.song.title);
      if (aWeeks === null) return 1;
      if (bWeeks === null) return -1;
      
      if (sortDirection === 'recent-first') {
        // Smaller weeks = more recent, so sort ascending
        return aWeeks - bWeeks;
      } else {
        // Larger weeks = longer ago, so sort descending
        return bWeeks - aWeeks;
      }
    });
  }, [availability, search, filter, sortDirection, publishedSetlistSongIds, allowSchedulingOverrides]);

  // Helper to calculate weeks since last played and get theme-aligned colors
  const getWeeksInfo = (lastUsedDate: string | null) => {
    if (!lastUsedDate) return { weeks: null, color: 'text-muted-foreground', bg: 'bg-muted/60', formattedDate: null };

    const dateObj = new Date(lastUsedDate);
    const weeks = differenceInWeeks(new Date(), dateObj);
    const formattedDate = format(dateObj, 'MMM d, yyyy'); // e.g., "Jan 15, 2024"

    // 0-3 weeks: red (destructive)
    // 4-7 weeks: ECC yellow
    // 8+ weeks: ECC teal ("good")
    if (weeks >= 8) return { weeks, color: 'text-ecc-teal', bg: 'bg-ecc-teal/15', formattedDate };
    if (weeks >= 4) return { weeks, color: 'text-ecc-yellow', bg: 'bg-ecc-yellow/15', formattedDate };
    return { weeks, color: 'text-destructive', bg: 'bg-destructive/15', formattedDate };
  };

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All Songs' },
    { key: 'available', label: 'Available' },
    { key: 'new-songs', label: 'New Songs' },
    { key: 'deep-cuts', label: 'Deep Cuts' },
  ];

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search songs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {filterButtons.map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(key)}
            className="text-xs"
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filteredSongs.length}</span> songs
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortDirection(prev => prev === 'recent-first' ? 'oldest-first' : 'recent-first')}
          className="text-xs gap-1.5 h-7 px-2"
        >
          {sortDirection === 'recent-first' ? (
            <>
              <ArrowUp className="h-3 w-3" />
              Recent
            </>
          ) : (
            <>
              <ArrowDown className="h-3 w-3" />
              Oldest
            </>
          )}
        </Button>
      </div>

      {/* Song list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-1 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading songs...
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Music2 className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No songs match your filters</p>
            </div>
          ) : (
            filteredSongs.map(item => {
              const isAdded = addedSongIds.has(item.song.id);
              const isScheduledOnActiveSet = isOnActiveSetlist(item.song.id);
              const isDisabled =
                isAdded ||
                item.status === 'upcoming' ||
                (isScheduledOnActiveSet && !allowSchedulingOverrides);
              const weeksInfo = getWeeksInfo(item.lastUsedDate);

              return (
                <div
                  key={item.song.id}
                  className={cn(
                    // CSS Grid layout: weeks | title | right-side controls
                    // This ensures the right side is ALWAYS visible
                    'grid gap-2 p-2 rounded-lg border transition-colors',
                    // Grid columns: fixed weeks circle, flexible title, auto-fit right side
                    'grid-cols-[40px_1fr_auto]',
                    // Align to start when showing date subtitle for Deep Cuts
                    filter === 'deep-cuts' ? 'items-start' : 'items-center',
                    isAdded || isScheduledOnActiveSet
                      ? 'bg-muted/50 opacity-60'
                      : item.status === 'too-recent'
                      ? 'bg-red-500/5 border-red-500/10'
                      : 'bg-card hover:bg-accent/50'
                  )}
                >
                  {/* Column 1: Weeks indicator - fixed 40px */}
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full text-xs font-semibold border',
                    weeksInfo.bg,
                    weeksInfo.color,
                    // Add top margin when aligned to start for Deep Cuts
                    filter === 'deep-cuts' && 'mt-0.5'
                  )}>
                    {weeksInfo.weeks === null ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <span>{weeksInfo.weeks}w</span>
                    )}
                  </div>
                  
                  {/* Column 2: Song title + optional last played date */}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.song.title}</p>
                    {filter === 'deep-cuts' && weeksInfo.formattedDate && (
                      <p className="text-xs text-muted-foreground truncate">
                        Last played: {weeksInfo.formattedDate}
                      </p>
                    )}
                  </div>

                  {/* Column 3: Right side controls - auto width, never clips */}
                  <div className="flex items-center gap-1.5">
                    {/* NEW badge shows if song has never been scheduled at this campus/ministry */}
                    {item.totalUses === 0 ? (
                      <Badge className="bg-ecc-teal text-white text-[10px] px-1.5 py-0 h-4">
                        NEW
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground whitespace-nowrap hidden xs:inline">
                        {item.totalUses}x
                      </span>
                    )}

                    {/* Availability badge - show "Scheduled" if on active setlist */}
                    {isScheduledOnActiveSet ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-blue-500/50 text-blue-500">
                        Scheduled
                      </Badge>
                    ) : (
                      <AvailabilityBadge
                        status={item.status}
                        weeksUntilAvailable={item.weeksUntilAvailable}
                        isNewSong={item.isNewSong}
                        compact={isMobile}
                      />
                    )}

                    {/* Add button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onAddSong(item)}
                      disabled={isDisabled}
                    >
                      <Plus className={cn('h-4 w-4', isAdded && 'opacity-30')} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
