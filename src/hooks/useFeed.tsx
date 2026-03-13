import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export type FeedCategory = "blog" | "scripture" | "video";

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
  author_name: string | null;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
  comments: FeedCommentRecord[];
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
  author: { full_name: string | null } | null;
}

interface FeedLikeRow {
  id: string;
  post_id: string;
  user_id: string;
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

export interface FeedPostInput {
  category: FeedCategory;
  title: string;
  body?: string | null;
  scripture_reference?: string | null;
  youtube_url?: string | null;
  youtube_video_id?: string | null;
}

async function fetchFeedPosts(userId: string | undefined) {
  const { data: postRows, error: postError } = await supabase
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
      author:profiles!feed_posts_created_by_fkey (
        full_name
      )
    `)
    .order("created_at", { ascending: false });

  if (postError) throw postError;

  const { data: likeRows, error: likeError } = await supabase
    .from("feed_post_likes")
    .select("id, post_id, user_id");

  if (likeError) throw likeError;

  const { data: commentRows, error: commentError } = await supabase
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
    .order("created_at", { ascending: true });

  if (commentError) throw commentError;

  const likesByPostId = new Map<string, number>();
  const likedPostIds = new Set<string>();
  const commentsByPostId = new Map<string, FeedCommentRecord[]>();

  ((likeRows || []) as FeedLikeRow[]).forEach((like) => {
    likesByPostId.set(like.post_id, (likesByPostId.get(like.post_id) || 0) + 1);
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

  return ((postRows || []) as FeedPostRow[]).map((post) => ({
    ...post,
    author_name: post.author?.full_name ?? null,
    like_count: likesByPostId.get(post.id) || 0,
    liked_by_me: likedPostIds.has(post.id),
    comment_count: (commentsByPostId.get(post.id) || []).length,
    comments: commentsByPostId.get(post.id) || [],
  })) as FeedPostRecord[];
}

export function useFeedPosts() {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["feed-posts", user?.id],
    queryFn: () => fetchFeedPosts(user?.id),
    enabled: !!user && !isLoading,
  });
}

export function useCreateFeedPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: FeedPostInput) => {
      if (!user?.id) throw new Error("You must be signed in to create a post.");

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
        })
        .select("id")
        .single();

      if (error) throw error;
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

export function useUpdateFeedPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...input }: FeedPostInput & { id: string }) => {
      if (!user?.id) throw new Error("You must be signed in to update a post.");

      const { error } = await supabase
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

export function useDeleteFeedPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("feed_posts")
        .delete()
        .eq("id", postId);

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
