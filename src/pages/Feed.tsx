import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpenText,
  ChevronDown,
  Clock3,
  Edit3,
  Filter,
  Heart,
  Loader2,
  MessageSquare,
  PenSquare,
  PlayCircle,
  Sparkles,
  Trash2,
  Youtube,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  type FeedCategory,
  type FeedCommentRecord,
  type FeedPostInput,
  type FeedPostRecord,
  useCreateFeedComment,
  useCreateFeedPost,
  useDeleteFeedPost,
  useFeedPosts,
  useToggleFeedLike,
  useUpdateFeedPost,
} from "@/hooks/useFeed";
import { cn } from "@/lib/utils";

type FeedTab = "all" | FeedCategory;

const categoryLabels: Record<FeedTab, string> = {
  all: "All Posts",
  blog: "Blog Style",
  scripture: "Scripture",
  video: "Videos",
};

type ComposerState = {
  title: string;
  body: string;
  scriptureReference: string;
  youtubeLink: string;
};

const emptyComposerState: ComposerState = {
  title: "",
  body: "",
  scriptureReference: "",
  youtubeLink: "",
};

function categoryIcon(category: FeedCategory) {
  switch (category) {
    case "scripture":
      return BookOpenText;
    case "video":
      return Youtube;
    default:
      return PenSquare;
  }
}

function extractYouTubeId(url: string) {
  const trimmed = url.trim();

  if (!trimmed) return null;

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  const standardMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (standardMatch) return standardMatch[1];

  const embedMatch = trimmed.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  return null;
}

function inferCategory(state: ComposerState, youtubeId: string | null): FeedCategory {
  if (youtubeId) return "video";
  if (state.scriptureReference.trim()) return "scripture";
  return "blog";
}

