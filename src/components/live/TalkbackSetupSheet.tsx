import { useState } from "react";
import { ChannelColorButton } from "@/components/live/ChannelColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { LiveTalkbackChannel } from "@/hooks/useLiveSession";

type TalkbackSetupSheetProps = {
  open: boolean;
  channels: LiveTalkbackChannel[];
  onOpenChange: (open: boolean) => void;
  onOpenRouting: () => void;
  onAddChannel: (label: string) => void;
  onRenameChannel: (channelId: string, label: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onClearLines: () => void;
  onColorsChange?: () => void;
};

export function TalkbackSetupSheet({
  open,
  channels,
  onOpenChange,
  onOpenRouting,
  onAddChannel,
  onRenameChannel,
  onRemoveChannel,
  onClearLines,
  onColorsChange,
}: TalkbackSetupSheetProps) {
  const [newLabel, setNewLabel] = useState("");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Talkback inputs</SheetTitle>
          <SheetDescription>
            Name each talkback by its stage position and choose its color. Match those names to input numbers on Audio routing. Listen on the computer that receives the board.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenRouting();
              }}
            >
              Audio routing
            </Button>
            <Button type="button" variant="ghost" onClick={onClearLines}>
              Clear captions
            </Button>
          </div>

          <ul className="space-y-3">
            {channels.map((channel, index) => (
              <li key={channel.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <ChannelColorButton
                    channelId={channel.id}
                    positionSlot={channel.position_slot}
                    fallbackIndex={index}
                    label={channel.label}
                    onChange={onColorsChange}
                  />
                  <Input
                    aria-label={`${channel.label} name`}
                    defaultValue={channel.label}
                    key={`${channel.id}-${channel.label}`}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== channel.label) onRenameChannel(channel.id, next);
                    }}
                  />
                  <Button type="button" variant="ghost" onClick={() => onRemoveChannel(channel.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onAddChannel(newLabel);
              setNewLabel("");
            }}
          >
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Add a stage position"
              aria-label="New talkback position"
            />
            <Button type="submit" disabled={!newLabel.trim()}>
              Add
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
