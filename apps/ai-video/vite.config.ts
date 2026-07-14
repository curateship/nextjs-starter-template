import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import localAppPorts from "../../local-apps.json"

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "media-src 'self' https: blob:",
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
  plugins: [
    {
      name: "ai-video-api-asset-dev-route",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname
          if (isApiAssetRoute(pathname)) {
            delete req.headers["sec-fetch-dest"]
          }
          next()
        })
      },
    },
    tanstackStart(),
    nitro(),
    react(),
    tailwindcss(),
  ],
  nitro: {
    routeRules: {
      "/**": { headers: securityHeaders },
    },
  },
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
    port: localAppPorts["ai-video"],
    strictPort: true,
  },
})

function isApiAssetRoute(pathname: string) {
  return [
    /^\/api\/v1\/media\/[^/]+\/file$/,
    /^\/api\/v1\/media\/[^/]+\/proxy$/,
    /^\/api\/v1\/actors\/[^/]+\/image$/,
    /^\/api\/v1\/creators\/[^/]+\/avatar$/,
    /^\/api\/v1\/projects\/[^/]+\/render-thumbnail$/,
    /^\/api\/v1\/templates\/[^/]+\/thumbnail$/,
    /^\/api\/v1\/viral-videos\/[^/]+\/thumbnail$/,
  ].some((pattern) => pattern.test(pathname))
}
