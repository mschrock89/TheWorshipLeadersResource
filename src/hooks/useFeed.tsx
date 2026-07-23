import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

export type FeedCategory = "blog" | "scripture" | "video" | "poll";

export interface FeedPollOptionRecord {
  id: string;
  post_id: string;
  label: string;
  sort_order: number;
  vote_count: number;
  voted_by_me: boolean;
}

export interface FeedLikerRecord {
  user_id: string;
  full_name: string | null;
}

export interface FeedPostRecord {
  id: string;
  category: FeedCategory;
  title: string;
  body: string | null;
  scripture_reference: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  resource_app_key: string;
  campus_id: string | null;
  camp_instance_id: string | null;
  ministry_type: string | null;
  author_name: string | null;
  like_count: number;
  liked_by_me: boolean;
  likers: FeedLikerRecord[];
  comment_count: number;
  comments: FeedCommentRecord[];
  poll_options: FeedPollOptionRecord[];
  poll_vote_count: number;
  my_poll_option_id: string | null;
}

export interface FeedCommentRecord {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
}

interface FeedPostRow {
  id: string;
  category: FeedCategory;
  title: string;
  body: string | null;
  scripture_reference: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  campus_id: string | null;
  camp_instance_id: string | null;
  ministry_type: string | null;
  author: { full_name: string | null } | null;
}

interface FeedLikeRow {
  id: string;
  post_id: string;
  user_id: string;
  author: { full_name: string | null } | null;
}

interface FeedCommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: { full_name: string | null } | null;
}

interface FeedPollOptionRow {
  id: string;
  post_id: string;
  label: string;
  sort_order: number;
}

interface FeedPollVoteRow {
  id: string;
  post_id: string;
  option_id: string;
  user_id: string;
}

export interface FeedPostInput {
  category: FeedCategory;
  title: string;
  body?: string | null;
  scripture_reference?: string | null;
  youtube_url?: string | null;
  youtube_video_id?: string | null;
  poll_options?: string[];
}

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 10;

function normalizePollOptions(options: string[] | undefined) {
  return (options || [])
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, MAX_POLL_OPTIONS);
}

async function insertPollOptions(postId: string, options: string[]) {
  const rows = options.map((label, index) => ({
    post_id: postId,
    label,
    sort_order: index,
  }));

  const { error } = await supabase.from("feed_poll_options").insert(rows);
  if (error) throw error;
}

