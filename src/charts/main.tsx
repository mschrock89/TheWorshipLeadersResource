import { createRoot } from "react-dom/client";
import { ChartsApp } from "./ChartsApp";
import "../index.css";

const root = document.getElementById("root")!;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const chartsBaseUrl = import.meta.env.BASE_URL;

if (!supabaseUrl || !supabaseKey) {
  root.innerHTML = `
    <div style="font-family: system-ui; padding: 2rem; max-width: 480px; margin: 0 auto;">
      <h1 style="color: #fff;">Configuration missing</h1>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> before using Charts.</p>
    </div>
  `;
} else {
  if ("serviceWorker" in navigator) {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register(`${chartsBaseUrl}sw.js`).catch((error) => {
        console.error("Charts service worker registration failed:", error);
      });
    } else {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations
          .filter((registration) => registration.scope.includes(chartsBaseUrl))
          .forEach((registration) => registration.unregister());
      });
    }
  }

  createRoot(root).render(<ChartsApp />);
}
