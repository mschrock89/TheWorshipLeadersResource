import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname, "charts"),
  envDir: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, "public/charts"),
  base: "/",
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8081),
  },
  build: {
    outDir: path.resolve(__dirname, process.env.CHARTS_OUT_DIR || "dist-charts"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
