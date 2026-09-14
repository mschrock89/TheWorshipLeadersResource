import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { isNativeApp } from "@/lib/native";
import { isPhotoPickerCancel, pickNativePhoto } from "@/lib/pickNativePhoto";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  initials: string;
  onUploadComplete: (url: string) => void;
  disabled?: boolean;
}

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  initials,
  onUploadComplete,
  disabled = false,
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${userId}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      await supabase.storage.from("avatars").remove([filePath]);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      onUploadComplete(avatarUrl);
      toast({
        title: "Photo updated",
        description: "Your profile picture has been updated",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload profile picture",
        variant: "destructive",
      });
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  };

  const handlePickPhoto = async () => {
    if (isUploading) return;

    if (isNativeApp()) {
      try {
        const file = await pickNativePhoto();
        if (!file) return;
        await uploadFile(file);
      } catch (error) {
        if (isPhotoPickerCancel(error)) return;
        console.error("Camera error:", error);
        const message = error instanceof Error ? error.message : String(error);
        if (/not implemented|plugin/i.test(message)) {
          fileInputRef.current?.click();
          return;
        }
        toast({
          title: "Camera unavailable",
          description: "Allow camera and photo access in iOS Settings, or choose a photo from your library.",
          variant: "destructive",
        });
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className="relative inline-block">
      <Avatar className="h-24 w-24 border-4 border-secondary">
        <AvatarImage src={displayUrl || undefined} />
        <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
          {initials}
        </AvatarFallback>
      </Avatar>

      {!disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={cn(
              "absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow-md",
              isUploading && "pointer-events-none"
            )}
            onClick={handlePickPhoto}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
    </div>
  );
}
