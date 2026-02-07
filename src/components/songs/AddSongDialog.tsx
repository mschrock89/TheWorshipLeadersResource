import { useState } from "react";
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
import { Plus, Loader2 } from "lucide-react";
import { useCreateSong } from "@/hooks/useSongs";

interface AddSongDialogProps {
  trigger?: React.ReactNode;
}

export function AddSongDialog({ trigger }: AddSongDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [bpm, setBpm] = useState("");
  const createSong = useCreateSong();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const bpmValue = bpm.trim() ? parseFloat(bpm.trim()) : null;

    createSong.mutate(
      { title: title.trim(), author: author.trim() || null, bpm: bpmValue },
      {
        onSuccess: () => {
          setTitle("");
          setAuthor("");
          setBpm("");
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Song
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Song</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter song title"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="author">Author / Artist</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bpm">BPM (Tempo)</Label>
            <Input
              id="bpm"
              type="number"
              min="20"
              max="300"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="Optional (e.g., 72)"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || createSong.isPending}>
              {createSong.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                "Add Song"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
