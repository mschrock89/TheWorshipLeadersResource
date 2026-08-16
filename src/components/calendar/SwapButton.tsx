import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";

interface SwapButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SwapButton({ onClick, disabled }: SwapButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-6 gap-1 px-2 text-[11px]"
    >
      <ArrowLeftRight className="h-3 w-3" />
      Swap
    </Button>
  );
}
