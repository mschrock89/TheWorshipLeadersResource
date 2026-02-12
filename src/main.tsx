import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root")!;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  root.innerHTML = `
    <div style="font-family: system-ui; padding: 2rem; max-width: 480px; margin: 0 auto;">
      <h1 style="color: #333;">Configuration missing</h1>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your Vercel project settings (Settings → Environment Variables), then redeploy.</p>
    </div>
  `;
} else {
  createRoot(root).render(<App />);
}
