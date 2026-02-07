import { Music } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface AlbumCardProps {
  id: string;
  title: string;
  artworkUrl: string | null;
  onClick: () => void;
  isSelected?: boolean;
}

export function AlbumCard({ id, title, artworkUrl, onClick, isSelected }: AlbumCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-xl transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background
        ${isSelected ? "ring-2 ring-primary scale-[1.02]" : "hover:scale-[1.02]"}
      `}
    >
      <AspectRatio ratio={1}>
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Music className="h-12 w-12 text-primary/50" />
          </div>
        )}
        
        
        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-primary animate-pulse" />
        )}
      </AspectRatio>
    </button>
  );
}
