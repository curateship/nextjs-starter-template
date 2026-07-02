import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
import localAppPorts from "../../local-apps.json"

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tanstackStart(), nitro(), react(), tailwindcss(), tsconfigPaths()],
  nitro: {
    routeRules: {
      "/**": { headers: securityHeaders },
    },
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  server: {
    port: localAppPorts["ai-video"],
    strictPort: true,
  },
})