async function fetchFeedPosts(
  userId: string | undefined,
  campusId?: string | null,
  campInstanceId?: string | null,
  ministryType?: string | null,
  limit = 40,
) {
  const resourceAppKey = getCurrentResourceAppKey();

  let postQuery = supabase
    .from("feed_posts")
    .select(`
      id,
      category,
      title,
      body,
      scripture_reference,
      youtube_url,
      youtube_video_id,
      created_by,
      updated_by,
      created_at,
      updated_at,
      resource_app_key,
      campus_id,
      camp_instance_id,
      ministry_type,
      author:profiles!feed_posts_created_by_fkey (
        full_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (campInstanceId) {
    postQuery = postQuery.eq("camp_instance_id", campInstanceId);
  } else {
    postQuery = postQuery
      .eq("resource_app_key", resourceAppKey)
      .eq("campus_id", campusId!)
      .eq("ministry_type", ministryType!)
      .is("camp_instance_id", null);
  }

  const { data: postRows, error: postError } = await postQuery;

  if (postError) throw postError;

  const posts = (postRows || []) as FeedPostRow[];
  const postIds = posts.map((post) => post.id);

  if (postIds.length === 0) {
    return [] as FeedPostRecord[];
  }

  const [
    { data: likeRows, error: likeError },
    { data: commentRows, error: commentError },
    { data: pollOptionRows, error: pollOptionError },
    { data: pollVoteRows, error: pollVoteError },
  ] = await Promise.all([
    supabase
      .from("feed_post_likes")
      .select(`
        id,
        post_id,
        user_id,
        author:profiles!feed_post_likes_user_id_fkey (
          full_name
        )
      `)
      .in("post_id", postIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("feed_post_comments")
      .select(`
        id,
        post_id,
        user_id,
        body,
        created_at,
        updated_at,
        author:profiles!feed_post_comments_user_id_fkey (
          full_name
        )
      `)
      .in("post_id", postIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("feed_poll_options")
      .select("id, post_id, label, sort_order")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("feed_poll_votes")
      .select("id, post_id, option_id, user_id")
      .in("post_id", postIds),
  ]);

  if (likeError) throw likeError;
  if (commentError) throw commentError;
  if (pollOptionError) throw pollOptionError;
  if (pollVoteError) throw pollVoteError;

  const likesByPostId = new Map<string, number>();
  const likedPostIds = new Set<string>();
  const likersByPostId = new Map<string, FeedLikerRecord[]>();
  const commentsByPostId = new Map<string, FeedCommentRecord[]>();
  const votesByOptionId = new Map<string, number>();
  const myVoteByPostId = new Map<string, string>();
  const voteCountByPostId = new Map<string, number>();

  ((likeRows || []) as FeedLikeRow[]).forEach((like) => {
    likesByPostId.set(like.post_id, (likesByPostId.get(like.post_id) || 0) + 1);
    const existingLikers = likersByPostId.get(like.post_id) || [];
    existingLikers.push({
      user_id: like.user_id,
      full_name: like.author?.full_name ?? null,
    });
    likersByPostId.set(like.post_id, existingLikers);
    if (userId && like.user_id === userId) {
      likedPostIds.add(like.post_id);
    }
  });

  ((commentRows || []) as FeedCommentRow[]).forEach((comment) => {
    const existing = commentsByPostId.get(comment.post_id) || [];
    existing.push({
      id: comment.id,
      post_id: comment.post_id,
      user_id: comment.user_id,
      body: comment.body,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      author_name: comment.author?.full_name ?? null,
    });
    commentsByPostId.set(comment.post_id, existing);
  });

  ((pollVoteRows || []) as FeedPollVoteRow[]).forEach((vote) => {
    votesByOptionId.set(vote.option_id, (votesByOptionId.get(vote.option_id) || 0) + 1);
    voteCountByPostId.set(vote.post_id, (voteCountByPostId.get(vote.post_id) || 0) + 1);
    if (userId && vote.user_id === userId) {
      myVoteByPostId.set(vote.post_id, vote.option_id);
    }
  });

  const optionsByPostId = new Map<string, FeedPollOptionRecord[]>();
  ((pollOptionRows || []) as FeedPollOptionRow[]).forEach((option) => {
    const existing = optionsByPostId.get(option.post_id) || [];
    existing.push({
      id: option.id,
      post_id: option.post_id,
      label: option.label,
      sort_order: option.sort_order,
      vote_count: votesByOptionId.get(option.id) || 0,
      voted_by_me: myVoteByPostId.get(option.post_id) === option.id,
    });
    optionsByPostId.set(option.post_id, existing);
  });

  return posts.map((post) => ({
    ...post,
    author_name: post.author?.full_name ?? null,
    like_count: likesByPostId.get(post.id) || 0,
    liked_by_me: likedPostIds.has(post.id),
    likers: likersByPostId.get(post.id) || [],
    comment_count: (commentsByPostId.get(post.id) || []).length,
    comments: commentsByPostId.get(post.id) || [],
    poll_options: optionsByPostId.get(post.id) || [],
    poll_vote_count: voteCountByPostId.get(post.id) || 0,
    my_poll_option_id: myVoteByPostId.get(post.id) || null,
  })) as FeedPostRecord[];
}

export function useFeedPosts(
  campusId?: string | null,
  campInstanceId?: string | null,
  ministryType?: string | null,
) {
  const { user, isLoading } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();
  const enabled =
    !!user && !isLoading && (!!campInstanceId || (!!campusId && !!ministryType));

  return useQuery({
    queryKey: [
      "feed-posts",
      user?.id,
      resourceAppKey,
      campusId ?? null,
      campInstanceId ?? "app",
      ministryType ?? null,
    ],
    queryFn: () => fetchFeedPosts(user?.id, campusId, campInstanceId, ministryType),
    enabled,
  });
}

export function useCreateFeedPost(
  campusId?: string | null,
  campInstanceId?: string | null,
  ministryType?: string | null,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (input: FeedPostInput) => {
      if (!user?.id) throw new Error("You must be signed in to create a post.");
      if (!campInstanceId && !campusId) {
        throw new Error("Select a campus before publishing to The Feed.");
      }
      if (!campInstanceId && !ministryType) {
        throw new Error("Select a ministry before publishing to The Feed.");
      }

      const pollOptions = normalizePollOptions(input.poll_options);
      if (input.category === "poll") {
        if (pollOptions.length < MIN_POLL_OPTIONS) {
          throw new Error(`Polls need at least ${MIN_POLL_OPTIONS} answer options.`);
        }
        if (pollOptions.length > MAX_POLL_OPTIONS) {
          throw new Error(`Polls can have at most ${MAX_POLL_OPTIONS} answer options.`);
        }
      }

      const { data, error } = await supabase
        .from("feed_posts")
        .insert({
          category: input.category,
          title: input.title,
          body: input.body || null,
          scripture_reference: input.scripture_reference || null,
          youtube_url: input.youtube_url || null,
          youtube_video_id: input.youtube_video_id || null,
          created_by: user.id,
          updated_by: user.id,
          resource_app_key: resourceAppKey,
          campus_id: campInstanceId ? null : campusId,
          camp_instance_id: campInstanceId || null,
          ministry_type: campInstanceId ? null : ministryType,
        })
        .select("id")
        .single();

      if (error) throw error;

      if (data?.id && input.category === "poll") {
        try {
          await insertPollOptions(data.id, pollOptions);
        } catch (pollError) {
          await supabase.from("feed_posts").delete().eq("id", data.id);
          throw pollError;
        }
      }

      if (data?.id) {
        try {
          await supabase.functions.invoke("notify-feed-post", {
            body: {
              postId: data.id,
              resourceAppKey,
              campusId: campInstanceId ? null : campusId,
              campInstanceId: campInstanceId || null,
              ministryType: campInstanceId ? null : ministryType,
            },
          });
        } catch (notificationError) {
          console.error("Failed to send feed notification:", notificationError);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "Post published" });
    },
    onError: (error) => {
      toast({
        title: "Could not publish post",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateFeedPost(
  campusId?: string | null,
  campInstanceId?: string | null,
  ministryType?: string | null,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async ({ id, ...input }: FeedPostInput & { id: string }) => {
      if (!user?.id) throw new Error("You must be signed in to update a post.");
      if (input.category === "poll") {
        throw new Error("Poll options can't be edited after publishing. Delete and create a new poll instead.");
      }

      let query = supabase
        .from("feed_posts")
        .update({
          category: input.category,
          title: input.title,
          body: input.body || null,
          scripture_reference: input.scripture_reference || null,
          youtube_url: input.youtube_url || null,
          youtube_video_id: input.youtube_video_id || null,
          updated_by: user.id,
        })
        .eq("id", id);

      if (campInstanceId) {
        query = query.eq("camp_instance_id", campInstanceId);
      } else {
        query = query
          .eq("resource_app_key", resourceAppKey)
          .eq("campus_id", campusId!)
          .eq("ministry_type", ministryType!)
          .is("camp_instance_id", null);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "Post updated" });
    },
    onError: (error) => {
      toast({
        title: "Could not update post",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteFeedPost(
  campusId?: string | null,
  campInstanceId?: string | null,
  ministryType?: string | null,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (postId: string) => {
      let query = supabase
        .from("feed_posts")
        .delete()
        .eq("id", postId);

      if (campInstanceId) {
        query = query.eq("camp_instance_id", campInstanceId);
      } else {
        query = query
          .eq("resource_app_key", resourceAppKey)
          .eq("campus_id", campusId!)
          .eq("ministry_type", ministryType!)
          .is("camp_instance_id", null);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "Post deleted" });
    },
    onError: (error) => {
      toast({
        title: "Could not delete post",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useShareFeedPostToCampuses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async ({
      post,
      targetCampusIds,
    }: {
      post: FeedPostRecord;
      targetCampusIds: string[];
    }) => {
      if (!user?.id) throw new Error("You must be signed in to share a post.");
      const uniqueCampusIds = Array.from(new Set(targetCampusIds.filter(Boolean)));
      if (uniqueCampusIds.length === 0) {
        throw new Error("No campus Feed is available to share to.");
      }

      const rows = uniqueCampusIds.map((campusId) => ({
        category: post.category,
        title: post.title,
        body: post.body || null,
        scripture_reference: post.scripture_reference || null,
        youtube_url: post.youtube_url || null,
        youtube_video_id: post.youtube_video_id || null,
        created_by: user.id,
        updated_by: user.id,
        resource_app_key: resourceAppKey,
        campus_id: campusId,
        camp_instance_id: null,
        ministry_type: post.ministry_type,
      }));

      const { data, error } = await supabase
        .from("feed_posts")
        .insert(rows)
        .select("id, campus_id");

      if (error) throw error;

      if (post.category === "poll" && post.poll_options.length > 0) {
        for (const created of data || []) {
          await insertPollOptions(
            created.id,
            post.poll_options.map((option) => option.label),
          );
        }
      }

      for (const created of data || []) {
        try {
          await supabase.functions.invoke("notify-feed-post", {
            body: {
              postId: created.id,
              resourceAppKey,
              campusId: created.campus_id,
              campInstanceId: null,
              ministryType: post.ministry_type,
            },
          });
        } catch (notificationError) {
          console.error("Failed to send shared feed notification:", notificationError);
        }
      }

      return data || [];
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({
        title: created.length > 1 ? "Shared to your Feeds" : "Shared to My Feed",
        description:
          created.length > 1
            ? `Copied this post to ${created.length} campus Feeds.`
            : "This post is now on your campus Feed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not share post",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useVoteFeedPoll() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      postId,
      optionId,
    }: {
      postId: string;
      optionId: string;
    }) => {
      if (!user?.id) throw new Error("You must be signed in to vote.");

      const { data: existing, error: existingError } = await supabase
        .from("feed_poll_votes")
        .select("id, option_id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        if (existing.option_id === optionId) return existing;

        const { error } = await supabase
          .from("feed_poll_votes")
          .update({ option_id: optionId })
          .eq("id", existing.id)
          .eq("user_id", user.id);

        if (error) throw error;
        return existing;
      }

      const { error } = await supabase
        .from("feed_poll_votes")
        .insert({
          post_id: postId,
          option_id: optionId,
          user_id: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not submit vote",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useToggleFeedLike() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (!user?.id) throw new Error("You must be signed in to like a post.");

      if (liked) {
        const { error } = await supabase
          .from("feed_post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);

        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("feed_post_likes")
        .insert({
          post_id: postId,
          user_id: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not update like",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCreateFeedComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      if (!user?.id) throw new Error("You must be signed in to comment.");

      const trimmedBody = body.trim();
      if (!trimmedBody) throw new Error("Write a comment before posting.");
      if (trimmedBody.length > 100) throw new Error("Comments must be 100 characters or less.");

      const { error } = await supabase
        .from("feed_post_comments")
        .insert({
          post_id: postId,
          user_id: user.id,
          body: trimmedBody,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not post comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export { MIN_POLL_OPTIONS, MAX_POLL_OPTIONS };
