import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Plus, AtSign, Smile, Camera, X, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmojiPicker } from "./EmojiPicker";
import { MentionPicker } from "./MentionPicker";
import { ChatGifPicker } from "./GifPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// Detect if we're on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Trigger haptic feedback on iOS
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES = 5;

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: string[]) => void;
  onTyping?: (isTyping: boolean) => void;
  campusName?: string;
  campusId?: string | null;
  ministryType?: string | null;
}

interface PendingFile {
  file: File;
  preview: string;
  error?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function MessageInput({
  onSendMessage,
  onTyping,
  campusName = "the group",
  campusId,
  ministryType
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const isIOSDevice = useMemo(() => isIOS(), []);

  // Handle iOS keyboard focus - scroll input into view
  const handleFocus = useCallback(() => {
    setIsKeyboardOpen(true);
    if (isIOSDevice && inputRef.current) {
      // Small delay to let keyboard animation start
      setTimeout(() => {
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [isIOSDevice]);

  // Handle blur - keyboard closing
  const handleBlur = useCallback(() => {
    setIsKeyboardOpen(false);
  }, []);

  // Typing indicator logic
  const handleTypingStart = useCallback(() => {
    onTyping?.(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping?.(false), 2000);
  }, [onTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      pendingFiles.forEach(pf => URL.revokeObjectURL(pf.preview));
    };
  }, []);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File exceeds ${MAX_FILE_SIZE_MB}MB limit`;
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentCount = pendingFiles.filter(pf => !pf.error).length;
    const availableSlots = MAX_FILES - currentCount;

    if (files.length > availableSlots) {
      toast({
        title: "Too many files",
        description: `You can only attach up to ${MAX_FILES} files at a time`,
        variant: "destructive",
      });
    }

    const filesToAdd = files.slice(0, availableSlots);
    
    const newPendingFiles: PendingFile[] = filesToAdd.map(file => {
      const error = validateFile(file);
      if (error) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the ${MAX_FILE_SIZE_MB}MB limit`,
          variant: "destructive",
        });
      }
      return {
        file,
        preview: URL.createObjectURL(file),
        error: error || undefined
      };
    });

    const validFiles = newPendingFiles.filter(pf => !pf.error);
    setPendingFiles(prev => [...prev, ...validFiles]);
    setShowAttachMenu(false);
    
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (!user || pendingFiles.length === 0) return [];

    const uploadedUrls: string[] = [];
    const totalFiles = pendingFiles.length;

    for (let i = 0; i < pendingFiles.length; i++) {
      const pf = pendingFiles[i];
      setCurrentUploadIndex(i);
      
      const fileExt = pf.file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const baseProgress = (i / totalFiles) * 100;
      setUploadProgress(baseProgress);

      const { error } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, pf.file);

      if (error) {
        console.error("Upload error:", error);
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(fileName);

      uploadedUrls.push(urlData.publicUrl);
      setUploadProgress(((i + 1) / totalFiles) * 100);
    }

