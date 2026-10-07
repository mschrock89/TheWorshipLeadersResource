import { useMemo, useState, type ReactElement } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import {
  assignChannelColor,
  CHANNEL_TONES,
  readChannelColorStore,
  resolveChannelTone,
  writeChannelColorStore,
} from "@/lib/channelColors";

type ChannelColorPickerProps = {
  channelId: string;
  positionSlot: string | null;
  fallbackIndex: number;
  label: string;
  onChange?: () => void;
  children: ReactElement;
};

export function ChannelColorPicker({
  channelId,
  positionSlot,
  fallbackIndex,
  label,
  onChange,
  children,
}: ChannelColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const tone = useMemo(
    () => resolveChannelTone(readChannelColorStore(), channelId, positionSlot, fallbackIndex),
    [channelId, fallbackIndex, positionSlot, revision],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="z-[80] w-auto p-3" align="start">
        <p className="mb-2 text-xs font-semibold">{label}</p>
        <div className="grid grid-cols-4 gap-2" role="listbox" aria-label={`${label} color`}>
          {CHANNEL_TONES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === tone.id}
              aria-label={option.label}
              className={cn(
                "h-8 w-8 rounded-full border border-black/10",
                option.swatch,
                option.id === tone.id && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
              onClick={() => {
                writeChannelColorStore(
                  assignChannelColor(readChannelColorStore(), channelId, positionSlot, option.id),
                );
                setRevision((value) => value + 1);
                onChange?.();
                setOpen(false);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ChannelColorButtonProps = Omit<ChannelColorPickerProps, "children"> & {
  className?: string;
};

export function ChannelColorButton({ className, label, ...props }: ChannelColorButtonProps) {
  const [revision, setRevision] = useState(0);
  const tone = useMemo(
    () => resolveChannelTone(readChannelColorStore(), props.channelId, props.positionSlot, props.fallbackIndex),
    [props.channelId, props.fallbackIndex, props.positionSlot, revision],
  );

  return (
    <ChannelColorPicker
      {...props}
      label={label}
      onChange={() => {
        setRevision((value) => value + 1);
        props.onChange?.();
      }}
    >
      <button
        type="button"
        aria-label={`Change ${label} color`}
        className={cn("h-7 w-7 shrink-0 rounded-full border border-black/10", tone.swatch, className)}
      />
    </ChannelColorPicker>
  );
}
