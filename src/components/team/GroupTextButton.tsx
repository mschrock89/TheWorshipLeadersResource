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
  rosterMembers?: Array<{ name: string; phone: string | null | undefined }>;
  defaultMessage?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  label?: string;
}

export function GroupTextButton({
  phoneNumbers,
  rosterMembers,
  defaultMessage = "",
  className,
  size = "sm",
  variant = "outline",
  label = "Group Text",
}: GroupTextButtonProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messageBody, setMessageBody] = useState(defaultMessage);

  const normalizePhone = (phone: string) => {
    const trimmed = phone.trim();
    if (!trimmed) return "";
    const hasPlusPrefix = trimmed.startsWith("+");
    const digitsOnly = trimmed.replace(/\D/g, "");
    if (!digitsOnly) return "";
    return hasPlusPrefix ? `+${digitsOnly}` : digitsOnly;
  };

  const formatAppleRecipient = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length === 10) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
      return `1-${digitsOnly.slice(1, 4)}-${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
    }
    return phone;
  };

  const recipientEntries = (rosterMembers || [])
    .map((member) => ({
      name: member.name,
      phone: member.phone ? normalizePhone(member.phone) : "",
    }))
    .filter((entry) => !!entry.name);

  const fallbackRecipientEntries = recipientEntries.length > 0
    ? recipientEntries
    : phoneNumbers.map((phone, index) => ({
        name: `Roster Member ${index + 1}`,
        phone: phone ? normalizePhone(phone) : "",
      }));

  const recipients = fallbackRecipientEntries
    .map((entry) => entry.phone)
    .filter((phone): phone is string => Boolean(phone));

  const resolvedEntries = fallbackRecipientEntries.filter(
    (entry): entry is { name: string; phone: string } => Boolean(entry.phone)
  );

  const duplicatePhoneMap = resolvedEntries.reduce((acc, entry) => {
    const names = acc.get(entry.phone) || [];
    names.push(entry.name);
    acc.set(entry.phone, names);
    return acc;
  }, new Map<string, string[]>());

  const duplicatePhones = Array.from(duplicatePhoneMap.entries()).filter(([, names]) => names.length > 1);

  const unresolvedNames = fallbackRecipientEntries
    .filter((entry) => !entry.phone)
    .map((entry) => entry.name);

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
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMacDesktop = /Macintosh/i.test(navigator.userAgent) && !isIOS;
    const body = messageBody.trim();
    const unresolvedSet = new Set(unresolvedNames);
    const resolvedByName = resolvedEntries.map((entry) => ({ name: entry.name, phone: entry.phone }));
    console.info("[GroupTextButton] recipient resolution", {
      totalRosterMembers: fallbackRecipientEntries.length,
      resolvedCount: recipients.length,
      resolvedByName,
      unresolvedNames: Array.from(unresolvedSet),
      duplicatePhones: duplicatePhones.map(([phone, names]) => ({ phone, names })),
    });

    if (isIOS || isMacDesktop) {
      const addresses = recipients
        .map((phone) => encodeURIComponent(formatAppleRecipient(phone)))
        .join(",");
      const bodyParam = body ? `&body=${encodeURIComponent(body)}` : "";
      window.open(`sms://open?addresses=${addresses}${bodyParam}`, "_self");
      setIsOpen(false);
      return;
    }

    const separator = isAndroid ? ";" : ",";
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
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs space-y-1">
            <p className="text-muted-foreground">
              Resolved recipients: {recipients.length}
            </p>
            {duplicatePhones.length > 0 && (
              <p className="text-amber-600">
                Duplicate phones: {duplicatePhones.map(([phone, names]) => `${names.join(" / ")} -> ${phone}`).join(" | ")}
              </p>
            )}
            {unresolvedNames.length > 0 && (
              <p className="text-amber-600">
                Missing phone for: {unresolvedNames.join(", ")}
              </p>
            )}
            <div className="max-h-24 overflow-auto rounded border border-border/50 bg-background/70 p-1.5 space-y-0.5">
              {resolvedEntries.map((entry) => (
                <p key={`${entry.name}-${entry.phone}`} className="font-mono text-[11px]">
                  {entry.name} - {entry.phone}
                </p>
              ))}
            </div>
          </div>
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
