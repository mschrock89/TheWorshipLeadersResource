import { useState } from "react";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export function buildRosterGroupTextTemplate({
  date,
  serviceLabel,
}: {
  date: Date;
  serviceLabel?: string;
}) {
  const label = serviceLabel?.trim() || "this service";
  return `Hi team! Reminder: you're scheduled for ${label} on ${format(date, "EEEE, MMMM d, yyyy")}. Please check the app for details.`;
}

interface GroupTextButtonProps {
  phoneNumbers: Array<string | null | undefined>;
  defaultMessage?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  label?: string;
}

export function GroupTextButton({
  phoneNumbers,
  defaultMessage = "",
  className,
  size = "sm",
  variant = "outline",
  label = "Group Text",
}: GroupTextButtonProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messageBody, setMessageBody] = useState(defaultMessage);

  const recipients = Array.from(
    new Set(
      phoneNumbers
        .map((phone) => phone?.trim())
        .filter((phone): phone is string => Boolean(phone))
    )
  );

  const openComposer = () => {
    if (recipients.length === 0) {
      toast({
        title: "No phone numbers available",
        description: "No roster members have a phone number you can text for this roster.",
        variant: "destructive",
      });
      return;
    }

    setMessageBody(defaultMessage);
    setIsOpen(true);
  };

  const handleOpenMessages = () => {
    const separator = /Android/i.test(navigator.userAgent) ? ";" : ",";
    const body = messageBody.trim();
    const bodyParam = body ? `?body=${encodeURIComponent(body)}` : "";
    window.open(`sms:${recipients.join(separator)}${bodyParam}`, "_self");
    setIsOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={openComposer}
        disabled={recipients.length === 0}
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        {label}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compose Group Text</DialogTitle>
            <DialogDescription>
              This will open your device messaging app with {recipients.length} roster member{recipients.length === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            placeholder="Add an optional message"
            rows={5}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleOpenMessages}>
              Open Messages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
