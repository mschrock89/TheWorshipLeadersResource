import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ModerationReport = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  content_type: string;
  content_id: string | null;
  reason: string;
  content_snapshot: Record<string, unknown>;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};

export function ModerationInbox() {
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["moderation-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("moderation_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as ModerationReport[];
    },
  });

  const updateStatus = async (report: ModerationReport, status: ModerationReport["status"]) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("moderation_reports")
      .update({ status, reviewed_by: user?.id || null, reviewed_at: new Date().toISOString() })
      .eq("id", report.id);
    if (error) {
      toast.error(`Could not update report: ${error.message}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["moderation-reports"] });
    toast.success("Moderation report updated");
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Reports and block actions from members appear here for administrator review.</p>
      {reports.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No content reports yet.</CardContent></Card>
      ) : reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-destructive" />
                <span className="font-medium capitalize">{report.content_type.replaceAll("_", " ")}</span>
                <Badge variant={report.status === "pending" ? "destructive" : "secondary"}>{report.status}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm"><strong>Reason:</strong> {report.reason}</p>
            <p className="break-all text-xs text-muted-foreground">Reported user: {report.reported_user_id || "deleted account"} · Reporter: {report.reporter_id}</p>
            {report.content_snapshot && Object.keys(report.content_snapshot).length > 0 ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify(report.content_snapshot, null, 2)}</pre>
            ) : null}
            {report.status === "pending" ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void updateStatus(report, "reviewing")}>Mark reviewing</Button>
                <Button size="sm" onClick={() => void updateStatus(report, "resolved")}>Resolve</Button>
                <Button size="sm" variant="ghost" onClick={() => void updateStatus(report, "dismissed")}>Dismiss</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
