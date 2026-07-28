import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Home, Loader2 } from "lucide-react";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchDevoFeedPostDraft,
  formatDevoPostDay,
  formatDevoPostTime,
  getDevoGuideSignedUrl,
  useMyDevoAssignments,
  useSaveDevoScheduledPost,
  type DevoAssignment,
  type DevoAssignmentStatus,
} from "@/hooks/useDevoAssignments";
import { toast } from "sonner";

function statusLabel(status: DevoAssignmentStatus) {
  switch (status) {
    case "assigned":
      return "Assigned";
    case "guide_uploaded":
      return "In progress";
    case "scheduled":
      return "Scheduled";
    case "posted":
      return "Live";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusVariant(status: DevoAssignmentStatus): "default" | "secondary" | "outline" {
  if (status === "posted") return "default";
  if (status === "scheduled" || status === "guide_uploaded") return "secondary";
  return "outline";
}

function formatSeriesWindow(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt || !endsAt) return null;
  const start = new Date(startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = new Date(endsAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

function DevoAssignmentCard({ assignment }: { assignment: DevoAssignment }) {
  const savePost = useSaveDevoScheduledPost();
  const [openingGuide, setOpeningGuide] = useState(false);
  const [title, setTitle] = useState(`${assignment.chapter_reference} Devo`);
  const [body, setBody] = useState("");
  const isLive = assignment.status === "posted";
  const canEdit = !isLive;
  const guidePath = assignment.series?.guide_storage_path || null;
  const guideName = assignment.series?.guide_file_name || null;

  const { data: draft } = useQuery({
    queryKey: ["devo-feed-draft", assignment.feed_post_id],
    enabled: !!assignment.feed_post_id,
    queryFn: () => fetchDevoFeedPostDraft(assignment.feed_post_id),
  });

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title || `${assignment.chapter_reference} Devo`);
    setBody(draft.body || "");
  }, [draft, assignment.chapter_reference]);

  const openGuide = async () => {
    if (!guidePath) return;
    setOpeningGuide(true);
    try {
      const url = await getDevoGuideSignedUrl(guidePath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open guide");
    } finally {
      setOpeningGuide(false);
    }
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    await savePost.mutateAsync({ assignment, title, body });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xl">{assignment.chapter_reference}</CardTitle>
            <CardDescription className="mt-1">
              {assignment.series_title || assignment.series?.title || "Devotional assignment"}
              {assignment.scheduled_post_at
                ? ` · Goes live ${formatDevoPostDay(assignment.scheduled_post_at)} at ${formatDevoPostTime(assignment.scheduled_post_at)}`
                : ""}
            </CardDescription>
          </div>
          <Badge variant={statusVariant(assignment.status)}>{statusLabel(assignment.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {formatSeriesWindow(assignment.series?.starts_at, assignment.series?.ends_at) ? (
          <p className="text-sm text-muted-foreground">
            Series window: {formatSeriesWindow(assignment.series?.starts_at, assignment.series?.ends_at)}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {assignment.permission_starts_at && new Date(assignment.permission_starts_at).getTime() > Date.now()
            ? `Feed writing unlocks ${formatDevoPostDay(assignment.permission_starts_at)} (${assignment.permission_duration_days ?? 7} days before go-live). Your post stays private until go-live, then appears on The Feed.`
            : "Write anytime in your open access window before go-live. Your post stays private until that time, then appears on The Feed."}
        </p>
        {assignment.notes ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{assignment.notes}</p>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">How-to guide</p>
          {guideName && guidePath ? (
            <Button type="button" variant="outline" size="sm" onClick={openGuide} disabled={openingGuide} className="gap-2">
              {openingGuide ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {guideName}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Your admin hasn&apos;t attached a how-to guide yet.</p>
          )}
        </div>

        {canEdit ? (
          <form className="space-y-3" onSubmit={onSave}>
            <div className="space-y-2">
              <Label htmlFor={`title-${assignment.id}`}>Post title</Label>
              <Input
                id={`title-${assignment.id}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`body-${assignment.id}`}>Your devotion</Label>
              <Textarea
                id={`body-${assignment.id}`}
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your reflection here…"
                required
              />
            </div>
            <Button type="submit" disabled={savePost.isPending} className="gap-2">
              {savePost.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {assignment.status === "scheduled" ? "Update scheduled post" : "Save for go-live"}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This DEVO is live on The Feed.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/feed">View The Feed</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Devo() {
  const { data: assignments = [], isLoading } = useMyDevoAssignments();

  return (
    <RefreshableContainer queryKeys={[["devo-assignments"]]}>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard" className="flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>DEVO</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">DEVO</h1>
            <p className="text-sm text-muted-foreground">
              Write early — your post goes live on The Feed at your assigned day and time
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : assignments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              You don&apos;t have any active devotionals right now.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <DevoAssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        )}
      </div>
    </RefreshableContainer>
  );
}
