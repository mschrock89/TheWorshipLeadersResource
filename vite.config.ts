import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseTarget = env.VITE_SUPABASE_URL;

  return {
    server: {
      host: "0.0.0.0",
      port: Number(process.env.PORT || 8080),
      proxy: supabaseTarget
        ? {
            "/supabase": {
              target: supabaseTarget,
              changeOrigin: true,
              ws: true,
              rewrite: (pathValue) => pathValue.replace(/^\/supabase/, ""),
            },
          }
        : undefined,
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          charts: path.resolve(__dirname, "charts/index.html"),
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
