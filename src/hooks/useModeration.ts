import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type ModeratedContentType = "chat_message" | "feed_post" | "feed_comment" | "user";

export interface ModerationTarget {
  userId: string;
  contentType: ModeratedContentType;
  contentId?: string;
  contentSnapshot: Record<string, unknown>;
}

export function useBlockedUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["blocked-users", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_blocks")
        .select("blocked_user_id")
        .eq("blocker_id", user!.id);
      if (error) throw error;
      return new Set<string>((data || []).map((row: { blocked_user_id: string }) => row.blocked_user_id));
    },
    staleTime: 30_000,
  });
}

export function useReportContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: ModerationTarget & { reason: string }) => {
      if (!user?.id) throw new Error("Sign in to report content.");
      const { error } = await (supabase as any).from("moderation_reports").insert({
        reporter_id: user.id,
        reported_user_id: input.userId,
        content_type: input.contentType,
        content_id: input.contentId || null,
        reason: input.reason.trim(),
        content_snapshot: input.contentSnapshot,
      });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: "Report sent", description: "Our team will review this content." }),
    onError: (error: Error) => toast({ title: "Could not send report", description: error.message, variant: "destructive" }),
  });
}

export function useBlockUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: ModerationTarget & { reason: string }) => {
      if (!user?.id) throw new Error("Sign in to block a user.");
      const { error } = await (supabase as any).rpc("block_user_and_report", {
        _blocked_user_id: input.userId,
        _content_type: input.contentType,
        _content_id: input.contentId || null,
        _reason: input.reason.trim(),
        _content_snapshot: input.contentSnapshot,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      const { userId } = input;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["feed-posts"] }),
        queryClient.cancelQueries({ queryKey: ["chat-messages"] }),
      ]);

      const feedSnapshot = queryClient.getQueriesData({ queryKey: ["feed-posts"] });
      const chatSnapshot = queryClient.getQueriesData({ queryKey: ["chat-messages"] });

      queryClient.setQueriesData({ queryKey: ["feed-posts"] }, (old: any) =>
        Array.isArray(old)
          ? old
              .filter((post) => post.created_by !== userId)
              .map((post) => {
                const comments = (post.comments || []).filter((comment: { user_id: string }) => comment.user_id !== userId);
                return { ...post, comments, comment_count: comments.length };
              })
          : old,
      );
      queryClient.setQueriesData({ queryKey: ["chat-messages"] }, (old: any) =>
        old?.pages
          ? { ...old, pages: old.pages.map((page: any[]) => page.filter((message) => message.user_id !== userId)) }
          : old,
      );
      queryClient.setQueryData(["blocked-users", user?.id], (old: Set<string> | undefined) => new Set([...(old || []), userId]));
      return { feedSnapshot, chatSnapshot };
    },
    onError: (error: Error, _input, context) => {
      context?.feedSnapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.chatSnapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      queryClient.invalidateQueries({ queryKey: ["blocked-users", user?.id] });
      toast({ title: "Could not block user", description: error.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "User blocked", description: "Their content is removed from your feed. A report was sent to our team." }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["blocked-users", user?.id] });
    },
  });
}
