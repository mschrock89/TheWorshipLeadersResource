import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Common emoji categories
const EMOJI_CATEGORIES = {
  "Smileys": ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐"],
  "Gestures": ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🙏", "✍️", "💪", "🦾", "🦿"],
  "Hearts": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
  "Reactions": ["🔥", "⭐", "✨", "💯", "💥", "💫", "🎉", "🎊", "👀", "💀", "☠️", "👻", "🙈", "🙉", "🙊", "💩", "🤡", "👽", "🤖", "😈", "👿"],
  "Objects": ["🎵", "🎶", "🎤", "🎧", "🎸", "🎹", "🥁", "🎺", "🎷", "🪗", "🎻", "📱", "💻", "⌨️", "🖥️", "📷", "📸", "📹", "🎬", "📺", "📻", "🎙️", "⏰", "📅", "📆"],
};

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍", "🔥", "🎉"];

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  triggerClassName?: string;
}

export function EmojiPicker({ onEmojiSelect, triggerClassName }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("Smileys");

  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={triggerClassName || "h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"}
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2 border-zinc-700 bg-zinc-900"
        side="top"
        align="end"
      >
        {/* Category tabs */}
        <div className="flex gap-1 mb-2 pb-2 border-b border-zinc-700 overflow-x-auto">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                activeCategory === category
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
        
        {/* Emoji grid */}
        <ScrollArea className="h-48">
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSelect(emoji)}
                className="text-xl p-1 hover:bg-zinc-800 rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Compact picker for reactions (shows quick emoji row)
interface QuickReactionPickerProps {
  onEmojiSelect: (emoji: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function QuickReactionPicker({
  onEmojiSelect,
  open,
  onOpenChange,
  children,
}: QuickReactionPickerProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-auto p-2 border-zinc-700 bg-zinc-900 rounded-full"
        side="top"
        align="center"
      >
        <div className="flex items-center gap-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onEmojiSelect(emoji);
                onOpenChange(false);
              }}
              className="text-xl hover:scale-125 transition-transform p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
