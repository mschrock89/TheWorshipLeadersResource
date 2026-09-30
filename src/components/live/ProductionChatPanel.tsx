import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { cn } from "@/lib/cn";

type ProductionChatPanelProps = {
  campusId: string;
  active: boolean;
};

export function ProductionChatPanel({ campusId, active }: ProductionChatPanelProps) {
  const { messages, isLoading, isError, sendMessage, currentUserId } = useChatMessages(
    campusId,
    "production",
  );
  const { markAsRead } = useUnreadMessages();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    void markAsRead(campusId, "production");
  }, [active, campusId, markAsRead, messages.length]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading production chat…</p> : null}
        {isError ? (
          <p className="text-sm text-muted-foreground">
            Production chat is available to the production team at this campus.
          </p>
        ) : null}
        {!isLoading && !isError && messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No production messages yet.</p>
        ) : null}
        {messages.slice(-40).map((message) => {
          const own = message.user_id === currentUserId;
          return (
            <div key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2",
                  own ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {!own ? (
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {message.profiles.full_name || "Production"}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-base leading-snug">{message.content}</p>
                <p className={cn("mt-1 text-[10px]", own ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {format(new Date(message.created_at), "h:mm a")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const content = draft.trim();
          if (!content) return;
          void sendMessage(content);
          setDraft("");
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          placeholder="Message production"
          aria-label="Production chat message"
          className="min-h-[3rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" className="h-11 w-11" aria-label="Send" disabled={!draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
