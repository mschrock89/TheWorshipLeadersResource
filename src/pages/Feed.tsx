import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  ChevronDown,
  Clock3,
  Edit3,
  Filter,
  Heart,
  Loader2,
  MapPin,
  MessageSquare,
  PenSquare,
  PlayCircle,
  Share2,
  Trash2,
  Youtube,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUserAdminCampuses } from "@/hooks/useUserRoles";
import {
  type FeedCategory,
  type FeedCommentRecord,
  type FeedPostInput,
  type FeedPostRecord,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  useCreateFeedComment,
  useCreateFeedPost,
  useDeleteFeedPost,
  useFeedPosts,
  useShareFeedPostToCampuses,
  useToggleFeedLike,
  useUpdateFeedPost,
  useVoteFeedPoll,
} from "@/hooks/useFeed";
import { cn } from "@/lib/utils";

type FeedTab = "all" | FeedCategory;
type ComposerMode = "post" | "poll";

const categoryLabels: Record<FeedTab, string> = {
  all: "All Posts",
  blog: "Blog Style",
  scripture: "Scripture",
  video: "Videos",
  poll: "Polls",
};

type ComposerState = {
  title: string;
  body: string;
  scriptureReference: string;
  youtubeLink: string;
  pollQuestion: string;
  pollOptionCount: number;
  pollOptions: string[];
};

type FeedProps = {
  campInstanceId?: string | null;
  heading?: string;
  composerDescription?: string;
  emptyAdminMessage?: string;
  emptyReaderMessage?: string;
};

const emptyComposerState: ComposerState = {
  title: "",
  body: "",
  scriptureReference: "",
  youtubeLink: "",
  pollQuestion: "",
  pollOptionCount: 2,
  pollOptions: ["", ""],
};

function categoryIcon(category: FeedCategory) {
  switch (category) {
    case "scripture":
      return BookOpenText;
    case "video":
      return Youtube;
    case "poll":
      return BarChart3;
    default:
      return PenSquare;
  }
}

