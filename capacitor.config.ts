import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.worshipleadersresource.app",
  appName: "Resource",
  webDir: "dist",
  ios: {
    backgroundColor: "#1c1f21",
    contentInset: "never",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      // Stay up until LaunchIntro paints the same mark, then the motion plays.
      launchAutoHide: false,
      backgroundColor: "#1c1f21",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Camera: {
      presentationStyle: "fullscreen",
    },
  },
};

export default config;
