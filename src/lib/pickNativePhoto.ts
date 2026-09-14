import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { isNativeApp } from "@/lib/native";

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, data] = dataUrl.split(",");
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
  return /cancel|cancell|dismiss/i.test(message);
}

export async function pickNativePhoto(options?: {
  source?: CameraSource;
  quality?: number;
}): Promise<File | null> {
  if (!isNativeApp()) return null;

  const photo = await Camera.getPhoto({
    quality: options?.quality ?? 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: options?.source ?? CameraSource.Prompt,
    promptLabelHeader: "Choose a photo",
    promptLabelPhoto: "Photo Library",
    promptLabelPicture: "Take Photo",
    promptLabelCancel: "Cancel",
  });

  if (!photo.dataUrl) return null;
  const ext = photo.format || "jpeg";
  return dataUrlToFile(photo.dataUrl, `photo.${ext}`);
}

export { CameraSource };
