import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

interface CoverButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function CoverButton({ onClick, disabled }: CoverButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-6 gap-1 px-2 text-[11px]"
    >
      <UserPlus className="h-3 w-3" />
      Cover
    </Button>
  );
}