    return uploadedUrls;
  };

  const doSend = async () => {
    if (!message.trim() && pendingFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    try {
      let attachmentUrls: string[] = [];
      
      if (pendingFiles.length > 0) {
        attachmentUrls = await uploadFiles();
        pendingFiles.forEach(pf => URL.revokeObjectURL(pf.preview));
        setPendingFiles([]);
      }

      onSendMessage(message, attachmentUrls.length > 0 ? attachmentUrls : undefined);
      
      // Trigger haptic feedback on iOS when message is sent
      if (isIOSDevice) {
        triggerHaptic();
      }
      
      setMessage("");
      setMentionSearch(null);
      setMentionStartIndex(null);
      
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && mentionSearch === null) {
      e.preventDefault();
      doSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessage(value);
    handleTypingStart();

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;

    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionSearch(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
    } else {
      setMentionSearch(null);
      setMentionStartIndex(null);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      setMessage(prev => prev + emoji);
      return;
    }
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newMessage = message.slice(0, start) + emoji + message.slice(end);
    setMessage(newMessage);

    setTimeout(() => {
      input.setSelectionRange(start + emoji.length, start + emoji.length);
      input.focus();
    }, 0);
  };

  const handleMentionSelect = (profile: { id: string; full_name: string | null }) => {
    if (mentionStartIndex === null) return;
    const beforeMention = message.slice(0, mentionStartIndex);
    const afterMention = message.slice(mentionStartIndex + (mentionSearch?.length || 0) + 1);
    const mentionText = `@${profile.full_name} `;
    const newMessage = beforeMention + mentionText + afterMention;
    setMessage(newMessage);
    setMentionSearch(null);
    setMentionStartIndex(null);

    setTimeout(() => {
      inputRef.current?.focus();
      const newCursorPos = beforeMention.length + mentionText.length;
      inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleAtButtonClick = () => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart || message.length;
    const newMessage = message.slice(0, start) + "@" + message.slice(start);
    setMessage(newMessage);
    setMentionSearch("");
    setMentionStartIndex(start);
    setTimeout(() => {
      input.setSelectionRange(start + 1, start + 1);
      input.focus();
    }, 0);
  };

  const isImage = (file: File) => file.type.startsWith('image/');
  const validFilesCount = pendingFiles.filter(pf => !pf.error).length;

  // Prevent iOS overscroll on the input container
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Prevent the default iOS bounce/overscroll behavior
    e.stopPropagation();
  }, []);

  return (
    <div 
      className={`relative px-3 bg-black transition-all duration-200 ${isKeyboardOpen ? 'py-1' : 'pt-0 pb-2'}`}
      style={isKeyboardOpen ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Mention picker */}
      {mentionSearch !== null && (
        <MentionPicker
          searchTerm={mentionSearch}
          onSelect={handleMentionSelect}
          onClose={() => {
            setMentionSearch(null);
            setMentionStartIndex(null);
          }}
          position={{ top: 60, left: 56 }}
          campusId={campusId}
          ministryType={ministryType}
        />
      )}

      {/* Attachment menu overlay */}
      {showAttachMenu && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setShowAttachMenu(false)}
          />
          <div className="absolute bottom-16 left-3 z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-2 shadow-lg">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 w-full px-3 py-2 text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Plus className="h-4 w-4" />
              </div>
              <span>File</span>
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-3 w-full px-3 py-2 text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center">
                <Camera className="h-4 w-4" />
              </div>
              <span>Camera</span>
            </button>
          </div>
        </>
      )}

      {/* Upload progress bar */}
      {isUploading && pendingFiles.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Uploading {currentUploadIndex + 1} of {pendingFiles.length}...</span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>
          <Progress value={uploadProgress} className="h-1.5 bg-zinc-800" />
        </div>
      )}

      {/* Pending files preview */}
      {pendingFiles.length > 0 && !isUploading && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>{validFilesCount} file{validFilesCount !== 1 ? 's' : ''} selected</span>
            <span>Max {MAX_FILE_SIZE_MB}MB each</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pendingFiles.map((pf, index) => (
              <div key={index} className="relative flex-shrink-0 group">
                {isImage(pf.file) ? (
                  <img 
                    src={pf.preview} 
                    alt="Preview" 
                    className="h-16 w-16 object-cover rounded-xl border border-zinc-700"
                  />
                ) : (
                  <div className="h-16 w-16 flex flex-col items-center justify-center bg-zinc-800 rounded-xl border border-zinc-700 p-1">
                    <span className="text-xs text-zinc-400 text-center truncate w-full">
                      {pf.file.name.split('.').pop()?.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-0.5">
                      {formatFileSize(pf.file.size)}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute -top-1 -right-1 bg-zinc-700 hover:bg-zinc-600 rounded-full p-0.5"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Plus button - hidden when typing */}
        {!message.trim() && pendingFiles.length === 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            disabled={isUploading || validFilesCount >= MAX_FILES}
            className="h-10 w-10 text-zinc-400 hover:text-white hover:bg-transparent flex-shrink-0"
          >
            <Plus className="h-6 w-6" />
          </Button>
        )}

        {/* Main input box */}
        <div className="flex-1 min-w-0 flex items-center bg-zinc-800 rounded-lg px-3 py-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={`Message ${campusName}`}
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck="true"
            enterKeyHint="send"
            rows={1}
            className="flex-1 min-w-0 bg-transparent text-white placeholder:text-zinc-500 outline-none text-base resize-none max-h-32 overflow-y-auto scrollbar-none leading-normal"
            disabled={isUploading}
          />
        </div>


        {/* Camera button - hidden when typing or files pending */}
        {!message.trim() && pendingFiles.length === 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => cameraInputRef.current?.click()}
            className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-transparent flex-shrink-0"
          >
            <Camera className="h-5 w-5" />
          </Button>
        )}

        {/* Send button - shown when typing or files pending */}
        {(message.trim() || pendingFiles.length > 0) && (
          <Button
            type="submit"
            size="icon"
            disabled={isUploading}
            className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
      </form>
    </div>
  );
}