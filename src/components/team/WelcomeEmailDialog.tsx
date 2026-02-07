import { useState } from "react";
import { Mail, Send, Loader2, CheckCircle, AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Profile } from "@/hooks/useProfiles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { EmailPreviewDialog } from "./EmailPreviewDialog";

interface WelcomeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  mode: "bulk" | "individual" | "resend";
  selectedMember?: Profile;
  onEmailSent?: () => void;
}

export function WelcomeEmailDialog({
  open,
  onOpenChange,
  profiles,
  mode,
  selectedMember,
  onEmailSent,
}: WelcomeEmailDialogProps) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ sent: number; failed: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Filter profiles that haven't received emails yet for bulk mode
  const eligibleProfiles = mode === "bulk" 
    ? profiles.filter(p => !p.welcome_email_sent_at)
    : mode === "resend"
    ? profiles.filter(p => p.welcome_email_sent_at)
    : [];

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(eligibleProfiles.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleProfile = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSend = async () => {
    setIsSending(true);
    setResults(null);

    try {
      let userIds: string[] = [];
      let isResend = false;

      if (mode === "individual" && selectedMember) {
        userIds = [selectedMember.id];
        isResend = !!selectedMember.welcome_email_sent_at;
      } else if (mode === "bulk") {
        userIds = Array.from(selectedIds);
      } else if (mode === "resend") {
        userIds = Array.from(selectedIds);
        isResend = true;
      }

      if (userIds.length === 0) {
        toast({
          title: "No recipients selected",
          description: "Please select at least one team member to send emails to.",
          variant: "destructive",
        });
        setIsSending(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-welcome-email", {
        body: { userIds, isResend },
      });

      if (error) throw error;

      setResults({ sent: data.sent, failed: data.failed });

      if (data.sent > 0) {
        toast({
          title: "Emails sent successfully",
          description: `Sent ${data.sent} welcome email${data.sent !== 1 ? "s" : ""}${data.failed > 0 ? ` (${data.failed} failed)` : ""}.`,
        });
        onEmailSent?.();
      } else {
        toast({
          title: "Failed to send emails",
          description: "No emails were sent. Please check the Resend configuration.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending emails:", error);
      toast({
        title: "Error sending emails",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setResults(null);
    onOpenChange(false);
  };

  const getTitle = () => {
    if (mode === "individual" && selectedMember) {
      return selectedMember.welcome_email_sent_at 
        ? "Resend Welcome Email" 
        : "Send Welcome Email";
    }
    if (mode === "resend") return "Resend Welcome Emails";
    return "Send Welcome Emails";
  };

  const getDescription = () => {
    if (mode === "individual" && selectedMember) {
      return selectedMember.welcome_email_sent_at
        ? `Resend the welcome email to ${selectedMember.full_name || selectedMember.email}?`
        : `Send a welcome email to ${selectedMember.full_name || selectedMember.email}?`;
    }
    if (mode === "resend") {
      return `Select team members who need a reminder email.`;
    }
    return `Select team members who haven't received a welcome email yet.`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {mode === "individual" && selectedMember ? (
          <div className="py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                {selectedMember.full_name?.[0] || selectedMember.email[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium">{selectedMember.full_name || "No name"}</p>
                <p className="text-sm text-muted-foreground">{selectedMember.email}</p>
              </div>
            </div>
            {selectedMember.welcome_email_sent_at && (
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Previously sent on {new Date(selectedMember.welcome_email_sent_at).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <div className="py-2">
            {eligibleProfiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>
                  {mode === "resend" 
                    ? "No team members have received welcome emails yet."
                    : "All team members have already received welcome emails."}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    id="select-all"
                    checked={selectedIds.size === eligibleProfiles.length && eligibleProfiles.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Select all ({eligibleProfiles.length})
                  </label>
                </div>
                <ScrollArea className="h-[200px] rounded-md border p-2">
                  <div className="space-y-2">
                    {eligibleProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleToggleProfile(profile.id)}
                      >
                        <Checkbox
                          checked={selectedIds.has(profile.id)}
                          onCheckedChange={() => handleToggleProfile(profile.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {profile.full_name || "No name"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {profile.email}
                          </p>
                        </div>
                        {mode === "resend" && profile.welcome_email_sent_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(profile.welcome_email_sent_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedIds.size} selected
                </p>
              </>
            )}
          </div>
        )}

        {results && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            <span>
              {results.sent} email{results.sent !== 1 ? "s" : ""} sent
              {results.failed > 0 && ` (${results.failed} failed)`}
            </span>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="ghost" 
            onClick={() => setShowPreview(true)}
            className="sm:mr-auto"
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview Email
          </Button>
          <Button variant="outline" onClick={handleClose}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              onClick={handleSend}
              disabled={isSending || (mode !== "individual" && selectedIds.size === 0)}
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send {mode === "individual" ? "Email" : `${selectedIds.size} Email${selectedIds.size !== 1 ? "s" : ""}`}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <EmailPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        previewName={mode === "individual" && selectedMember?.full_name 
          ? selectedMember.full_name.split(" ")[0] 
          : "John"}
        previewEmail={mode === "individual" && selectedMember?.email 
          ? selectedMember.email 
          : "john.smith@example.com"}
        isResend={mode === "resend" || (mode === "individual" && !!selectedMember?.welcome_email_sent_at)}
      />
    </Dialog>
  );
}
