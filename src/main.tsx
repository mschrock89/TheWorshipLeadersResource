import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root")!;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DEV_SW_RESET_KEY = "dev-sw-reset-v1";
const APP_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

let lastAppUpdateCheck = 0;

function getCurrentAppScriptPath() {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  if (!script?.src) {
    return null;
  }

  return new URL(script.src).pathname;
}

function getLatestAppScriptPath(html: string) {
  const moduleScriptMatch =
    html.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<script[^>]*src=["']([^"']+)["'][^>]*type=["']module["'][^>]*>/i);

  if (!moduleScriptMatch?.[1]) {
    return null;
  }

  return new URL(moduleScriptMatch[1], window.location.origin).pathname;
}

async function reloadIfNewAppVersionAvailable(force = false) {
  if (!import.meta.env.PROD) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastAppUpdateCheck < APP_UPDATE_CHECK_INTERVAL_MS) {
    return;
  }

  lastAppUpdateCheck = now;
  const currentAppScriptPath = getCurrentAppScriptPath();

  if (!currentAppScriptPath) {
    return;
  }

  try {
    const response = await fetch(`/?app-version=${now}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const latestAppScriptPath = getLatestAppScriptPath(await response.text());
    if (latestAppScriptPath && latestAppScriptPath !== currentAppScriptPath) {
      window.location.reload();
    }
  } catch (error) {
    console.error("App update check failed:", error);
  }
}

function startProductionAppUpdateChecks() {
  if (!import.meta.env.PROD) {
    return;
  }

  window.addEventListener("focus", () => {
    void reloadIfNewAppVersionAvailable();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void reloadIfNewAppVersionAvailable();
    }
  });

  window.setInterval(() => {
    void reloadIfNewAppVersionAvailable();
  }, APP_UPDATE_CHECK_INTERVAL_MS);

  void reloadIfNewAppVersionAvailable(true);
}

async function resetDevelopmentBrowserState() {
  if (import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const hadRegistrations = registrations.length > 0;

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }

  if (hadRegistrations && sessionStorage.getItem(DEV_SW_RESET_KEY) !== "done") {
    sessionStorage.setItem(DEV_SW_RESET_KEY, "done");
    window.location.reload();
    await new Promise(() => {});
  }

  sessionStorage.removeItem(DEV_SW_RESET_KEY);
}

async function bootstrap() {
  await resetDevelopmentBrowserState();
  startProductionAppUpdateChecks();

  if (!supabaseUrl || !supabaseKey) {
    root.innerHTML = `
      <div style="font-family: system-ui; padding: 2rem; max-width: 480px; margin: 0 auto;">
        <h1 style="color: #333;">Configuration missing</h1>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your Vercel project settings (Settings → Environment Variables), then redeploy.</p>
      </div>
    `;
    return;
  }

  createRoot(root).render(<App />);
}

void bootstrap();
