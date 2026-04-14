import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root")!;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DEV_SW_RESET_KEY = "dev-sw-reset-v1";

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
