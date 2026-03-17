import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveCovenant, useSignCovenant } from "@/hooks/useCovenant";
import { useAuth } from "@/hooks/useAuth";
import { ExternalLink, FileSignature, Loader2, ShieldCheck } from "lucide-react";

export function CovenantCard() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useActiveCovenant(user?.id);
  const signCovenant = useSignCovenant();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [typedName, setTypedName] = useState("");

  const defaultName = useMemo(() => {
    return user?.user_metadata?.full_name?.trim() || user?.email || "";
  }, [user?.email, user?.user_metadata]);

  useEffect(() => {
    if (!typedName) {
      setTypedName(defaultName);
    }
  }, [defaultName, typedName]);

  useEffect(() => {
    if (data?.signature) {
      setAgreed(true);
      setTypedName(data.signature.typed_name);
    } else if (!data?.signature) {
      setAgreed(false);
      setTypedName(defaultName);
    }
  }, [data?.signature, defaultName]);

  const handleOpenPdf = () => {
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleSign = async () => {
    if (!user || !data?.document) return;

    await signCovenant.mutateAsync({
      documentId: data.document.id,
      typedName,
      userId: user.id,
    });
    setIsDialogOpen(false);
  };

  if (isLoading) {
    return (
      <Card className="mb-8 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.document) {
    return (
      <Card className="mb-8 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Team Covenant</CardTitle>
              <CardDescription>Shared standards and expectations for every team member.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No Covenant has been published yet.
            {isAdmin ? " Upload one in Admin Tools and it will appear here for everyone." : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  const signedAt = data.signature ? new Date(data.signature.signed_at).toLocaleString() : null;

  return (
    <Card className="mb-8 overflow-hidden border-primary/20 bg-[linear-gradient(145deg,rgba(245,158,11,0.08),rgba(15,23,42,0.02))]">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileSignature className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{data.document.title}</CardTitle>
                <Badge variant={data.signature ? "secondary" : "destructive"}>
                  {data.signature ? "Signed" : "Action Required"}
                </Badge>
                <Badge variant="outline">{data.document.version_label}</Badge>
              </div>
              <CardDescription>
                {data.document.description || "Review the Covenant and add your signature for the current version."}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" className="gap-2 self-start" onClick={handleOpenPdf}>
            <ExternalLink className="h-4 w-4" />
            Open PDF
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {data.signature ? `Signed by ${data.signature.typed_name}` : "Your signature is still needed"}
          </p>
          <p className="text-sm text-muted-foreground">
            {data.signature
              ? `Recorded on ${signedAt}`
              : "Open the Covenant, confirm your agreement, and submit your name to sign."}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <FileSignature className="h-4 w-4" />
              {data.signature ? "Review Covenant" : "Review and Sign"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{data.document.title}</DialogTitle>
              <DialogDescription>
                Version {data.document.version_label}. Review the PDF below, then complete your signature section.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border bg-muted/20">
                {data.signedUrl ? (
                  <iframe
                    src={data.signedUrl}
                    title={data.document.title}
                    className="h-[52vh] w-full bg-white"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center p-6 text-sm text-muted-foreground">
                    The PDF preview is unavailable right now. Use "Open PDF" to view it in a new tab.
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Digital Signature</p>
                  <p className="text-xs text-muted-foreground">
                    Typing your name records your acknowledgment of this Covenant version.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="covenant-typed-name">Typed full name</Label>
                  <Input
                    id="covenant-typed-name"
                    value={typedName}
                    onChange={(event) => setTypedName(event.target.value)}
                    disabled={!!data.signature}
                    placeholder="Your full name"
                  />
                </div>

                <div className="flex items-start gap-3 rounded-md border border-border/80 bg-muted/20 p-3">
                  <Checkbox
                    id="covenant-agreement"
                    checked={agreed}
                    onCheckedChange={(checked) => setAgreed(Boolean(checked))}
                    disabled={!!data.signature}
                  />
                  <Label htmlFor="covenant-agreement" className="text-sm font-normal leading-6">
                    I have read this Covenant and agree to uphold these standards as part of the team.
                  </Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleOpenPdf}>
                Open PDF
              </Button>
              {!data.signature ? (
                <Button
                  onClick={handleSign}
                  disabled={!agreed || !typedName.trim() || signCovenant.isPending}
                  className="gap-2"
                >
                  {signCovenant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                  Sign Covenant
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
