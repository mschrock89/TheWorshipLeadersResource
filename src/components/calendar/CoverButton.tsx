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
      className="gap-2"
    >
      <UserPlus className="h-4 w-4" />
      Cover
    </Button>
  );
}
