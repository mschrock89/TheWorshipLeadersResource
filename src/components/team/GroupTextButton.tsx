import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getMinistryLabel } from "@/lib/constants";

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
  rosterMembers?: Array<{
    name: string;
    phone: string | null | undefined;
    ministryTypes?: string[] | null;
    positions?: string[] | null;
  }>;
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
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

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
      id: `${member.name}-${normalizePhone(member.phone || "")}`,
      name: member.name,
      phone: member.phone ? normalizePhone(member.phone) : "",
      ministryTypes: Array.from(
        new Set(
          (member.ministryTypes || []).map((ministry) =>
            ministry === "weekend_team" || ministry === "sunday_am" ? "weekend" : ministry
          )
        )
      ),
      positions: member.positions || [],
    }))
    .filter((entry) => !!entry.name);

  const fallbackRecipientEntries = recipientEntries.length > 0
    ? recipientEntries
    : phoneNumbers.map((phone, index) => ({
        id: `Roster Member ${index + 1}-${normalizePhone(phone || "")}`,
        name: `Roster Member ${index + 1}`,
        phone: phone ? normalizePhone(phone) : "",
        ministryTypes: [],
        positions: [],
      }));

  const recipients = fallbackRecipientEntries
    .map((entry) => entry.phone)
    .filter((phone): phone is string => Boolean(phone));

  const resolvedEntries = fallbackRecipientEntries.filter(
    (entry): entry is {
      id: string;
      name: string;
      phone: string;
      ministryTypes: string[];
      positions: string[];
    } => Boolean(entry.phone)
  );

  const availableMinistries = useMemo(
    () =>
      Array.from(
        new Set(
          resolvedEntries.flatMap((entry) =>
            entry.ministryTypes.length > 0 ? entry.ministryTypes : ["unassigned"]
          )
        )
      ).sort((a, b) => getMinistryLabel(a).localeCompare(getMinistryLabel(b))),
    [resolvedEntries]
  );

  const hasMinistrySelection = availableMinistries.length > 1;

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

  const visibleRecipients = useMemo(() => {
    if (!hasMinistrySelection) {
      return resolvedEntries;
    }

    const allowedMinistries = new Set(selectedMinistries);
    return resolvedEntries.filter((entry) => {
      const entryMinistries = entry.ministryTypes.length > 0 ? entry.ministryTypes : ["unassigned"];
      return entryMinistries.some((ministry) => allowedMinistries.has(ministry));
    });
  }, [hasMinistrySelection, resolvedEntries, selectedMinistries]);

  useEffect(() => {
    if (!isOpen) return;

    const visibleRecipientIds = new Set(visibleRecipients.map((entry) => entry.id));
    setSelectedRecipients((current) => current.filter((id) => visibleRecipientIds.has(id)));
  }, [isOpen, visibleRecipients]);

  const selectedResolvedRecipients = useMemo(() => {
    const selectedSet = new Set(selectedRecipients);
    return visibleRecipients.filter((entry) => selectedSet.has(entry.id));
  }, [selectedRecipients, visibleRecipients]);

  const selectedPhones = selectedResolvedRecipients.map((entry) => entry.phone);

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
    setSelectedMinistries(availableMinistries);
    setSelectedRecipients(resolvedEntries.map((entry) => entry.id));
    setIsOpen(true);
  };

  const toggleMinistry = (ministry: string, checked: boolean) => {
    const nextMinistries = checked
      ? Array.from(new Set([...selectedMinistries, ministry]))
      : selectedMinistries.filter((value) => value !== ministry);
    const nextMinistrySet = new Set(nextMinistries);

    setSelectedMinistries(nextMinistries);
    setSelectedRecipients((current) => {
      const currentSet = new Set(current);
      const ministryRecipients = resolvedEntries.filter((entry) => {
        const entryMinistries = entry.ministryTypes.length > 0 ? entry.ministryTypes : ["unassigned"];
        return entryMinistries.includes(ministry);
      });

      if (checked) {
        ministryRecipients.forEach((entry) => currentSet.add(entry.id));
      } else {
        ministryRecipients.forEach((entry) => {
          const remainingMinistries = (entry.ministryTypes.length > 0 ? entry.ministryTypes : ["unassigned"])
            .filter((value) => value !== ministry);
          const stillVisible = remainingMinistries.some((value) => nextMinistrySet.has(value));
          if (!stillVisible) {
            currentSet.delete(entry.id);
          }
        });
      }

      return Array.from(currentSet);
    });
  };

  const toggleRecipient = (recipientId: string, checked: boolean) => {
    setSelectedRecipients((current) =>
      checked ? Array.from(new Set([...current, recipientId])) : current.filter((id) => id !== recipientId)
    );
  };

  const handleOpenMessages = () => {
    if (selectedPhones.length === 0) {
      toast({
        title: "No recipients selected",
        description: "Choose at least one ministry or roster member before opening Messages.",
        variant: "destructive",
      });
      return;
    }

    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMacDesktop = /Macintosh/i.test(navigator.userAgent) && !isIOS;
    const body = messageBody.trim();
    const unresolvedSet = new Set(unresolvedNames);
    const resolvedByName = selectedResolvedRecipients.map((entry) => ({ name: entry.name, phone: entry.phone }));
    console.info("[GroupTextButton] recipient resolution", {
      totalRosterMembers: fallbackRecipientEntries.length,
      resolvedCount: selectedPhones.length,
      resolvedByName,
      unresolvedNames: Array.from(unresolvedSet),
      duplicatePhones: duplicatePhones.map(([phone, names]) => ({ phone, names })),
    });

    if (isIOS || isMacDesktop) {
      const addresses = selectedPhones
        .map((phone) => encodeURIComponent(formatAppleRecipient(phone)))
        .join(",");
      const bodyParam = body ? `&body=${encodeURIComponent(body)}` : "";
      window.open(`sms://open?addresses=${addresses}${bodyParam}`, "_self");
      setIsOpen(false);
      return;
    }

    const separator = isAndroid ? ";" : ",";
    const bodyParam = body ? `?body=${encodeURIComponent(body)}` : "";
    window.open(`sms:${selectedPhones.join(separator)}${bodyParam}`, "_self");
    setIsOpen(false);
  };

  const recipientGroups = useMemo(() => {
    const groups = new Map<string, typeof resolvedEntries>();

    visibleRecipients.forEach((entry) => {
      const entryMinistries = entry.ministryTypes.length > 0 ? entry.ministryTypes : ["unassigned"];
      const primaryMinistry = entryMinistries.find((ministry) => selectedMinistries.includes(ministry)) || entryMinistries[0];
      const group = groups.get(primaryMinistry) || [];
      group.push(entry);
      groups.set(primaryMinistry, group);
    });

    return Array.from(groups.entries()).sort((a, b) => getMinistryLabel(a[0]).localeCompare(getMinistryLabel(b[0])));
  }, [selectedMinistries, visibleRecipients]);

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
              This will open your device messaging app with {selectedPhones.length} roster member{selectedPhones.length === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          {hasMinistrySelection && (
            <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Ministries on this date</p>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => {
                    setSelectedMinistries(availableMinistries);
                    setSelectedRecipients(resolvedEntries.map((entry) => entry.id));
                  }}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => {
                    setSelectedMinistries([]);
                    setSelectedRecipients([]);
                  }}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableMinistries.map((ministry) => {
                  const checked = selectedMinistries.includes(ministry);
                  return (
                    <label
                      key={ministry}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/70 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleMinistry(ministry, value === true)}
                      />
                      <span>{ministry === "unassigned" ? "Unassigned" : getMinistryLabel(ministry)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Include recipients</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRecipients(visibleRecipients.map((entry) => entry.id))}
                  disabled={visibleRecipients.length === 0}
                >
                  Select visible
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRecipients((current) => current.filter((id) => !visibleRecipients.some((entry) => entry.id === id)))}
                  disabled={visibleRecipients.length === 0}
                >
                  Clear visible
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-3 overflow-auto rounded border border-border/50 bg-background/70 p-2">
              {recipientGroups.length === 0 ? (
                <p className="px-2 py-1 text-sm text-muted-foreground">No recipients match the selected ministries.</p>
              ) : (
                recipientGroups.map(([ministry, group]) => (
                  <div key={ministry} className="space-y-1.5">
                    <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {ministry === "unassigned" ? "Unassigned" : getMinistryLabel(ministry)}
                    </p>
                    {group.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedRecipients.includes(entry.id)}
                          onCheckedChange={(value) => toggleRecipient(entry.id, value === true)}
                        />
                        <span className="flex-1">{entry.name}</span>
                        <span className="text-xs text-muted-foreground">{entry.phone}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
          <Textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            placeholder="Add an optional message"
            rows={5}
          />
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs space-y-1">
            <p className="text-muted-foreground">
              Selected recipients: {selectedPhones.length} of {resolvedEntries.length}
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
              {selectedResolvedRecipients.map((entry) => (
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
