import { Capacitor } from "@capacitor/core";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function initNativeApp() {
  if (!isNativeApp()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Light status bar text over the app's dark chrome.
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (error) {
    console.error("Native app initialization failed:", error);
  }
}
