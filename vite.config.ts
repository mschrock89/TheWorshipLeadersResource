import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// In production Vercel rewrites /hs and /ms to the student HTML entries
// (see vercel.json); mirror that in the dev server, which would otherwise
// fall back to index.html (the worship entry) for those paths.
function studentEntryRewrite(): Plugin {
  const rewrite = (url: string | undefined) => {
    const pathname = (url ?? "").split("?")[0];
    if (pathname === "/hs" || pathname.startsWith("/hs/")) return "/students-hs.html";
    if (pathname === "/ms" || pathname.startsWith("/ms/")) return "/students-ms.html";
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return "/admin.html";
    return null;
  };

  return {
    name: "student-entry-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.headers.accept?.includes("text/html")) {
          req.url = rewrite(req.url) ?? req.url;
        }
        next();
      });
    },
  };
}

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
          studentsHs: path.resolve(__dirname, "students-hs.html"),
          studentsMs: path.resolve(__dirname, "students-ms.html"),
          admin: path.resolve(__dirname, "admin.html"),
          charts: path.resolve(__dirname, "charts/index.html"),
        },
      },
    },
    plugins: [react(), studentEntryRewrite(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
