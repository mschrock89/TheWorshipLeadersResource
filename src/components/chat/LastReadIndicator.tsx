import { forwardRef } from "react";
import { Eye } from "lucide-react";

export const LastReadIndicator = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="flex items-center justify-center my-4 px-4">
      <div className="flex-1 h-px bg-primary/40" />
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs text-primary font-medium">Last Read</span>
      </div>
      <div className="flex-1 h-px bg-primary/40" />
    </div>
  );
});

LastReadIndicator.displayName = "LastReadIndicator";
