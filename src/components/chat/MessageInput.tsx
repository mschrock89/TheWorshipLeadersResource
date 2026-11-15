import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Plus, Camera, X, Loader2, Send, AtSign, Smile, Mic } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MentionPicker } from "./MentionPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { isNativeApp } from "@/lib/native";
import { CameraSource, isPhotoPickerCancel, pickNativePhoto } from "@/lib/pickNativePhoto";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES = 5;
const COMPOSER_EMOJIS = [
  "😊", "😂", "❤️", "👍", "🙏", "🔥", "🎉", "😍",
  "😭", "👏", "💯", "✨", "🙌", "😎", "🤔", "😢",
  "😮", "💪", "🎵", "🎶", "✝️", "😅", "🤍", "👋",
];

const composerIconClass =
  "flex h-10 w-9 shrink-0 items-center justify-center text-white active:opacity-60 disabled:opacity-30";

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: string[]) => void;
  onTyping?: (isTyping: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  /** True only while the on-screen keyboard is covering the page, not merely when the field is focused. */
  keyboardOpen?: boolean;
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
  onFocusChange,
  keyboardOpen = false,
  campusName = "the group",
  campusId,
  ministryType
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  // Refs so a native `beforeinput` listener (attached once) always sees the
  // latest send handler / mention state, and so we can dedupe against keydown.
  const doSendRef = useRef<() => void>(() => {});
  const mentionActiveRef = useRef(false);
  const keydownHandledRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordActionRef = useRef<"send" | "cancel">("cancel");
  mentionActiveRef.current = mentionSearch !== null;

  const handleFocus = useCallback(() => {
    onFocusChange?.(true);
    // Stop iOS from scrolling the focused field into a mid-screen dead zone
    // before our chat shell has pinned to the visual viewport.
    window.scrollTo(0, 0);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    onFocusChange?.(false);
  }, [onFocusChange]);

  const handleTypingStart = useCallback(() => {
    onTyping?.(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping?.(false), 2000);
  }, [onTyping]);

  const pendingFilesRef = useRef<PendingFile[]>([]);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      pendingFilesRef.current.forEach(pf => URL.revokeObjectURL(pf.preview));
    };
  }, []);

  // Anchor the mention picker just above the composer form.
  useLayoutEffect(() => {
    if (mentionSearch === null) {
      setMentionPosition(null);
      return;
    }
    const form = formRef.current;
    if (!form) return;
    setMentionPosition({
      top: form.offsetHeight + 8,
      left: 12,
    });
  }, [mentionSearch, pendingFiles.length, isUploading, message]);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File exceeds ${MAX_FILE_SIZE_MB}MB limit`;
    }
    return null;
  };

  const addFiles = (files: File[]) => {
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
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleCameraCapture = async () => {
    if (isNativeApp()) {
      try {
        const file = await pickNativePhoto({ source: CameraSource.Camera });
        if (file) addFiles([file]);
      } catch (error) {
        if (isPhotoPickerCancel(error)) return;
        console.error("Camera error:", error);
        toast({
          title: "Camera unavailable",
          description: "Allow camera access in iOS Settings, or attach a photo from your library.",
          variant: "destructive",
        });
      }
      return;
    }

    cameraInputRef.current?.click();
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
      
      haptic("light");
      
      setMessage("");
      setMentionSearch(null);
      setMentionStartIndex(null);
      
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

      // Keep keyboard open after send (GroupMe / iMessage behavior)
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
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

  doSendRef.current = doSend;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && mentionSearch === null) {
      e.preventDefault();
      // Mark so the beforeinput listener below doesn't also fire (hardware
      // keyboards deliver both); cleared on the next tick.
      keydownHandledRef.current = true;
      setTimeout(() => {
        keydownHandledRef.current = false;
      }, 0);
      doSend();
    }
  };

  // iOS software keyboards fire `beforeinput` (often without a matching
  // `keydown`) for the return key, so the blue "Send" key never reached
  // handleKeyDown — the user had to tap the on-screen button. Treat a line-break
  // insert as send so the keyboard key sends directly. Shift+Enter on a hardware
  // keyboard still inserts a newline (handleKeyDown cancels the break first).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onBeforeInput = (e: Event) => {
      if (
        (e as InputEvent).inputType === "insertLineBreak" &&
        !mentionActiveRef.current &&
        !keydownHandledRef.current
      ) {
        e.preventDefault();
        doSendRef.current();
      }
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

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

  const isImage = (file: File) => file.type.startsWith('image/');
  const validFilesCount = pendingFiles.filter(pf => !pf.error).length;
  const placeholder = `Message ${campusName}`;
  const hasDraft = message.trim().length > 0 || pendingFiles.length > 0;

  const stopRecordStream = () => {
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
    if (recordTimerRef.current != null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const sendVoiceFile = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(fileName, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(fileName);
      onSendMessage("", [urlData.publicUrl]);
      haptic("light");
    } catch (error) {
      console.error("Voice message failed:", error);
      toast({
        title: "Couldn't send voice message",
        description: "Try again, or attach the recording as a file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    if (isRecording || isUploading || typeof MediaRecorder === "undefined") {
      if (typeof MediaRecorder === "undefined") {
        toast({
          title: "Voice messages aren't available",
          description: "This device can't record audio in the app.",
          variant: "destructive",
        });
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const action = recordActionRef.current;
        const type = recorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(recordChunksRef.current, { type });
        stopRecordStream();
        recorderRef.current = null;
        setIsRecording(false);
        setRecordSeconds(0);
        if (action !== "send" || blob.size < 800) return;
        const ext = type.includes("webm") ? "webm" : "m4a";
        void sendVoiceFile(new File([blob], `voice-${Date.now()}.${ext}`, { type }));
      };
      recordActionRef.current = "cancel";
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      setShowEmoji(false);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((seconds) => seconds + 1);
      }, 1000);
    } catch (error) {
      console.error("Microphone error:", error);
      stopRecordStream();
      toast({
        title: "Microphone unavailable",
        description: "Allow microphone access in Settings to send a voice message.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = (action: "send" | "cancel") => {
    recordActionRef.current = action;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      stopRecordStream();
      setIsRecording(false);
      setRecordSeconds(0);
      return;
    }
    recorder.stop();
  };

  useEffect(() => {
    return () => {
      recordActionRef.current = "cancel";
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      stopRecordStream();
    };
  }, []);

  const insertAtCursor = (text: string, mention = false) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? start;
    const next = message.slice(0, start) + text + message.slice(end);
    setMessage(next);
    handleTypingStart();
    if (mention) {
      setMentionSearch("");
      setMentionStartIndex(start);
    }
    const cursor = start + text.length;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(cursor, cursor);
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
    });
  };

  const formatRecordTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div 
      className="relative px-3 bg-black"
      style={{
        paddingTop: 8,
        paddingBottom: keyboardOpen
          ? 8
          : "max(8px, env(safe-area-inset-bottom, 0px))",
      }}
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
          position={mentionPosition}
          campusId={campusId}
          ministryType={ministryType}
        />
      )}

      {showEmoji && !isRecording && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
          <div className="absolute bottom-full left-0 right-0 z-50 mb-2 grid grid-cols-8 gap-1 rounded-2xl border border-white/15 bg-zinc-900 p-2 shadow-lg">
            {COMPOSER_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Insert ${emoji}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  insertAtCursor(emoji);
                  setShowEmoji(false);
                }}
                className="flex h-9 items-center justify-center text-[22px] active:opacity-60"
              >
                {emoji}
              </button>
            ))}
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
                    className="h-16 w-16 object-cover rounded-none border border-zinc-700"
                  />
                ) : (
                  <div className="h-16 w-16 flex flex-col items-center justify-center bg-zinc-800 rounded-none border border-zinc-700 p-1">
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
                  className="absolute -top-1 -right-1 bg-zinc-700 hover:bg-zinc-600 rounded-none p-0.5"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit}>
        <div className="flex min-h-[46px] items-center rounded-[24px] border border-white/35 bg-black pl-0.5 pr-1">
          <button
            type="button"
            aria-label="Add a file"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isRecording || validFilesCount >= MAX_FILES}
            className={composerIconClass}
          >
            <Plus className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </button>

          {isRecording ? (
            <div className="flex min-h-[44px] flex-1 items-center gap-2 px-1 text-white">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span className="text-[15px] tabular-nums">{formatRecordTime(recordSeconds)}</span>
              <span className="text-[15px] text-zinc-400">Recording</span>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={placeholder}
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck="true"
              enterKeyHint="enter"
              rows={1}
              className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 text-white outline-none placeholder:text-[#c7c7cc] scrollbar-none"
              disabled={isUploading}
            />
          )}

          {isRecording ? (
            <>
              <button
                type="button"
                aria-label="Cancel recording"
                onClick={() => stopRecording("cancel")}
                className={composerIconClass}
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label="Send voice message"
                onClick={() => stopRecording("send")}
                disabled={isUploading}
                className={composerIconClass}
              >
                <Send className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </>
          ) : hasDraft ? (
            <button
              type="submit"
              aria-label="Send"
              disabled={isUploading}
              // Keep focus on the textarea so tapping Send never blurs the field.
              onMouseDown={(e) => e.preventDefault()}
              className={composerIconClass}
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" strokeWidth={1.75} />
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="Mention someone"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowEmoji(false);
                  insertAtCursor("@", true);
                }}
                className={composerIconClass}
              >
                <AtSign className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label="Add an emoji"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowEmoji((open) => !open)}
                className={composerIconClass}
              >
                <Smile className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label="Record a voice message"
                onMouseDown={(e) => e.preventDefault()}
                onClick={startRecording}
                disabled={isUploading}
                className={composerIconClass}
              >
                <Mic className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label="Take a photo"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCameraCapture}
                disabled={isUploading || validFilesCount >= MAX_FILES}
                className={composerIconClass}
              >
                <Camera className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>

        {/* Hidden file inputs — tabIndex -1 avoids iOS Prev/Next accessory bar */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          onChange={handleFileSelect}
          className="hidden"
          tabIndex={-1}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          tabIndex={-1}
        />
      </form>
    </div>
  );
}
