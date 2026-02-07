import { useState, useRef } from "react";
import { Heart, Smile, Pencil, Trash2, X, Check, Paperclip } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage } from "@/hooks/useChatMessages";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEditMessage?: (messageId: string, content: string) => Promise<boolean>;
  onDeleteMessage?: (messageId: string) => Promise<boolean>;
  currentUserId?: string;
  showHeader: boolean;
}

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🙏", "🔥", "👏", "💯"];

export function MessageBubble({
  message,
  isOwnMessage,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  currentUserId,
  showHeader,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Group reactions by emoji type
  const reactionGroups = (message.message_reactions ?? []).reduce((acc, r) => {
    if (!acc[r.reaction]) {
      acc[r.reaction] = { count: 0, hasReacted: false };
    }
    acc[r.reaction].count++;
    if (r.user_id === currentUserId) {
      acc[r.reaction].hasReacted = true;
    }
    return acc;
  }, {} as Record<string, { count: number; hasReacted: boolean }>);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "h:mm a");
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isGifUrl = (content: string) => {
    return content.match(/https?:\/\/.*\.(gif|webp)/i) || 
           content.includes('tenor.com') || 
           content.includes('giphy.com') ||
           content.includes('media.tenor');
  };

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
    setShowMobileMenu(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      handleCancelEdit();
      return;
    }
    const success = await onEditMessage?.(message.id, editContent);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDeleteMessage?.(message.id);
    setIsDeleting(false);
    setShowDeleteDialog(false);
  };

  const handleTouchStart = () => {
    if (!isOwnMessage) return;
    longPressTimer.current = setTimeout(() => {
      setShowMobileMenu(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const isImageUrl = (url: string) => {
    return url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i);
  };

  const renderAttachments = (attachments: string[] | null) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="flex flex-col gap-2 mt-2">
        {attachments.map((url, index) => (
          isImageUrl(url) ? (
            <a key={index} href={url} target="_blank" rel="noopener noreferrer">
              <img 
                src={url} 
                alt="Attachment" 
                className="max-w-[280px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                loading="lazy"
              />
            </a>
          ) : (
            <a 
              key={index} 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors max-w-[280px]"
            >
              <Paperclip className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {url.split('/').pop()?.split('?')[0] || 'File'}
              </span>
            </a>
          )
        ))}
      </div>
    );
  };

  const renderContent = (content: string) => {
    if (isGifUrl(content)) {
      return (
        <img 
          src={content} 
          alt="GIF" 
          className="max-w-[280px] rounded-xl"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }

    const parts = content.split(/(@\w+(?:\s+\w+)?)/g);
    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        return (
          <span key={index} className="text-blue-400 font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const hasReactions = Object.keys(reactionGroups).length > 0;

  const messageContent = (
    <div
      className={cn(
        "group px-4",
        showHeader ? "pt-4" : "pt-1"
      )}
      onDoubleClick={() => onToggleReaction(message.id, "❤️")}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Header row with avatar, name, and timestamp */}
      {showHeader && (
        <div className="flex items-center gap-3 mb-1">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={message.profiles?.avatar_url || undefined} />
            <AvatarFallback className="bg-zinc-700 text-zinc-300 text-sm font-medium">
              {getInitials(message.profiles?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-[15px] text-white">
              {message.profiles?.full_name || "Anonymous"}
            </span>
            <span className="text-xs text-zinc-500">
              {formatTime(message.created_at)}
            </span>
          </div>
        </div>
      )}

      {/* Message content row with emoji/reactions on left margin */}
      <div className="flex items-center gap-2">
        {/* Left margin: emoji picker OR reaction pills - fixed width for alignment */}
        <div className="flex-shrink-0 w-12 flex flex-col gap-1 items-center">
          {Object.keys(reactionGroups).length > 0 ? (
            /* Show existing reactions as pills */
            <div className="flex flex-col gap-1">
              {Object.entries(reactionGroups).map(([emoji, data]) => (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(message.id, emoji)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-sm transition-all duration-150 active:scale-125 hover:scale-110",
                    data.hasReacted
                      ? "bg-blue-500/20 border border-blue-500/40"
                      : "bg-zinc-800 hover:bg-zinc-700 border border-transparent"
                  )}
                >
                  <span className="transition-transform duration-150">{emoji}</span>
                  <span className="text-white font-medium text-xs">{data.count}</span>
                </button>
              ))}
            </div>
          ) : (
            /* Show emoji picker when no reactions */
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center justify-center h-7 w-7 rounded-full bg-zinc-800/60 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100">
                  <Smile className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent 
                side="top" 
                className="w-auto p-2 bg-zinc-900 border-zinc-700"
              >
                <div className="flex gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onToggleReaction(message.id, emoji)}
                      className="text-xl hover:scale-125 transition-transform p-1"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Message content column */}
        <div className="flex-1 min-w-0">
          {/* Message content or edit input */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                className="flex-1 bg-zinc-800 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600 focus:border-zinc-500"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveEdit}>
                <Check className="h-4 w-4 text-green-500" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEdit}>
                <X className="h-4 w-4 text-zinc-400" />
              </Button>
            </div>
          ) : (
            <div>
              {message.content && !isGifUrl(message.content) && (
                <div className="inline-block bg-zinc-800/80 rounded-2xl px-4 py-2.5">
                  <p className="text-[15px] text-zinc-100 leading-relaxed break-words">
                    {renderContent(message.content)}
                  </p>
                </div>
              )}
              {message.content && isGifUrl(message.content) && (
                <div>{renderContent(message.content)}</div>
              )}
              {renderAttachments(message.attachments)}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Mobile menu overlay
  if (showMobileMenu && isOwnMessage) {
    return (
      <>
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowMobileMenu(false)}
        />
        <div className="relative z-50">
          {messageContent}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1 bg-zinc-800 rounded-xl p-1 shadow-lg border border-zinc-700">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleStartEdit}>
              <Pencil className="h-4 w-4 text-zinc-300" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setShowMobileMenu(false); setShowDeleteDialog(true); }}>
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </div>
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-zinc-900 border-zinc-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete message?</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Desktop: wrap with context menu for own messages
  if (isOwnMessage) {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {messageContent}
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-zinc-800 border-zinc-700">
            <ContextMenuItem onClick={handleStartEdit} className="text-zinc-200 focus:bg-zinc-700 focus:text-white">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-400 focus:bg-zinc-700 focus:text-red-300">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-zinc-900 border-zinc-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete message?</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return messageContent;
}