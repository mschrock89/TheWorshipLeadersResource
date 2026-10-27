import { useEffect, useState } from "react";
import { Flag, ShieldBan } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useBlockUser, useReportContent, type ModeratedContentType } from "@/hooks/useModeration";

export type ModerationTarget = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  contentType: ModeratedContentType;
  contentId?: string;
  snapshot: Record<string, unknown>;
};

type Step = "menu" | "report" | "block";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

export function PersonModerationSheet({
  open,
  onOpenChange,
  target,
  initialStep = "menu",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ModerationTarget | null;
  initialStep?: Step;
}) {
  const report = useReportContent();
  const block = useBlockUser();
  const [step, setStep] = useState<Step>(initialStep);
  const [reason, setReason] = useState("");
  const busy = report.isPending || block.isPending;

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setReason("");
  }, [open, initialStep, target?.userId, target?.contentId]);

  const closeOrBack = () => {
    if (initialStep === "menu" && step !== "menu") {
      setStep("menu");
      setReason("");
      return;
    }
    onOpenChange(false);
  };

  const submitReport = async () => {
    if (!target || !reason.trim()) return;
    await report.mutateAsync({
      userId: target.userId,
      contentType: target.contentType,
      contentId: target.contentId,
      contentSnapshot: target.snapshot,
      reason,
    });
    onOpenChange(false);
  };

  const submitBlock = async () => {
    if (!target) return;
    await block.mutateAsync({
      userId: target.userId,
      contentType: target.contentType,
      contentId: target.contentId,
      contentSnapshot: target.snapshot,
      reason: "User blocked from content",
    });
    onOpenChange(false);
  };

  const name = target?.name || "This person";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
        <DrawerHeader className="items-center text-center">
          <Avatar className="mx-auto h-14 w-14">
            <AvatarImage src={target?.avatarUrl || undefined} />
            <AvatarFallback className="bg-zinc-700 text-sm font-medium text-zinc-200">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <DrawerTitle className="text-white">{name}</DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            {step === "report"
              ? "Tell us what is wrong with this message. Our team will review it."
              : step === "block"
                ? "Their posts and messages will disappear from your feed, and a report will be sent to our team."
                : "Report this message or block this person."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 pb-6">
          {step === "menu" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-full justify-start gap-3 rounded-xl bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                onClick={() => setStep("report")}
              >
                <Flag className="h-4 w-4" />
                Report
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-full justify-start gap-3 rounded-xl bg-zinc-900 text-red-300 hover:bg-zinc-800 hover:text-red-200"
                onClick={() => setStep("block")}
              >
                <ShieldBan className="h-4 w-4" />
                Block user
              </Button>
            </>
          ) : null}

          {step === "report" ? (
            <>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Harassment, spam, or inappropriate content"
                className="min-h-24 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={closeOrBack} disabled={busy}>
                  {initialStep === "menu" ? "Back" : "Cancel"}
                </Button>
                <Button type="button" className="flex-1" onClick={() => void submitReport()} disabled={busy || !reason.trim()}>
                  {report.isPending ? "Sending..." : "Send report"}
                </Button>
              </div>
            </>
          ) : null}

          {step === "block" ? (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={closeOrBack} disabled={busy}>
                {initialStep === "menu" ? "Back" : "Cancel"}
              </Button>
              <Button type="button" variant="destructive" className="flex-1" onClick={() => void submitBlock()} disabled={busy}>
                {block.isPending ? "Blocking..." : "Block user"}
              </Button>
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
