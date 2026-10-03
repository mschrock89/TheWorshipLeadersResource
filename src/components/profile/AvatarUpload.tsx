import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { isNativeApp } from "@/lib/native";
import { CameraSource, isPhotoPickerCancel, pickNativePhoto, resizeImageFile } from "@/lib/pickNativePhoto";

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
  const [chooserOpen, setChooserOpen] = useState(false);
  const [useDirectFileInput, setUseDirectFileInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFile = async (file: File) => {
    const prepared = await resizeImageFile(file);

    if (!prepared.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (prepared.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(prepared);

    setIsUploading(true);
    try {
      const fileExt = prepared.type === "image/png" ? "png" : "jpg";
      const fileName = `${userId}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      await supabase.storage.from("avatars").remove([filePath]);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, prepared, { upsert: true, contentType: prepared.type });

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

  const chooseNativeSource = async (source: CameraSource) => {
    setChooserOpen(false);
    if (isUploading) return;

    try {
      const file = await pickNativePhoto({ source });
      if (!file) return;
      await uploadFile(file);
    } catch (error) {
      if (isPhotoPickerCancel(error)) return;
      console.error("Camera error:", error);
      const message = error instanceof Error ? error.message : String(error);
      if (/not implemented|plugin/i.test(message)) {
        setUseDirectFileInput(true);
        toast({
          title: "Choose a photo",
          description: "Tap your profile photo and select an image.",
        });
        return;
      }
      toast({
        title: "Camera unavailable",
        description: "Allow camera and photo access in iOS Settings, then try again.",
        variant: "destructive",
      });
    }
  };

  const handlePickPhoto = () => {
    if (isUploading || disabled || useDirectFileInput) return;

    if (isNativeApp()) {
      setChooserOpen(true);
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
          {!isNativeApp() && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          )}
          {useDirectFileInput && (
            <label className="absolute inset-0 z-10 cursor-pointer">
              <span className="sr-only">Choose profile photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          )}
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
            aria-label="Change profile photo"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </Button>
        </>
      )}

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change profile photo</DialogTitle>
            <DialogDescription>
              Choose a photo from your library or take a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start gap-2"
              onClick={() => void chooseNativeSource(CameraSource.Photos)}
            >
              <ImageIcon className="h-4 w-4" />
              Photo Library
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start gap-2"
              onClick={() => void chooseNativeSource(CameraSource.Camera)}
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
