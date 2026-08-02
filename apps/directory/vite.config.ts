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

// VITE_DIRECTORY_ORIGIN is the last-resort origin behind VITE_APP_URL and
// VITE_APP_DOMAIN, and it is frozen into the bundle at build time. A production
// image built without VITE_APP_URL would send auth emails, checkout returns and
// tenant site links to localhost, so warn loudly when that is about to happen.
// NODE_ENV is not set yet while Vite loads this file, so key the warning off the
// invoked command instead.
const configuredOrigin = process.env.VITE_APP_URL?.trim().replace(/\/+$/, "")
if (!configuredOrigin && process.argv.includes("build")) {
  console.warn(
    `[directory] VITE_APP_URL is not set — generated links will fall back to ${localOrigin}. Do not deploy this build.`,
  )
}
const directoryOrigin = configuredOrigin || localOrigin
// Avoid Nitro rebundling tslib's Node entry through a broken CJS default wrapper.
const tslibEsm = require.resolve("tslib/tslib.es6.mjs")

// https://vite.dev/config/
export default defineConfig({
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            advancedChunks: {
              groups: [
                // Icons are imported one file per icon across ~770 call sites,
                // so without this each one becomes its own preloaded request —
                // hundreds of bytes of SVG path per round trip. Safe to group
                // only because the public bundle no longer references lucide's
                // whole-library dynamic map; when it did, this swept in ~1,500
                // unused icons. React itself is deliberately left ungrouped:
                // chunking it broke module init order and crashed every page.
                {
                  name: "icons",
                  test: /node_modules\/lucide-react\//,
                  priority: 50,
                },
              ],
            },
          },
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_DIRECTORY_ORIGIN": JSON.stringify(directoryOrigin),
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
      "drizzle-orm",
      "isomorphic-dompurify",
      "pg",
      "sanitize-html",
      "undici",
    ],
  },
})
