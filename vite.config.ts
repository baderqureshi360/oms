import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("react")) {
            return "react";
          }

          if (id.includes("@radix-ui")) {
            return "radix";
          }

          if (id.includes("recharts")) {
            return "charts";
          }

          if (id.includes("date-fns")) {
            return "date-fns";
          }

          if (id.includes("lucide-react")) {
            return "icons";
          }

          if (id.includes("@supabase")) {
            return "supabase";
          }

          return "vendor";
        },
      },
    },
  },
}));