function buildTitle(state: ComposerState, category: FeedCategory) {
  const explicitTitle = state.title.trim();
  if (explicitTitle) return explicitTitle;

  if (category === "scripture" && state.scriptureReference.trim()) {
    return `Scripture reflection on ${state.scriptureReference.trim()}`;
  }

  if (category === "video") {
    return "Shared YouTube resource";
  }

  const normalized = state.body.trim().replace(/\s+/g, " ");
  if (!normalized) return "New post";
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69).trimEnd()}...`;
}

function timeAgoLabel(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleDateString();
}

function buildComposerPayload(state: ComposerState): FeedPostInput | null {
  const youtubeId = extractYouTubeId(state.youtubeLink);

  if (!state.body.trim() && !state.title.trim() && !state.scriptureReference.trim() && !state.youtubeLink.trim()) {
    return null;
  }

  if (state.youtubeLink.trim() && !youtubeId) {
    throw new Error("Paste a full YouTube URL and I'll turn it into a video post.");
  }

  const category = inferCategory(state, youtubeId);

  return {
    category,
    title: buildTitle(state, category),
    body: state.body.trim() || null,
    scripture_reference: category === "scripture" ? state.scriptureReference.trim() || null : null,
    youtube_url: youtubeId ? state.youtubeLink.trim() : null,
    youtube_video_id: youtubeId,
  };
}

function PostCard({
  post,
  isAdmin,
  currentUserId,
  onLikeToggle,
  onCommentSubmit,
  onEdit,
  onDelete,
  isTogglingLike,
  isSubmittingComment,
  isDeleting,
}: {
  post: FeedPostRecord;
  isAdmin: boolean;
  currentUserId?: string;
  onLikeToggle: (post: FeedPostRecord) => void;
  onCommentSubmit: (postId: string, body: string) => Promise<void>;
  onEdit: (post: FeedPostRecord) => void;
  onDelete: (post: FeedPostRecord) => void;
  isTogglingLike: boolean;
  isSubmittingComment: boolean;
  isDeleting: boolean;
}) {
  const CategoryIcon = categoryIcon(post.category);
  const [isConversationOpen, setIsConversationOpen] = useState(post.comment_count > 0);
  const [commentBody, setCommentBody] = useState("");

  const handleCommentSubmit = async () => {
    await onCommentSubmit(post.id, commentBody);
    setCommentBody("");
    setIsConversationOpen(true);
  };

  return (
    <Card className="overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(21,30,37,0.96),rgba(13,19,24,0.96))] shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
      <CardContent className="p-0">
        <div className="border-b border-white/6 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11 border border-white/10">
                <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
                  {(post.author_name || "WL")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-foreground">{post.author_name || "Experience Music"}</h3>
                  <span className="text-xs text-muted-foreground/60">•</span>
                  <span className="text-xs text-muted-foreground">{timeAgoLabel(post.created_at)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{post.updated_at !== post.created_at ? "Edited" : "Published"}</span>
                </div>
              </div>
            </div>

            <Badge
              variant="secondary"
              className="border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              <CategoryIcon className="mr-1.5 h-3.5 w-3.5" />
              {post.category}
            </Badge>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{post.title}</h2>

            {post.body ? (
              <p className="max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
                {post.body}
              </p>
            ) : null}

            {post.scripture_reference ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/8 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                  {post.scripture_reference}
                </p>
              </div>
            ) : null}
          </div>

          {post.youtube_video_id ? (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/30">
              <div className="aspect-video">
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube.com/embed/${post.youtube_video_id}`}
                  title={post.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{post.title}</p>
                  <p className="text-xs text-muted-foreground">Shared for leadership inspiration</p>
                </div>
                {post.youtube_url ? (
                  <a
                    href={post.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Open YouTube video"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3 border-t border-white/6 pt-5 text-sm text-muted-foreground">
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-2 transition-colors hover:bg-white/5 hover:text-foreground",
                post.liked_by_me && "bg-primary/10 text-primary"
              )}
              onClick={() => onLikeToggle(post)}
              disabled={isTogglingLike}
            >
              {isTogglingLike ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
              {post.like_count}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 transition-colors hover:bg-white/5 hover:text-foreground"
              onClick={() => setIsConversationOpen((current) => !current)}
            >
              <MessageSquare className="h-4 w-4" />
              Conversation
              <span>{post.comment_count}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isConversationOpen && "rotate-180")} />
            </button>
            {isAdmin ? (
              <>
                <button
                  className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-2 transition-colors hover:bg-white/5 hover:text-foreground"
                  onClick={() => onEdit(post)}
                >
                  <Edit3 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-destructive transition-colors hover:bg-destructive/10"
                  onClick={() => onDelete(post)}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </button>
              </>
            ) : null}
          </div>

          {isConversationOpen ? (
            <div className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Conversation</p>
                <p className="text-xs text-muted-foreground">{post.comment_count} comment{post.comment_count === 1 ? "" : "s"}</p>
              </div>

              <div className="space-y-3">
                {post.comments.length > 0 ? (
                  post.comments.map((comment: FeedCommentRecord) => (
                    <div key={comment.id} className="rounded-xl border border-white/8 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {comment.author_name || (comment.user_id === currentUserId ? "You" : "Team Member")}
                        </p>
                        <p className="text-xs text-muted-foreground">{timeAgoLabel(comment.created_at)}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{comment.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No conversation yet. Start it below.</p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-white/8 bg-white/5 p-3">
                <Textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value.slice(0, 100))}
                  placeholder="Add to the conversation..."
                  maxLength={100}
                  className="min-h-[88px] resize-y rounded-xl border-white/10 bg-black/20 text-sm leading-6 placeholder:text-muted-foreground/70"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{commentBody.length}/100 characters</p>
                  <Button
                    size="sm"
                    className="rounded-lg bg-gradient-primary text-primary-foreground hover:opacity-95"
                    disabled={isSubmittingComment || !commentBody.trim()}
                    onClick={handleCommentSubmit}
                  >
                    {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Feed() {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const { data: posts = [], isLoading } = useFeedPosts();
  const createPost = useCreateFeedPost();
  const updatePost = useUpdateFeedPost();
  const deletePost = useDeleteFeedPost();
  const toggleLike = useToggleFeedLike();
  const createComment = useCreateFeedComment();
  const [activeTab, setActiveTab] = useState<FeedTab>("all");
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  useEffect(() => {
    const composeType = searchParams.get("compose");
    const sharedReference = searchParams.get("reference");
    const sharedBody = searchParams.get("body");

    if (composeType !== "scripture") return;

    if (!isAdmin) {
      toast({
        title: "Posting is admin-only",
        description: "You can read the feed, but only admins can publish scripture posts.",
        variant: "destructive",
      });
    } else {
      setComposer((current) => ({
        ...current,
        title: current.title || (sharedReference ? `Scripture reflection on ${sharedReference}` : ""),
        scriptureReference: sharedReference || current.scriptureReference,
        body: sharedBody || current.body,
      }));
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      toast({
        title: "Scripture ready to share",
        description: "Your passage has been brought over from the Bible reader.",
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("compose");
    nextParams.delete("reference");
    nextParams.delete("body");
    setSearchParams(nextParams, { replace: true });
  }, [isAdmin, searchParams, setSearchParams, toast]);

  const visiblePosts = useMemo(() => {
    if (activeTab === "all") return posts;
    return posts.filter((post) => post.category === activeTab);
  }, [activeTab, posts]);

  const isSaving = createPost.isPending || updatePost.isPending;

  const resetComposer = () => {
    setComposer(emptyComposerState);
    setEditingPostId(null);
  };

  const handlePublish = async () => {
    if (!isAdmin) return;

    let payload: FeedPostInput | null = null;
    try {
      payload = buildComposerPayload(composer);
    } catch (error) {
      toast({
        title: "Could not prepare post",
        description: error instanceof Error ? error.message : "Please check your post and try again.",
        variant: "destructive",
      });
      return;
    }

    if (!payload) {
      toast({
        title: "Nothing to publish yet",
        description: "Add a title, reflection, scripture, or YouTube link first.",
        variant: "destructive",
      });
      return;
    }

    if (editingPostId) {
      await updatePost.mutateAsync({ id: editingPostId, ...payload });
    } else {
      await createPost.mutateAsync(payload);
    }

    resetComposer();
    setActiveTab("all");
  };

  const handleEdit = (post: FeedPostRecord) => {
    setEditingPostId(post.id);
    setComposer({
      title: post.title,
      body: post.body || "",
      scriptureReference: post.scripture_reference || "",
      youtubeLink: post.youtube_url || "",
    });
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (post: FeedPostRecord) => {
    const confirmed = window.confirm(`Delete "${post.title}" from The Feed?`);
    if (!confirmed) return;
    await deletePost.mutateAsync(post.id);
  };

  const handleToggleLike = async (post: FeedPostRecord) => {
    await toggleLike.mutateAsync({ postId: post.id, liked: post.liked_by_me });
  };

  const handleCommentSubmit = async (postId: string, body: string) => {
    await createComment.mutateAsync({ postId, body });
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-8 overflow-x-hidden">
      <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(53,176,229,0.22),transparent_32%),linear-gradient(135deg,rgba(20,29,35,0.98),rgba(10,15,19,0.98))] px-6 py-7 shadow-[0_28px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(255,184,56,0.10),transparent_60%)] lg:block" />
        <div className="relative grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-5">
            <Badge className="border-0 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-primary">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              The Feed
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Welcome to THE FEED
              </h1>
            </div>
          </div>

          <Card className="border-white/10 bg-black/20 backdrop-blur">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">What belongs in The Feed?</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Pastoral encouragement, set-planning insights, scriptures, rehearsal wins, and trusted
                  video resources.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-4">
                  <p className="text-2xl font-semibold text-foreground">{posts.length}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Posts</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-4">
                  <p className="text-2xl font-semibold text-foreground">
                    {posts.reduce((count, post) => count + post.like_count, 0)}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Likes</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-4">
                  <p className="text-2xl font-semibold text-foreground">
                    {posts.reduce((count, post) => count + (post.comment_count ?? 0), 0)}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Comments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {isAdmin ? (
            <Card
              ref={composerRef}
              className="border-white/10 bg-[linear-gradient(180deg,rgba(20,28,34,0.94),rgba(14,19,24,0.94))]"
            >
              <CardContent className="space-y-5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-foreground">
                      {editingPostId ? "Edit post" : "Start a post"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Share a thought, scripture, or YouTube link with the whole app.
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="max-w-full border border-primary/20 bg-primary/10 text-primary"
                  >
                    {editingPostId ? "Editing" : "Admin Composer"}
                  </Badge>
                </div>

                <div className="grid min-w-0 gap-4">
                  <Input
                    placeholder="Post title"
                    className="rounded-xl border-white/10 bg-black/20"
                    value={composer.title}
                    onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))}
                  />
                  <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <Textarea
                      placeholder="What is God teaching your team right now?"
                      className="min-h-[170px] resize-none rounded-2xl border-white/10 bg-black/20 text-base placeholder:text-muted-foreground/70"
                      value={composer.body}
                      onChange={(event) => setComposer((current) => ({ ...current, body: event.target.value }))}
                    />
                    <div className="space-y-3">
                      <Input
                        placeholder="Paste a YouTube link"
                        className="rounded-xl border-white/10 bg-black/20"
                        value={composer.youtubeLink}
                        onChange={(event) =>
                          setComposer((current) => ({ ...current, youtubeLink: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Add scripture reference"
                        className="rounded-xl border-white/10 bg-black/20"
                        value={composer.scriptureReference}
                        onChange={(event) =>
                          setComposer((current) => ({ ...current, scriptureReference: event.target.value }))
                        }
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          className="rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-95"
                          onClick={handlePublish}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingPostId ? "Update" : "Publish"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl border-white/10 bg-white/5"
                          onClick={resetComposer}
                          disabled={isSaving}
                        >
                          {editingPostId ? "Cancel" : "Clear"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-white/10 bg-transparent shadow-none">
            <CardContent className="flex flex-col gap-4 px-0 pb-0 pt-0 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FeedTab)}>
                <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 sm:w-auto">
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                Showing {visiblePosts.length} post{visiblePosts.length === 1 ? "" : "s"}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {isLoading ? (
              <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(20,28,34,0.94),rgba(14,19,24,0.94))]">
                <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading The Feed...
                </CardContent>
              </Card>
            ) : visiblePosts.length === 0 ? (
              <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(20,28,34,0.94),rgba(14,19,24,0.94))]">
                <CardContent className="space-y-3 p-6">
                  <p className="text-lg font-semibold text-foreground">No posts yet</p>
                  <p className="text-sm text-muted-foreground">
                    {isAdmin
                      ? "Publish the first post to get The Feed started."
                      : "The Feed is ready. Once an admin publishes a post, it will show up here for everyone."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              visiblePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isAdmin={isAdmin}
                  currentUserId={user?.id}
                  onLikeToggle={handleToggleLike}
                  onCommentSubmit={handleCommentSubmit}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isTogglingLike={toggleLike.isPending}
                  isSubmittingComment={createComment.isPending}
                  isDeleting={deletePost.isPending}
                />
              ))
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(18,25,31,0.94),rgba(13,18,22,0.94))]">
            <CardContent className="space-y-4 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Feed Permissions</p>
              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>Everyone signed into the app can read posts and like what resonates.</p>
                <p>Admins can publish, edit, and remove posts to keep the feed helpful and clean.</p>
                <p>Scripture can be sent into this composer directly from the Bible reader.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(18,25,31,0.94),rgba(13,18,22,0.94))]">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-accent" />
                <p className="text-sm font-semibold text-foreground">Popular topics</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  "Volunteer Care",
                  "Prayer Moments",
                  "Rehearsal Tips",
                  "Scripture",
                  "Set Flow",
                  "YouTube",
                ].map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "rounded-full border border-white/10 px-3 py-1.5 text-sm text-muted-foreground",
                      tag === "Scripture" && "border-primary/20 bg-primary/10 text-primary"
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
