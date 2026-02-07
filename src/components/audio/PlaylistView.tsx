import { Play, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackItem } from "./TrackItem";
import { useAudioPlayer, Track } from "@/hooks/useAudioPlayer";
import { format } from "date-fns";

interface PlaylistViewProps {
  title: string;
  subtitle?: string;
  date?: string;
  tracks: Array<{
    id: string;
    songId: string;
    title: string;
    artist: string | null;
    audioUrl: string | null;
    songKey: string | null;
    hasAudio: boolean;
  }>;
  onClose?: () => void;
}

export function PlaylistView({
  title,
  subtitle,
  date,
  tracks,
  onClose,
}: PlaylistViewProps) {
  const { currentTrack, isPlaying, setPlaylist, togglePlay, play } = useAudioPlayer();

  const playableTracks: Track[] = tracks
    .filter(t => t.hasAudio)
    .map(t => ({
      id: t.songId,
      title: t.title,
      artist: t.artist,
      audioUrl: t.audioUrl!,
      songKey: t.songKey,
    }));

  const handlePlayAll = () => {
    if (playableTracks.length > 0) {
      setPlaylist(playableTracks, 0);
    }
  };

  const handlePlayTrack = (index: number) => {
    const track = tracks[index];
    if (!track.hasAudio) return;

    // Find the index in playable tracks
    const playableIndex = playableTracks.findIndex(t => t.id === track.songId);
    
    if (currentTrack?.id === track.songId) {
      togglePlay();
    } else {
      setPlaylist(playableTracks, playableIndex);
    }
  };

  const tracksWithAudio = tracks.filter(t => t.hasAudio).length;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
            {date && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(date), "EEEE, MMMM d, yyyy")}
              </p>
            )}
          </div>
          {playableTracks.length > 0 && (
            <Button
              onClick={handlePlayAll}
              size="sm"
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Play All
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
          <Music2 className="h-4 w-4" />
          <span>
            {tracksWithAudio} of {tracks.length} songs available
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1">
          {tracks.map((track, index) => (
            <TrackItem
              key={track.id}
              title={track.title}
              artist={track.artist}
              songKey={track.songKey}
              isPlaying={isPlaying}
              isCurrentTrack={currentTrack?.id === track.songId}
              hasAudio={track.hasAudio}
              index={index}
              onPlay={() => handlePlayTrack(index)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
