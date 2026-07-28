import { useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface EventPushRecipient {
  id: string;
  full_name: string | null;
  gender: string | null;
  hasPushSubscription: boolean;
}

interface EventPushDialogProps {
  eventId: string;
  eventTitle: string;
}

export function EventPushDialog({ eventId, eventTitle }: EventPushDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<EventPushRecipient[]>([]);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const { data, error } = await supabase.functions.invoke("notify-event-push", {
        body: { eventId, dryRun: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRecipients(data?.recipients || []);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Failed to load recipients");
      setRecipients([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      void loadPreview();
    }
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-event-push", {
        body: { eventId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Push sent to ${data?.pushSent ?? 0} device${(data?.pushSent ?? 0) === 1 ? "" : "s"}`);
      setIsOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send push notification");
    } finally {
      setIsSending(false);
    }
  };

  const pushEligibleCount = recipients.filter((recipient) => recipient.hasPushSubscription).length;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bell className="h-4 w-4" />
          Send Push
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Push Notification</DialogTitle>
          <DialogDescription>
            Everyone below matches "{eventTitle}"'s campus, ministry, and gender filters and will get this push.
          </DialogDescription>
        </DialogHeader>

        {isLoadingPreview ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recipients...
          </div>
        ) : previewError ? (
          <p className="py-4 text-sm text-destructive">{previewError}</p>
        ) : recipients.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No one matches this event's filters.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{recipients.length} recipient{recipients.length === 1 ? "" : "s"}</Badge>
              <Badge variant="outline">{pushEligibleCount} with push enabled</Badge>
            </div>
            <div className="max-h-64 overflow-y-auto overscroll-contain rounded-md border border-border">
              <div className="divide-y divide-border">
                {recipients.map((recipient) => (
                  <div key={recipient.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{recipient.full_name || "Unnamed profile"}</span>
                    {recipient.hasPushSubscription ? (
                      <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <BellOff className="h-3.5 w-3.5" />
                        no push
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              People marked "no push" haven't enabled push notifications on any device; they'll still see the event in
              the app. You won't send a push to yourself.
            </p>
            <Button className="w-full gap-2" onClick={handleSend} disabled={isSending || pushEligibleCount === 0}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSending ? "Sending..." : `Send Push to ${recipients.length} ${recipients.length === 1 ? "Person" : "People"}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
