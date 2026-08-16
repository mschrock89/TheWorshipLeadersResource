import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";

interface SwapButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SwapButton({ onClick, disabled }: SwapButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title="Request a swap"
      className="h-5 w-5 text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftRight className="h-3 w-3" />
      <span className="sr-only">Swap</span>
    </Button>
  );
}
