import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SongAvailability } from "@/hooks/useSetPlanner";
import { Sparkles, Clock, Archive, Plus } from "lucide-react";
import { format } from "date-fns";

interface SuggestionCardsProps {
  availability: SongAvailability[];
  onAddSong: (song: SongAvailability) => void;
  addedSongIds: Set<string>;
  publishedSetlistSongIds?: Set<string>;
}

export function SuggestionCards({ availability, onAddSong, addedSongIds, publishedSetlistSongIds = new Set() }: SuggestionCardsProps) {
  // Combined filter: songs in current set OR in any published setlist for this campus/ministry
  const isExcluded = (songId: string) => addedSongIds.has(songId) || publishedSetlistSongIds.has(songId);

  // New songs ready to repeat (played 1-2 times, 4+ weeks ago)
  // Exclude songs already scheduled for this weekend (status === 'upcoming'), songs in current set, AND songs in published setlists
  const newSongsReady = availability
    .filter(a => a.isNewSong && a.status === 'new-song-ok' && a.totalUses > 0 && !isExcluded(a.song.id))
    .slice(0, 5);

  // Deep cuts - songs that are truly deep cuts (<=1 use in past year) AND haven't been used in 12+ weeks
  // Exclude songs scheduled for this weekend, songs in current set, songs in published setlists, and songs that are just in normal rotation
  const deepCuts = availability
    .filter(a => {
      // Must have been played before and be a true deep cut (<=1 use in past year)
      if (!a.lastUsedDate || a.totalUses === 0 || !a.isDeepCut) return false;
      // Exclude songs scheduled for target weekend
      if (a.status === 'upcoming') return false;
      // Exclude songs already added to current set or in published setlists
      if (isExcluded(a.song.id)) return false;
      const weeksSince = Math.floor(
        (Date.now() - new Date(a.lastUsedDate).getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      // Must be 12+ weeks since last use to be a deep cut suggestion
      return weeksSince >= 12;
    })
    .sort((a, b) => b.totalUses - a.totalUses)
    .slice(0, 5);

  // Coming available soon (restricted now, available in 1-2 weeks)
  // Also exclude songs already added to current set or in published setlists
  const comingSoon = availability
    .filter(a => a.status === 'too-recent' && a.weeksUntilAvailable && a.weeksUntilAvailable <= 2 && !isExcluded(a.song.id))
    .sort((a, b) => (a.weeksUntilAvailable || 0) - (b.weeksUntilAvailable || 0))
    .slice(0, 5);

  return (
    <div className="grid gap-3 md:grid-cols-3 mb-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            New Songs Ready
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {newSongsReady.length > 0 ? (
            newSongsReady.map(item => (
              <SuggestionItem
                key={item.song.id}
                item={item}
                onAdd={() => onAddSong(item)}
                isAdded={addedSongIds.has(item.song.id)}
                badge={`${item.totalUses}x`}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No new songs ready to repeat</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Archive className="h-4 w-4 text-purple-500" />
            Deep Cuts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {deepCuts.length > 0 ? (
            deepCuts.map(item => {
              const weeksSince = Math.floor(
                (Date.now() - new Date(item.lastUsedDate!).getTime()) / (7 * 24 * 60 * 60 * 1000)
              );
              return (
                <SuggestionItem
                  key={item.song.id}
                  item={item}
                  onAdd={() => onAddSong(item)}
                  isAdded={addedSongIds.has(item.song.id)}
                  badge={`${weeksSince}w ago`}
                />
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground">No deep cuts available</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Coming Available
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {comingSoon.length > 0 ? (
            comingSoon.map(item => (
              <SuggestionItem
                key={item.song.id}
                item={item}
                onAdd={() => onAddSong(item)}
                isAdded={addedSongIds.has(item.song.id)}
                badge={`${item.weeksUntilAvailable}w`}
                disabled
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No songs coming available soon</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SuggestionItem({
  item,
  onAdd,
  isAdded,
  badge,
  disabled,
}: {
  item: SongAvailability;
  onAdd: () => void;
  isAdded: boolean;
  badge: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onAdd}
        disabled={isAdded || disabled}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <span className="flex-1 truncate">{item.song.title}</span>
      <Badge variant="secondary" className="text-xs shrink-0">
        {badge}
      </Badge>
    </div>
  );
}
