import { useState, useCallback } from "react";
import { Grid } from "@giphy/react-components";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const gf = new GiphyFetch("unHjzuS3XFL1Tw0ennI8DNeoIUwiekDq");

interface ChatGifPickerProps {
  onGifSelect: (gifUrl: string) => void;
}

export function ChatGifPicker({ onGifSelect }: ChatGifPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchGifs = useCallback(
    (offset: number) => {
      if (searchTerm) {
        return gf.search(searchTerm, { offset, limit: 10 });
      }
      return gf.trending({ offset, limit: 10 });
    },
    [searchTerm]
  );

  const handleGifClick = (gif: any, e: React.SyntheticEvent) => {
    e.preventDefault();
    onGifSelect(gif.images.fixed_height.url);
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full flex-shrink-0"
        >
          <span className="text-xs font-bold">GIF</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[350px] p-0 border-zinc-700 bg-zinc-800" 
        align="end" 
        side="top"
        sideOffset={8}
      >
        <div className="p-2 border-b border-zinc-700">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search GIFs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-400"
            />
          </div>
        </div>
        <div className="h-[350px] overflow-y-auto p-2">
          <Grid
            key={searchTerm}
            onGifClick={handleGifClick}
            fetchGifs={fetchGifs}
            width={330}
            columns={2}
            gutter={6}
            noLink
          />
        </div>
        <div className="p-1 border-t border-zinc-700 flex justify-center">
          <img 
            src="https://giphy.com/static/img/poweredby_giphy.png" 
            alt="Powered by GIPHY" 
            className="h-4 opacity-60"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
