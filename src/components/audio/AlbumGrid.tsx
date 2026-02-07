import { Album } from "@/hooks/useAlbums";
import { AlbumCard } from "./AlbumCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Music } from "lucide-react";

interface AlbumGridProps {
  albums: Album[] | undefined;
  isLoading: boolean;
  selectedAlbumId: string | null;
  onAlbumSelect: (albumId: string) => void;
}

export function AlbumGrid({ albums, isLoading, selectedAlbumId, onAlbumSelect }: AlbumGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (!albums || albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Music className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">No albums yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          id={album.id}
          title={album.title}
          artworkUrl={album.artwork_url}
          onClick={() => onAlbumSelect(album.id)}
          isSelected={selectedAlbumId === album.id}
        />
      ))}
    </div>
  );
}
