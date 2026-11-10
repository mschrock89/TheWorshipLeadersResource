import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Mirror the production entry split in the dev server. Vercel rewrites /hs,
// /ms, and /admin (see vercel.json). Charts is its own deploy at /, so here
// it lives under /charts and would otherwise fall through to the worship app.
function appEntryRewrite(): Plugin {
  const rewritePath = (pathname: string) => {
    if (pathname === "/hs" || pathname.startsWith("/hs/")) return "/students-hs.html";
    if (pathname === "/ms" || pathname.startsWith("/ms/")) return "/students-ms.html";
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return "/admin.html";
    if (
      pathname === "/charts/" ||
      (pathname.startsWith("/charts/") && !pathname.slice("/charts/".length).includes("."))
    ) {
      return "/charts/index.html";
    }
    return null;
  };

  return {
    name: "app-entry-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.headers.accept?.includes("text/html") || !req.url) {
          next();
          return;
        }
        const queryIndex = req.url.indexOf("?");
        const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
        const query = queryIndex === -1 ? "" : req.url.slice(queryIndex);
        if (pathname === "/charts") {
          res.statusCode = 302;
          res.setHeader("Location", `/charts/${query}`);
          res.end();
          return;
        }
        const rewritten = rewritePath(pathname);
        if (rewritten) req.url = `${rewritten}${query}`;
        next();
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const filename = ctx.filename ?? "";
        if (!filename.endsWith(`${path.sep}charts${path.sep}index.html`)) return html;
        // Absolute URLs so a refresh on /charts/setlists/:id still loads this entry.
        // The standalone charts dev server does not use this plugin.
        return html
          .replace('href="manifest.json"', 'href="/charts/manifest.json"')
          .replace('href="icon-192.png"', 'href="/charts/icon-192.png"')
          .replace('href="icon-1024.png"', 'href="/charts/icon-1024.png"')
          .replace('src="./main.tsx"', 'src="/charts/main.tsx"');
      },
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
      // Don't wait for the full dependency crawl before answering. On this
      // project that crawl stalls and the browser sits on the loading spinner.
      warmup: {
        clientFiles: [
          "./src/entries/worship/main.tsx",
          "./src/app/AppShell.tsx",
          "./src/components/layout/MainHeader.tsx",
          "./src/components/layout/ProtectedLayout.tsx",
          "./src/pages/Chat.tsx",
          "./src/pages/Feed.tsx",
        ],
      },
      watch: {
        // iCloud conflict copies ("Foo 2.tsx") and native/function trees were
        // triggering full page reloads and wedging the dev server.
        ignored: [
          "**/* 2.*",
          "**/* 2/**",
          "**/ios/**",
          "**/android/**",
          "**/supabase/**",
          "**/dist/**",
        ],
      },
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
    optimizeDeps: {
      holdUntilCrawlEnd: false,
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
    plugins: [react(), appEntryRewrite(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
