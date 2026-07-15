import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import localAppPorts from "../../local-apps.json"

const securityHeaders = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tanstackStart(), nitro(), react(), tailwindcss()],
  nitro: { routeRules: { "/**": { headers: securityHeaders } } },
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  server: {
    port: localAppPorts.pomoder,
    strictPort: true,
  },
  build: { sourcemap: false },
})
