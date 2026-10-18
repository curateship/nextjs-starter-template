import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

import { DEV_APP_PORT } from "./app-port"
import { MENU_FILE, menuApi } from "./server/menu-file"
import { signInGate } from "./server/sign-in"

/**
 * Serves Personal's API: the sign-in, then `/api/menu`, which reads and writes
 * the menu file on this Mac. The sign-in goes first, so nothing behind it
 * answers without one.
 */
function personalApi(): Plugin {
  return {
    name: "personal:api",
    configureServer(server) {
      const origins = [`http://localhost:${DEV_APP_PORT}`, `http://127.0.0.1:${DEV_APP_PORT}`]
      // Read here, never through Vite's page settings, so the password stays
      // on the server. Vite restarts itself when `.env.local` changes.
      const { PERSONAL_PASSWORD } = loadEnv(server.config.mode, __dirname, "PERSONAL_")
      server.middlewares.use(signInGate({ password: PERSONAL_PASSWORD, allowedOrigins: origins }))
      server.middlewares.use(menuApi(MENU_FILE, origins))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), personalApi()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: DEV_APP_PORT,
    strictPort: true,
    fs: {
      // Vite's own list, plus the menu's folder: Vite serves the app's folder
      // as files, so `/data/menu.json` would hand out the menu with no sign-in.
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", `${path.resolve(__dirname, "data")}/**`],
    },
  },
})
