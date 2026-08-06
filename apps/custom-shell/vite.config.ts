import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

import { DEV_APP_PORT } from "./app-port"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        // `*.page.ts` files beside routes are page declarations (see
        // src/lib/pages/page-registry.ts), not routes. Without this the route
        // generator claims them and writes route boilerplate into them.
        routeFileIgnorePattern: "\\.page\\.ts$",
      },
    }),
    nitro(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  // Handed to the server bundle so `src/server/origin.ts` can allow this app's
  // own dev address without the port being written out a second time.
  define: {
    __DEV_APP_PORT__: JSON.stringify(DEV_APP_PORT),
  },
  server: {
    port: DEV_APP_PORT,
    strictPort: true,
  },
})
