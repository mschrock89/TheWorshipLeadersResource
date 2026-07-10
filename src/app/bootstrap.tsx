import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import "@/index.css";
import { getResourceAppForLocation } from "@/lib/constants";

const DEV_SW_RESET_KEY = "dev-sw-reset-v1";
const APP_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

let lastAppUpdateCheck = 0;

function upsertHeadLink(rel: string, href: string, type?: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;
  if (type) {
    link.type = type;
  }
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }

  meta.content = content;
}

function setResourceAppMetadata() {
  const app = getResourceAppForLocation();
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const appUrl = `${window.location.origin}${currentPath}`;
  const isStudentsApp = app.key === "students_hs" || app.key === "students_ms";
  const browserIconPath = isStudentsApp ? `${app.iconPath}?v=20260601-es` : app.iconPath;
  const shareImagePath = app.key === "students_hs" || app.key === "students_ms"
    ? "/experience-students-share.png"
    : app.iconPath;

  document.title = app.name;

  upsertHeadLink("icon", browserIconPath, "image/png");
  upsertHeadLink("shortcut icon", browserIconPath, "image/png");
  upsertHeadLink("apple-touch-icon", app.iconPath);
  upsertHeadLink("manifest", app.manifestPath);

  upsertMeta("name", "description", app.description);
  upsertMeta("name", "apple-mobile-web-app-title", app.shortName);
  upsertMeta("property", "og:title", app.name);
  upsertMeta("property", "og:description", app.description);
  upsertMeta("property", "og:url", appUrl);
  upsertMeta("property", "og:image", `${window.location.origin}${shareImagePath}`);
  upsertMeta("name", "twitter:title", app.name);
  upsertMeta("name", "twitter:description", app.description);
  upsertMeta("name", "twitter:image", `${window.location.origin}${shareImagePath}`);

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute("content", app.themeColor);
}

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
    // Each resource app has its own HTML entry (and therefore its own entry
    // chunk), so the version probe must hit this app's path prefix — fetching
    // "/" from a student app would return the worship entry's HTML and the
    // script paths would never match.
    const appPathPrefix = getResourceAppForLocation().pathPrefix;
    const response = await fetch(`${appPathPrefix}?app-version=${now}`, { cache: "no-store" });
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

export async function bootstrapApp(app: ReactElement) {
  const root = document.getElementById("root")!;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  setResourceAppMetadata();
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

  createRoot(root).render(app);
}
