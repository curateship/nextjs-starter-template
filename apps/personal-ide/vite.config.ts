import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    process.env.ANALYZE === "true" &&
      visualizer({ filename: "dist/bundle-stats.html", gzipSize: true }),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // The IDE creates/moves task, doc, and skill files at runtime. Watching
      // them makes the dev server full-reload the app on every move.
      ignored: ["**/workspace/**", "**/.agents/**", "**/dist/**", "**/src-tauri/**"],
    },
  },
})
