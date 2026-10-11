// vite.config.ts
import { defineConfig, loadEnv } from "file:///Users/mitchellschrock/Desktop/worshipleadersresource-main-copy/node_modules/vite/dist/node/index.js";
import react from "file:///Users/mitchellschrock/Desktop/worshipleadersresource-main-copy/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///Users/mitchellschrock/Desktop/worshipleadersresource-main-copy/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/Users/mitchellschrock/Desktop/worshipleadersresource-main-copy";
function studentEntryRewrite() {
  const rewrite = (url) => {
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
    }
  };
}
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseTarget = env.VITE_SUPABASE_URL;
  return {
    server: {
      host: "0.0.0.0",
      port: Number(process.env.PORT || 8080),
      proxy: supabaseTarget ? {
        "/supabase": {
          target: supabaseTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (pathValue) => pathValue.replace(/^\/supabase/, "")
        }
      } : void 0
    },
    build: {
      chunkSizeWarningLimit: 1e3,
      rollupOptions: {
        input: {
          main: path.resolve(__vite_injected_original_dirname, "index.html"),
          studentsHs: path.resolve(__vite_injected_original_dirname, "students-hs.html"),
          studentsMs: path.resolve(__vite_injected_original_dirname, "students-ms.html"),
          admin: path.resolve(__vite_injected_original_dirname, "admin.html"),
          charts: path.resolve(__vite_injected_original_dirname, "charts/index.html")
        }
      }
    },
    plugins: [react(), studentEntryRewrite(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbWl0Y2hlbGxzY2hyb2NrL0Rlc2t0b3Avd29yc2hpcGxlYWRlcnNyZXNvdXJjZS1tYWluLWNvcHlcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9taXRjaGVsbHNjaHJvY2svRGVza3RvcC93b3JzaGlwbGVhZGVyc3Jlc291cmNlLW1haW4tY29weS92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvbWl0Y2hlbGxzY2hyb2NrL0Rlc2t0b3Avd29yc2hpcGxlYWRlcnNyZXNvdXJjZS1tYWluLWNvcHkvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYsIHR5cGUgUGx1Z2luIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XG5cbi8vIEluIHByb2R1Y3Rpb24gVmVyY2VsIHJld3JpdGVzIC9ocyBhbmQgL21zIHRvIHRoZSBzdHVkZW50IEhUTUwgZW50cmllc1xuLy8gKHNlZSB2ZXJjZWwuanNvbik7IG1pcnJvciB0aGF0IGluIHRoZSBkZXYgc2VydmVyLCB3aGljaCB3b3VsZCBvdGhlcndpc2Vcbi8vIGZhbGwgYmFjayB0byBpbmRleC5odG1sICh0aGUgd29yc2hpcCBlbnRyeSkgZm9yIHRob3NlIHBhdGhzLlxuZnVuY3Rpb24gc3R1ZGVudEVudHJ5UmV3cml0ZSgpOiBQbHVnaW4ge1xuICBjb25zdCByZXdyaXRlID0gKHVybDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG4gICAgY29uc3QgcGF0aG5hbWUgPSAodXJsID8/IFwiXCIpLnNwbGl0KFwiP1wiKVswXTtcbiAgICBpZiAocGF0aG5hbWUgPT09IFwiL2hzXCIgfHwgcGF0aG5hbWUuc3RhcnRzV2l0aChcIi9ocy9cIikpIHJldHVybiBcIi9zdHVkZW50cy1ocy5odG1sXCI7XG4gICAgaWYgKHBhdGhuYW1lID09PSBcIi9tc1wiIHx8IHBhdGhuYW1lLnN0YXJ0c1dpdGgoXCIvbXMvXCIpKSByZXR1cm4gXCIvc3R1ZGVudHMtbXMuaHRtbFwiO1xuICAgIGlmIChwYXRobmFtZSA9PT0gXCIvYWRtaW5cIiB8fCBwYXRobmFtZS5zdGFydHNXaXRoKFwiL2FkbWluL1wiKSkgcmV0dXJuIFwiL2FkbWluLmh0bWxcIjtcbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6IFwic3R1ZGVudC1lbnRyeS1yZXdyaXRlXCIsXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZSgocmVxLCBfcmVzLCBuZXh0KSA9PiB7XG4gICAgICAgIGlmIChyZXEuaGVhZGVycy5hY2NlcHQ/LmluY2x1ZGVzKFwidGV4dC9odG1sXCIpKSB7XG4gICAgICAgICAgcmVxLnVybCA9IHJld3JpdGUocmVxLnVybCkgPz8gcmVxLnVybDtcbiAgICAgICAgfVxuICAgICAgICBuZXh0KCk7XG4gICAgICB9KTtcbiAgICB9LFxuICB9O1xufVxuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xuICBjb25zdCBzdXBhYmFzZVRhcmdldCA9IGVudi5WSVRFX1NVUEFCQVNFX1VSTDtcblxuICByZXR1cm4ge1xuICAgIHNlcnZlcjoge1xuICAgICAgaG9zdDogXCIwLjAuMC4wXCIsXG4gICAgICBwb3J0OiBOdW1iZXIocHJvY2Vzcy5lbnYuUE9SVCB8fCA4MDgwKSxcbiAgICAgIHByb3h5OiBzdXBhYmFzZVRhcmdldFxuICAgICAgICA/IHtcbiAgICAgICAgICAgIFwiL3N1cGFiYXNlXCI6IHtcbiAgICAgICAgICAgICAgdGFyZ2V0OiBzdXBhYmFzZVRhcmdldCxcbiAgICAgICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICAgICAgICB3czogdHJ1ZSxcbiAgICAgICAgICAgICAgcmV3cml0ZTogKHBhdGhWYWx1ZSkgPT4gcGF0aFZhbHVlLnJlcGxhY2UoL15cXC9zdXBhYmFzZS8sIFwiXCIpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgIH0sXG4gICAgYnVpbGQ6IHtcbiAgICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMTAwMCxcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgICAgaW5wdXQ6IHtcbiAgICAgICAgICBtYWluOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcImluZGV4Lmh0bWxcIiksXG4gICAgICAgICAgc3R1ZGVudHNIczogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJzdHVkZW50cy1ocy5odG1sXCIpLFxuICAgICAgICAgIHN0dWRlbnRzTXM6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3R1ZGVudHMtbXMuaHRtbFwiKSxcbiAgICAgICAgICBhZG1pbjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJhZG1pbi5odG1sXCIpLFxuICAgICAgICAgIGNoYXJ0czogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJjaGFydHMvaW5kZXguaHRtbFwiKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbcmVhY3QoKSwgc3R1ZGVudEVudHJ5UmV3cml0ZSgpLCBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCldLmZpbHRlcihCb29sZWFuKSxcbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUErVyxTQUFTLGNBQWMsZUFBNEI7QUFDbGEsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUhoQyxJQUFNLG1DQUFtQztBQVF6QyxTQUFTLHNCQUE4QjtBQUNyQyxRQUFNLFVBQVUsQ0FBQyxRQUE0QjtBQUMzQyxVQUFNLFlBQVksT0FBTyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDekMsUUFBSSxhQUFhLFNBQVMsU0FBUyxXQUFXLE1BQU0sRUFBRyxRQUFPO0FBQzlELFFBQUksYUFBYSxTQUFTLFNBQVMsV0FBVyxNQUFNLEVBQUcsUUFBTztBQUM5RCxRQUFJLGFBQWEsWUFBWSxTQUFTLFdBQVcsU0FBUyxFQUFHLFFBQU87QUFDcEUsV0FBTztBQUFBLEVBQ1Q7QUFFQSxTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixnQkFBZ0IsUUFBUTtBQUN0QixhQUFPLFlBQVksSUFBSSxDQUFDLEtBQUssTUFBTSxTQUFTO0FBQzFDLFlBQUksSUFBSSxRQUFRLFFBQVEsU0FBUyxXQUFXLEdBQUc7QUFDN0MsY0FBSSxNQUFNLFFBQVEsSUFBSSxHQUFHLEtBQUssSUFBSTtBQUFBLFFBQ3BDO0FBQ0EsYUFBSztBQUFBLE1BQ1AsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQ0Y7QUFHQSxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsUUFBTSxpQkFBaUIsSUFBSTtBQUUzQixTQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNLE9BQU8sUUFBUSxJQUFJLFFBQVEsSUFBSTtBQUFBLE1BQ3JDLE9BQU8saUJBQ0g7QUFBQSxRQUNFLGFBQWE7QUFBQSxVQUNYLFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxVQUNkLElBQUk7QUFBQSxVQUNKLFNBQVMsQ0FBQyxjQUFjLFVBQVUsUUFBUSxlQUFlLEVBQUU7QUFBQSxRQUM3RDtBQUFBLE1BQ0YsSUFDQTtBQUFBLElBQ047QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLHVCQUF1QjtBQUFBLE1BQ3ZCLGVBQWU7QUFBQSxRQUNiLE9BQU87QUFBQSxVQUNMLE1BQU0sS0FBSyxRQUFRLGtDQUFXLFlBQVk7QUFBQSxVQUMxQyxZQUFZLEtBQUssUUFBUSxrQ0FBVyxrQkFBa0I7QUFBQSxVQUN0RCxZQUFZLEtBQUssUUFBUSxrQ0FBVyxrQkFBa0I7QUFBQSxVQUN0RCxPQUFPLEtBQUssUUFBUSxrQ0FBVyxZQUFZO0FBQUEsVUFDM0MsUUFBUSxLQUFLLFFBQVEsa0NBQVcsbUJBQW1CO0FBQUEsUUFDckQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsU0FBUyxDQUFDLE1BQU0sR0FBRyxvQkFBb0IsR0FBRyxTQUFTLGlCQUFpQixnQkFBZ0IsQ0FBQyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3JHLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUN0QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
