import { useEffect, useState } from "react";
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
import { buildBibleHref } from "@/lib/bible";
import { toast } from "sonner";

const DEVO_PAGE_GRADIENT =
  "bg-[linear-gradient(180deg,rgba(21,30,37,0.98),rgba(13,19,24,1)_42%,rgba(10,14,18,1))]";

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

function DevoAssignmentPanel({ assignment }: { assignment: DevoAssignment }) {
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
    <section className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {assignment.chapter_reference}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {assignment.series_title || assignment.series?.title || "Devotional assignment"}
            {assignment.scheduled_post_at
              ? ` · Goes live ${formatDevoPostDay(assignment.scheduled_post_at)} at ${formatDevoPostTime(assignment.scheduled_post_at)}`
              : ""}
          </p>
        </div>
        <Badge variant={statusVariant(assignment.status)} className="shrink-0">
          {statusLabel(assignment.status)}
        </Badge>
      </div>

      {formatSeriesWindow(assignment.series?.starts_at, assignment.series?.ends_at) ? (
        <p className="text-sm text-muted-foreground">
          Series window: {formatSeriesWindow(assignment.series?.starts_at, assignment.series?.ends_at)}
        </p>
      ) : null}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {assignment.permission_starts_at && new Date(assignment.permission_starts_at).getTime() > Date.now()
          ? `Feed writing unlocks ${formatDevoPostDay(assignment.permission_starts_at)} (${assignment.permission_duration_days ?? 7} days before go-live). Your post stays private until go-live, then appears on The Feed.`
          : "Write anytime in your open access window before go-live. Your post stays private until that time, then appears on The Feed."}
      </p>
      {assignment.notes ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{assignment.notes}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to={buildBibleHref(assignment.chapter_reference, "ESV")}>
            <BookOpen className="h-4 w-4" />
            Read Passage
          </Link>
        </Button>
        {guideName && guidePath ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openGuide}
            disabled={openingGuide}
            className="h-auto max-w-full gap-2 whitespace-normal px-3 py-2 text-left"
          >
            {openingGuide ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <span className="break-all">{guideName}</span>
          </Button>
        ) : null}
      </div>

      {!guideName && (
        <p className="text-sm text-muted-foreground">Your admin hasn&apos;t attached a how-to guide yet.</p>
      )}

      {canEdit ? (
        <form className="flex min-h-0 flex-1 flex-col space-y-4" onSubmit={onSave}>
          <div className="space-y-2">
            <Label htmlFor={`title-${assignment.id}`}>Post title</Label>
            <Input
              id={`title-${assignment.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-xl border-white/10 bg-black/20"
              required
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <Label htmlFor={`body-${assignment.id}`}>Your devotion</Label>
            <Textarea
              id={`body-${assignment.id}`}
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your reflection here…"
              className="min-h-[42vh] flex-1 resize-y rounded-xl border-white/10 bg-black/20 text-base leading-7 sm:min-h-[320px]"
              required
            />
          </div>
          <Button type="submit" disabled={savePost.isPending} className="h-11 w-full gap-2 sm:w-auto">
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
    </section>
  );
}

export default function Devo() {
  const { data: assignments = [], isLoading } = useMyDevoAssignments();

  return (
    <RefreshableContainer
      queryKeys={[["devo-assignments"]]}
      className={[
        "-mx-4 -my-5 min-h-[calc(100dvh-3.5rem)] overflow-x-hidden px-4 py-5 sm:-mx-6 sm:-my-7 sm:px-6 sm:py-7",
        DEVO_PAGE_GRADIENT,
      ].join(" ")}
    >
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 sm:space-y-8">
        <div>
          <Breadcrumb className="mb-3">
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

          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">DEVO</h1>
              <p className="text-sm text-muted-foreground">
                Write early — your post goes live on The Feed at your assigned day and time
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
            <Skeleton className="h-40 w-full rounded-xl bg-white/5" />
          </div>
        ) : assignments.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            You don&apos;t have any active devotionals right now.
          </p>
        ) : (
          <div className="space-y-10 divide-y divide-white/8 sm:space-y-12">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="pt-0 first:pt-0 [&:not(:first-child)]:pt-10 sm:[&:not(:first-child)]:pt-12">
                <DevoAssignmentPanel assignment={assignment} />
              </div>
            ))}
          </div>
        )}
      </div>
    </RefreshableContainer>
  );
}
