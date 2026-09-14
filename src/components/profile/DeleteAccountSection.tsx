import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CONFIRM_PHRASE = "DELETE";

async function getFunctionErrorMessage(
  error: unknown,
  response: { error: { message?: string } | null; data?: { error?: string; hint?: string } | null },
  fallback: string,
) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      const errorMessage =
        typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : fallback;
      const hintMessage =
        typeof payload?.hint === "string" && payload.hint.trim()
          ? payload.hint.trim()
          : "";
      return hintMessage ? `${errorMessage} ${hintMessage}` : errorMessage;
    } catch {
      // Fall through.
    }
  }

  const hint = response.data?.hint?.trim();
  const message =
    response.data?.error?.trim() ||
    (error instanceof Error ? error.message.trim() : "") ||
    response.error?.message?.trim() ||
    fallback;

  return hint ? `${message} ${hint}` : message;
}

export function DeleteAccountSection() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleDelete = async () => {
    if (!canConfirm || isDeleting) return;

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "You must be signed in", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke("delete-own-account", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error, response, "Failed to delete account"));
      }

      if (response.data?.error) {
        throw new Error(await getFunctionErrorMessage(response.error, response, "Failed to delete account"));
      }

      try {
        await signOut();
      } catch (signOutError) {
        console.error("Sign out after account deletion failed:", signOutError);
      }

      toast({
        title: "Account deleted",
        description: "Your account and associated data have been removed.",
      });
      navigate("/");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete account";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setOpen(false);
      setConfirmText("");
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-destructive/30 p-4 bg-destructive/5">
      <Label className="flex items-center gap-2 text-destructive">
        <Trash2 className="h-4 w-4" />
        Delete Account
      </Label>
      <p className="text-sm text-muted-foreground">
        Permanently delete your account and the personal data stored with it. This cannot be undone.
      </p>
      <Button
        type="button"
        variant="destructive"
        className="w-full gap-2"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Delete Account
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isDeleting) return;
          setOpen(nextOpen);
          if (!nextOpen) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your login, profile, and personal data. Type {CONFIRM_PHRASE} to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            disabled={isDeleting}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!canConfirm || isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