function buildPollOptions(count: number, current: string[] = []) {
  const nextCount = Math.min(MAX_POLL_OPTIONS, Math.max(MIN_POLL_OPTIONS, count));
  return Array.from({ length: nextCount }, (_, index) => current[index] || "");
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

function buildComposerPayload(state: ComposerState, mode: ComposerMode): FeedPostInput | null {
  if (mode === "poll") {
    const question = state.pollQuestion.trim();
    const options = state.pollOptions.map((option) => option.trim()).filter(Boolean);

    if (!question && options.length === 0) return null;
    if (!question) throw new Error("Add a poll question before publishing.");
    if (options.length < MIN_POLL_OPTIONS) {
      throw new Error(`Add at least ${MIN_POLL_OPTIONS} answer options.`);
    }
    if (options.length > MAX_POLL_OPTIONS) {
      throw new Error(`Polls can have at most ${MAX_POLL_OPTIONS} answer options.`);
    }
    if (options.some((option) => option.length > 160)) {
      throw new Error("Each answer option must be 160 characters or less.");
    }

    return {
      category: "poll",
      title: question,
      body: null,
      scripture_reference: null,
      youtube_url: null,
      youtube_video_id: null,
      poll_options: options,
    };
  }

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
  canShareToMyFeed,
  onLikeToggle,
  onCommentSubmit,
  onEdit,
  onDelete,
  onShareToMyFeed,
  onVotePoll,
  isTogglingLike,
  isSubmittingComment,
  isDeleting,
  isSharing,
  isVoting,
}: {
  post: FeedPostRecord;
  isAdmin: boolean;
  currentUserId?: string;
  canShareToMyFeed: boolean;
  onLikeToggle: (post: FeedPostRecord) => void;
  onCommentSubmit: (postId: string, body: string) => Promise<void>;
  onEdit: (post: FeedPostRecord) => void;
  onDelete: (post: FeedPostRecord) => void;
  onShareToMyFeed: (post: FeedPostRecord) => void;
  onVotePoll: (postId: string, optionId: string) => void;
  isTogglingLike: boolean;
  isSubmittingComment: boolean;
  isDeleting: boolean;
  isSharing: boolean;
  isVoting: boolean;
}) {
  const CategoryIcon = categoryIcon(post.category);
  const [isConversationOpen, setIsConversationOpen] = useState(post.comment_count > 0);
  const [commentBody, setCommentBody] = useState("");
  const hasVoted = !!post.my_poll_option_id;
  const totalPollVotes = post.poll_vote_count;

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

          {post.category === "poll" && post.poll_options.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {hasVoted ? "Results" : "Cast your vote"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalPollVotes} vote{totalPollVotes === 1 ? "" : "s"}
                </p>
              </div>
              <div className="space-y-2">
                {post.poll_options.map((option) => {
                  const percent = totalPollVotes > 0
                    ? Math.round((option.vote_count / totalPollVotes) * 100)
                    : 0;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isVoting}
                      onClick={() => onVotePoll(post.id, option.id)}
                      className={cn(
                        "relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors",
                        option.voted_by_me
                          ? "border-primary/40 bg-primary/10"
                          : "border-white/10 bg-white/5 hover:bg-white/8"
                      )}
                    >
                      {hasVoted ? (
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/15"
                          style={{ width: `${percent}%` }}
                        />
                      ) : null}
                      <div className="relative flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                        {hasVoted ? (
                          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                            {percent}% · {option.vote_count}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasVoted ? "Tap another option to change your vote." : "Tap an option to vote."}
              </p>
            </div>
          ) : null}

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

          <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-white/6 pt-5 text-sm text-muted-foreground sm:gap-x-3">
            <div className="inline-flex items-center">
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-2.5 py-2 transition-colors hover:bg-white/5 hover:text-foreground sm:px-3",
                  isAdmin && "rounded-r-none",
                  post.liked_by_me && "bg-primary/10 text-primary"
                )}
                onClick={() => onLikeToggle(post)}
                disabled={isTogglingLike}
              >
                {isTogglingLike ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                {post.like_count}
              </button>
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center rounded-full rounded-l-none px-1.5 py-2 transition-colors hover:bg-white/5 hover:text-foreground",
                        post.liked_by_me && "bg-primary/10 text-primary"
                      )}
                      aria-label="View who liked this post"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-64 border-white/10 bg-zinc-950 text-foreground"
                  >
                    <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Liked by {post.like_count}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    {post.likers.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">No likes yet</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto py-1">
                        {post.likers.map((liker) => {
                          const name = liker.full_name?.trim() || "Unknown user";
                          const initials = name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase();

                          return (
                            <div
                              key={liker.user_id}
                              className="flex items-center gap-2.5 px-2 py-1.5"
                            >
                              <Avatar className="h-7 w-7 border border-white/10">
                                <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate text-sm text-foreground">{name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full px-2.5 py-2 transition-colors hover:bg-white/5 hover:text-foreground sm:px-3"
              onClick={() => setIsConversationOpen((current) => !current)}
            >
              <MessageSquare className="h-4 w-4" />
              Conversation
              <span>{post.comment_count}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isConversationOpen && "rotate-180")} />
            </button>
            {isAdmin ? (
              <div className="ml-auto flex items-center gap-x-1 sm:gap-x-3">
                {post.category !== "poll" ? (
                  <button
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-2 transition-colors hover:bg-white/5 hover:text-foreground sm:px-3"
                    onClick={() => onEdit(post)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </button>
                ) : null}
                <button
                  className="inline-flex items-center gap-2 rounded-full px-2.5 py-2 text-destructive transition-colors hover:bg-destructive/10 sm:px-3"
                  onClick={() => onDelete(post)}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </button>
              </div>
            ) : null}
          </div>

          {canShareToMyFeed ? (
            <Button
              variant="outline"
              className="w-full rounded-xl border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              onClick={() => onShareToMyFeed(post)}
              disabled={isSharing}
            >
              {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Share to My Feed
            </Button>
          ) : null}

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

export default function Feed({
  campInstanceId = null,
  heading = "THE FEED",
  composerDescription = "Share a thought, scripture, or YouTube link with this campus.",
  emptyAdminMessage = "Publish the first post to get this campus Feed started.",
  emptyReaderMessage = "This campus Feed is ready. Once an admin publishes a post, it will show up here.",
}: FeedProps = {}) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLeader } = useAuth();
  // Feed posting is gated by the post_feed capability (seeded to match the old
  // isAdmin set), so it can now be granted to individuals via a user override.
  const { can } = useCapabilities();
  const isAdmin = can("post_feed");
  const { toast } = useToast();
  const campusCtx = useCampusSelectionOptional();
  const [localCampusId, setLocalCampusId] = useState<string | null>(null);
  const selectedCampusId = campusCtx?.selectedCampusId ?? localCampusId;
  const setSelectedCampusId = campusCtx?.setSelectedCampusId ?? setLocalCampusId;
  const { data: campuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: adminCampusIds = [] } = useUserAdminCampuses(user?.id);
  const selectableCampuses = useMemo(() => {
    if (isLeader) return campuses;
    const assignedIds = new Set(userCampuses.map((uc) => uc.campus_id));
    return campuses.filter((campus) => assignedIds.has(campus.id));
  }, [campuses, isLeader, userCampuses]);
  const selectedCampusName =
    selectableCampuses.find((campus) => campus.id === selectedCampusId)?.name
    ?? campuses.find((campus) => campus.id === selectedCampusId)?.name
    ?? null;
  const feedCampusId = campInstanceId ? null : selectedCampusId;
  const shareTargetCampusIds = useMemo(() => {
    if (campInstanceId || !feedCampusId) return [];
    return adminCampusIds.filter((campusId) => campusId !== feedCampusId);
  }, [adminCampusIds, campInstanceId, feedCampusId]);
  const canShareToMyFeed = shareTargetCampusIds.length > 0;
  const isFeedScopeReady = !!campInstanceId || !!feedCampusId;
  const resolvedComposerDescription = campInstanceId
    ? composerDescription
    : selectedCampusName
      ? `Share a thought, scripture, or YouTube link with ${selectedCampusName}.`
      : composerDescription;
  const resolvedEmptyAdminMessage = campInstanceId
    ? emptyAdminMessage
    : selectedCampusName
      ? `Publish the first post to get the ${selectedCampusName} Feed started.`
      : emptyAdminMessage;
  const resolvedEmptyReaderMessage = campInstanceId
    ? emptyReaderMessage
    : selectedCampusName
      ? `The ${selectedCampusName} Feed is ready. Once an admin publishes a post, it will show up here.`
      : emptyReaderMessage;
  const { data: posts = [], isLoading } = useFeedPosts(feedCampusId, campInstanceId);
  const showFeedLoading = !isFeedScopeReady || isLoading;
  const createPost = useCreateFeedPost(feedCampusId, campInstanceId);
  const updatePost = useUpdateFeedPost(feedCampusId, campInstanceId);
  const deletePost = useDeleteFeedPost(feedCampusId, campInstanceId);
  const sharePostToMyFeed = useShareFeedPostToCampuses();
  const votePoll = useVoteFeedPoll();
  const toggleLike = useToggleFeedLike();
  const createComment = useCreateFeedComment();
  const [activeTab, setActiveTab] = useState<FeedTab>("all");
  const [composerMode, setComposerMode] = useState<ComposerMode>("post");
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [sharingPostId, setSharingPostId] = useState<string | null>(null);
  const [votingPostId, setVotingPostId] = useState<string | null>(null);

  // Keep a local fallback if Feed is ever rendered outside ProtectedLayout.
  useEffect(() => {
    if (campusCtx || campInstanceId || localCampusId || selectableCampuses.length === 0) return;
    setLocalCampusId(selectableCampuses[0].id);
  }, [campusCtx, campInstanceId, selectableCampuses, localCampusId]);

  useEffect(() => {
    if (campInstanceId || selectableCampuses.length === 0) return;
    if (selectedCampusId && selectableCampuses.some((campus) => campus.id === selectedCampusId)) {
      return;
    }
    setSelectedCampusId(selectableCampuses[0].id);
  }, [campInstanceId, selectableCampuses, selectedCampusId, setSelectedCampusId]);

  useEffect(() => {
    const composeType = searchParams.get("compose");
    const sharedReference = searchParams.get("reference");
    const sharedBody = searchParams.get("body");

    if (campInstanceId || composeType !== "scripture") return;

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
  }, [campInstanceId, isAdmin, searchParams, setSearchParams, toast]);

  const visiblePosts = useMemo(() => {
    if (activeTab === "all") return posts;
    return posts.filter((post) => post.category === activeTab);
  }, [activeTab, posts]);

  const isSaving = createPost.isPending || updatePost.isPending;

  const resetComposer = () => {
    setComposer(emptyComposerState);
    setComposerMode("post");
    setEditingPostId(null);
  };

  const handlePublish = async () => {
    if (!isAdmin) return;
    if (!campInstanceId && !feedCampusId) {
      toast({
        title: "Select a campus",
        description: "Choose a campus before publishing to The Feed.",
        variant: "destructive",
      });
      return;
    }

    let payload: FeedPostInput | null = null;
    try {
      payload = buildComposerPayload(composer, composerMode);
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
        description:
          composerMode === "poll"
            ? "Add a question and at least two answer options first."
            : "Add a title, reflection, scripture, or YouTube link first.",
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
    setActiveTab(payload.category === "poll" ? "poll" : "all");
  };

  const handleEdit = (post: FeedPostRecord) => {
    if (post.category === "poll") {
      toast({
        title: "Polls can't be edited",
        description: "Delete this poll and create a new one if you need different options.",
        variant: "destructive",
      });
      return;
    }

    setComposerMode("post");
    setEditingPostId(post.id);
    setComposer({
      ...emptyComposerState,
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

  const handleShareToMyFeed = async (post: FeedPostRecord) => {
    if (shareTargetCampusIds.length === 0) return;
    setSharingPostId(post.id);
    try {
      await sharePostToMyFeed.mutateAsync({
        post,
        targetCampusIds: shareTargetCampusIds,
      });
    } finally {
      setSharingPostId(null);
    }
  };

  const handleVotePoll = async (postId: string, optionId: string) => {
    setVotingPostId(postId);
    try {
      await votePoll.mutateAsync({ postId, optionId });
    } finally {
      setVotingPostId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-8 overflow-x-hidden">
      <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(53,176,229,0.22),transparent_32%),linear-gradient(135deg,rgba(20,29,35,0.98),rgba(10,15,19,0.98))] px-6 py-7 shadow-[0_28px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(255,184,56,0.10),transparent_60%)] lg:block" />
        <div className="relative grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center xl:grid-cols-[minmax(0,1.25fr)_390px]">
          <div>
            <div className="space-y-4">
              <h1 className="mx-auto max-w-2xl bg-[linear-gradient(92deg,#ffffff_0%,#f7fbff_42%,#35b0e5_100%)] bg-clip-text text-center font-display text-5xl font-black uppercase leading-none tracking-[0.12em] text-transparent drop-shadow-[0_0_28px_rgba(53,176,229,0.20)] sm:text-6xl lg:text-7xl">
                {heading}
              </h1>
              {!campInstanceId && selectableCampuses.length > 1 ? (
                <div className="mx-auto flex w-full max-w-sm items-center justify-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <Select
                    value={selectedCampusId || undefined}
                    onValueChange={setSelectedCampusId}
                  >
                    <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-black/25 text-left text-sm text-foreground backdrop-blur">
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableCampuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>
                          {campus.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </div>

          <Card className="border-white/10 bg-black/20 backdrop-blur">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">What belongs in The Feed?</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Pastoral encouragement, set-planning insights, scriptures, polls, rehearsal wins, and trusted
                  video resources.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                <div className="min-w-0 rounded-2xl border border-white/8 bg-white/5 px-2 py-4">
                  <p className="text-2xl font-semibold text-foreground">{posts.length}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Posts</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/8 bg-white/5 px-2 py-4">
                  <p className="text-2xl font-semibold text-foreground">
                    {posts.reduce((count, post) => count + post.like_count, 0)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Likes</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/8 bg-white/5 px-2 py-4">
                  <p className="text-2xl font-semibold text-foreground">
                    {posts.reduce((count, post) => count + (post.comment_count ?? 0), 0)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Comments</p>
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
                      {editingPostId ? "Edit post" : composerMode === "poll" ? "Create a poll" : "Start a post"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {composerMode === "poll"
                        ? "Ask a question, choose how many answers, then fill in each option."
                        : resolvedComposerDescription}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="max-w-full border border-primary/20 bg-primary/10 text-primary"
                  >
                    {editingPostId ? "Editing" : "Admin Composer"}
                  </Badge>
                </div>

                {!editingPostId ? (
                  <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                        composerMode === "post"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setComposerMode("post")}
                    >
                      Post
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                        composerMode === "poll"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setComposerMode("poll")}
                    >
                      Poll
                    </button>
                  </div>
                ) : null}

                {composerMode === "poll" ? (
                  <div className="grid min-w-0 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Ask a question</label>
                      <Input
                        placeholder="What should we decide?"
                        maxLength={160}
                        className="rounded-xl border-white/10 bg-black/20"
                        value={composer.pollQuestion}
                        onChange={(event) =>
                          setComposer((current) => ({
                            ...current,
                            pollQuestion: event.target.value.slice(0, 160),
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">How many answer options?</label>
                      <Select
                        value={String(composer.pollOptionCount)}
                        onValueChange={(value) => {
                          const nextCount = Number(value);
                          setComposer((current) => ({
                            ...current,
                            pollOptionCount: nextCount,
                            pollOptions: buildPollOptions(nextCount, current.pollOptions),
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full rounded-xl border-white/10 bg-black/20 sm:max-w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: MAX_POLL_OPTIONS - MIN_POLL_OPTIONS + 1 },
                            (_, index) => MIN_POLL_OPTIONS + index,
                          ).map((count) => (
                            <SelectItem key={count} value={String(count)}>
                              {count} options
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">Answer text</label>
                      {composer.pollOptions.map((option, index) => (
                        <Input
                          key={`poll-option-${index}`}
                          placeholder={`Option ${index + 1}`}
                          maxLength={160}
                          className="rounded-xl border-white/10 bg-black/20"
                          value={option}
                          onChange={(event) =>
                            setComposer((current) => {
                              const nextOptions = [...current.pollOptions];
                              nextOptions[index] = event.target.value.slice(0, 160);
                              return { ...current, pollOptions: nextOptions };
                            })
                          }
                        />
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        className="rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-95"
                        onClick={handlePublish}
                        disabled={isSaving}
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish Poll"}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl border-white/10 bg-white/5"
                        onClick={resetComposer}
                        disabled={isSaving}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                ) : (
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
                )}
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
            {showFeedLoading ? (
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
                      ? resolvedEmptyAdminMessage
                      : resolvedEmptyReaderMessage}
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
                  canShareToMyFeed={canShareToMyFeed}
                  onLikeToggle={handleToggleLike}
                  onCommentSubmit={handleCommentSubmit}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onShareToMyFeed={handleShareToMyFeed}
                  onVotePoll={handleVotePoll}
                  isTogglingLike={toggleLike.isPending}
                  isSubmittingComment={createComment.isPending}
                  isDeleting={deletePost.isPending}
                  isSharing={sharingPostId === post.id}
                  isVoting={votingPostId === post.id}
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
                <p>Everyone signed into the app can read posts for the selected campus and like what resonates.</p>
                <p>Admins can publish, edit, and remove posts on each campus Feed to keep it helpful and clean.</p>
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
                  "Polls",
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
