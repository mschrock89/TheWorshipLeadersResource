import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DurationInputProps {
  value: number | null;
  onChange: (seconds: number | null) => void;
  className?: string;
  disabled?: boolean;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function parseDuration(value: string): number | null {
  if (!value.trim()) return null;
  
  // Handle various formats: "5:30", "5.30", "330" (seconds), "5m30s"
  const colonMatch = value.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseInt(colonMatch[2], 10);
    return mins * 60 + secs;
  }
  
  const dotMatch = value.match(/^(\d+)\.(\d{1,2})$/);
  if (dotMatch) {
    const mins = parseInt(dotMatch[1], 10);
    const secs = parseInt(dotMatch[2], 10);
    return mins * 60 + secs;
  }
  
  // Just seconds
  const secsOnly = parseInt(value, 10);
  if (!isNaN(secsOnly)) {
    return secsOnly;
  }
  
  return null;
}

export function DurationInput({ value, onChange, className, disabled }: DurationInputProps) {
  const [inputValue, setInputValue] = useState(formatDuration(value));
  
  useEffect(() => {
    setInputValue(formatDuration(value));
  }, [value]);
  
  const handleBlur = useCallback(() => {
    const parsed = parseDuration(inputValue);
    onChange(parsed);
    setInputValue(formatDuration(parsed));
  }, [inputValue, onChange]);
  
  return (
    <Input
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          handleBlur();
        }
      }}
      placeholder="0:00"
      className={cn(
        "w-16 text-center text-sm h-8 px-1",
        className
      )}
      disabled={disabled}
    />
  );
}

export function formatTotalDuration(seconds: number): string {
  if (seconds === 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
