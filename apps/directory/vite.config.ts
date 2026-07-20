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
  define: {
    "import.meta.env.VITE_DIRECTORY_ORIGIN": JSON.stringify(directoryOrigin),
  },
  environments: {
    // Client only. Server bundles are read off local disk, so splitting them
    // costs nothing there — this is purely about what the browser downloads.
    client: {
      build: {
        rollupOptions: {
          output: {
            // Rolldown's default splitting emitted 220 preloaded chunks for one
            // public page, 186 of them under 2 KB (median 302 bytes). Each is a
            // separate request the browser opens before the page settles, which
            // is the bulk of our Lighthouse Total Blocking Time. Merge the
            // slivers and keep genuinely shared vendor code in stable groups so
            // it stays cacheable across deploys.
            advancedChunks: {
              minSize: 30_000,
              // Deliberately NOT minShareCount: 2 — that only groups modules
              // imported from two or more places, which left every
              // single-use lucide icon as its own sub-1 KB chunk.
              groups: [
                {
                  name: "react",
                  test: /node_modules\/(react|react-dom|scheduler)\//,
                  priority: 100,
                },
                {
                  name: "tanstack",
                  test: /node_modules\/@tanstack\//,
                  priority: 90,
                },
                {
                  name: "editor",
                  test: /node_modules\/(@tiptap|prosemirror-)/,
                  priority: 80,
                },
                // Everything else from node_modules, but size-capped so it
                // splits into several medium chunks instead of one monolith a
                // public page would have to download in full.
                {
                  name: "vendor",
                  test: /node_modules\//,
                  priority: 10,
                  maxSize: 160_000,
                },
              ],
            },
          },
        },
      },
    },
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
