import { useState, useCallback } from "react";
import { Plus, Upload, Loader2, Image as ImageIcon, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCreateAlbum } from "@/hooks/useAlbums";
import { AspectRatio } from "@/components/ui/aspect-ratio";

export function CreateAlbumDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const createAlbum = useCreateAlbum();

  const handleArtworkSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setArtworkFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setArtworkPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  const clearArtwork = () => {
    setArtworkFile(null);
    setArtworkPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setUploading(true);
    
    try {
      let artworkUrl: string | undefined;

      // Upload artwork if selected
      if (artworkFile) {
        const fileExt = artworkFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `covers/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("album-artwork")
          .upload(filePath, artworkFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("album-artwork")
          .getPublicUrl(filePath);

        artworkUrl = urlData.publicUrl;
      }

      await createAlbum.mutateAsync({ title: title.trim(), artworkUrl });
      
      // Reset form
      setTitle("");
      setArtworkFile(null);
      setArtworkPreview(null);
      setOpen(false);
    } catch (error) {
      console.error("Failed to create album:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Album
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Album</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Artwork Upload */}
          <div className="space-y-2">
            <Label>Album Artwork</Label>
            <div className="flex gap-4 items-start">
              <div className="w-32 flex-shrink-0">
                <AspectRatio ratio={1}>
                  {artworkPreview ? (
                    <div className="relative h-full w-full">
                      <img
                        src={artworkPreview}
                        alt="Album artwork preview"
                        className="h-full w-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={clearArtwork}
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-full w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                      <ImageIcon className="h-8 w-8 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Add Cover</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleArtworkSelect}
                      />
                    </label>
                  )}
                </AspectRatio>
              </div>
              <div className="flex-1 pt-2">
                <p className="text-xs text-muted-foreground">
                  Upload a square image for best results. JPG, PNG, or WebP.
                </p>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="album-title">Album Title</Label>
            <Input
              id="album-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter album title"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={uploading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || uploading}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Album"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
