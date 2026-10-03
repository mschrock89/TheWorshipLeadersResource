import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { isNativeApp } from "@/lib/native";

const MAX_PHOTO_EDGE = 1280;

function dataUrlToFile(dataUrl: string, filename: string): File {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.slice(comma + 1)) {
    throw new Error("Photo data was empty");
  }

  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

export function isPhotoPickerCancel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|cancell|dismiss|no image|user denied/i.test(message);
}

export async function resizeImageFile(file: File, maxEdge = MAX_PHOTO_EDGE): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest || longest <= maxEdge) return file;

    const scale = maxEdge / longest;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch (error) {
    console.error("Image resize failed:", error);
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function pickNativePhoto(options?: {
  source?: CameraSource;
  quality?: number;
}): Promise<File | null> {
  if (!isNativeApp()) return null;

  // Never use CameraSource.Prompt. On iPad that action sheet is an unanchored
  // popover and iPadOS terminates the app. Fullscreen camera / photo library
  // pickers do not need a popover anchor. Width and height keep the returned
  // image small enough that the web view does not run out of memory.
  const photo = await Camera.getPhoto({
    quality: options?.quality ?? 72,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: options?.source ?? CameraSource.Photos,
    saveToGallery: false,
    correctOrientation: true,
    presentationStyle: "fullscreen",
    width: MAX_PHOTO_EDGE,
    height: MAX_PHOTO_EDGE,
    preserveAspectRatio: true,
  });

  if (!photo.dataUrl) return null;
  const ext = photo.format === "png" ? "png" : "jpeg";
  return dataUrlToFile(photo.dataUrl, `photo.${ext}`);
}

export { CameraSource };
