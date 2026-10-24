import { Button } from "@/components/ui/button";

interface SwapButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SwapButton({ onClick, disabled }: SwapButtonProps) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title="Request a swap"
      className="h-6 rounded-md px-2 text-xs font-semibold"
    >
      Swap
    </Button>
  );
}
