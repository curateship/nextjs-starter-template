import path from "path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import rsc from "@vitejs/plugin-rsc"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const require = createRequire(import.meta.url)
const localApps = require("../../local-apps.json") as Record<string, number>
const localOrigin = `http://localhost:${localApps.directory}`
const appDirectory = path.dirname(fileURLToPath(import.meta.url))
// Avoid Nitro rebundling tslib's Node entry through a broken CJS default wrapper.
const tslibEsm = require.resolve("tslib/tslib.es6.mjs")

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_DIRECTORY_ORIGIN": JSON.stringify(localOrigin),
  },
  plugins: [
    tanstackStart({ rsc: { enabled: true } }),
    rsc(),
    nitro({
      rollupConfig: {
        // jsdom relies on its package-relative __dirname at runtime.
        external: ["isomorphic-dompurify"],
      },
    }),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ["lucide-react", "pg"],
  },
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: /^tslib$/,
        replacement: tslibEsm,
      },
      {
        find: "@",
        replacement: path.resolve(appDirectory, "./src"),
      },
    ],
  },
  server: {
    port: localApps.directory,
    strictPort: true,
  },
  ssr: {
    external: [
      "@aws-sdk/client-s3",
      "isomorphic-dompurify",
      "pg",
      "sanitize-html",
      "undici",
    ],
  },
})
