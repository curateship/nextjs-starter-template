import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import { DEV_APP_PORT } from "./app-port"
import { MENU_FILE, menuApi } from "./server/menu-file"

/** Serves `/api/menu`, which reads and writes the menu file on this Mac. */
function menuFile(): Plugin {
  return {
    name: "personal:menu-file",
    configureServer(server) {
      server.middlewares.use(
        menuApi(MENU_FILE, [
          `http://localhost:${DEV_APP_PORT}`,
          `http://127.0.0.1:${DEV_APP_PORT}`,
        ])
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), menuFile()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: DEV_APP_PORT,
    strictPort: true,
  },
})
