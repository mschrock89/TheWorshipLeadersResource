import { useState } from "react";
import { Music } from "lucide-react";
import { useAlbums, useAlbumWithTracks } from "@/hooks/useAlbums";
import { useUserRole } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { AlbumGrid } from "@/components/audio/AlbumGrid";
import { AlbumDetailView } from "@/components/audio/AlbumDetailView";
import { CreateAlbumDialog } from "@/components/audio/CreateAlbumDialog";

export default function Resources() {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const { user } = useAuth();
  
  const { data: albums, isLoading: loadingAlbums } = useAlbums();
  const { data: selectedAlbum, isLoading: loadingAlbum } = useAlbumWithTracks(selectedAlbumId);
  const { data: userRole } = useUserRole(user?.id);
  
  const isAdmin = userRole === "admin";

  const handleAlbumSelect = (albumId: string) => {
    setSelectedAlbumId(albumId);
  };

  const handleBack = () => {
    setSelectedAlbumId(null);
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Music className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audio Library</h1>
            <p className="text-muted-foreground">
              Browse albums and listen to tracks
            </p>
          </div>
        </div>
        
        {isAdmin && !selectedAlbumId && <CreateAlbumDialog />}
      </div>

      {/* Content */}
      {selectedAlbumId ? (
        <AlbumDetailView
          album={selectedAlbum ?? null}
          isLoading={loadingAlbum}
          onBack={handleBack}
          isAdmin={isAdmin}
        />
      ) : (
        <AlbumGrid
          albums={albums}
          isLoading={loadingAlbums}
          selectedAlbumId={selectedAlbumId}
          onAlbumSelect={handleAlbumSelect}
        />
      )}
    </div>
  );
}
