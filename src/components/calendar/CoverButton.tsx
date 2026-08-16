import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

interface CoverButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function CoverButton({ onClick, disabled }: CoverButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title="Cover another team"
      className="h-5 w-5 text-muted-foreground hover:text-foreground"
    >
      <UserPlus className="h-3 w-3" />
      <span className="sr-only">Cover</span>
    </Button>
  );
}
