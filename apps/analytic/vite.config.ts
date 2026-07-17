import path from "path"
import { createRequire } from "node:module"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

// Port is assigned only in local-apps.json (repo rule); never hardcode it here.
const require = createRequire(import.meta.url)
const localApps = require("../../local-apps.json") as Record<string, number>

// https://vite.dev/config/
export default defineConfig({
  plugins: [tanstackStart(), nitro(), react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  server: {
    port: localApps.analytic,
    strictPort: true,
  },
})
