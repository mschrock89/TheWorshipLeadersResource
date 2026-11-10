import { Capacitor } from "@capacitor/core";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function initNativeApp() {
  if (!isNativeApp()) return;

  // LaunchIntro hides the splash as soon as it paints. This is only a backstop
  // so a failed first paint cannot leave the splash covering the app.
  window.setTimeout(() => {
    void import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }))
      .catch((error) => {
        console.error("Splash screen hide failed:", error);
      });
  }, 5000);

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Light status bar text over the app's dark chrome.
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (error) {
    console.error("Native app initialization failed:", error);
  }
}
