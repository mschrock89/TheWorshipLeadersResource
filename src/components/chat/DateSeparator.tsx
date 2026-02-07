import { format, isToday, isYesterday } from "date-fns";

interface DateSeparatorProps {
  date: string;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMM d");
  };

  return (
    <div className="flex items-center justify-center my-6">
      <span className="px-4 py-1.5 rounded-full bg-zinc-800/80 text-xs text-zinc-400 font-medium">
        {formatDate(date)}
      </span>
    </div>
  );
}
