import { useState } from "react";
import { Plus, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SwapRequestsList } from "./SwapRequestsList";
import { NewSwapRequestDialog } from "./NewSwapRequestDialog";

interface SwapsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SwapsSheet({ open, onOpenChange }: SwapsSheetProps) {
  const [isNewSwapOpen, setIsNewSwapOpen] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Swaps & Covers
            </SheetTitle>
            <SheetDescription>
              Manage your swap and cover requests
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4">
            <Button
              onClick={() => setIsNewSwapOpen(true)}
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Request
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 -mx-6 px-6">
            <SwapRequestsList />
          </div>
        </SheetContent>
      </Sheet>

      <NewSwapRequestDialog
        open={isNewSwapOpen}
        onOpenChange={setIsNewSwapOpen}
      />
    </>
  );
}
