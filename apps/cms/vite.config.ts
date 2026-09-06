import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, type Plugin } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

import { DEV_APP_PORT } from "./app-port"

function publicFontDevRoute(): Plugin {
  return {
    name: "custom-shell:public-font-dev-route",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      // Nitro's dev middleware skips requests whose browser destination is font.
      server.middlewares.use(async (request, response, next) => {
        if (!request.url || request.method !== "GET") return next()

        const requestUrl = new URL(
          request.url,
          `http://localhost:${DEV_APP_PORT}`
        )
        if (requestUrl.pathname !== "/public-font.woff2") return next()

        try {
          const nitroEnvironment = server.environments.nitro
          if (!nitroEnvironment || !("dispatchFetch" in nitroEnvironment)) {
            return next()
          }
          const dispatchFetch = nitroEnvironment.dispatchFetch
          if (typeof dispatchFetch !== "function") return next()

          const fontResponse = (await dispatchFetch.call(
            nitroEnvironment,
            new Request(requestUrl)
          )) as Response

          response.statusCode = fontResponse.status
          response.statusMessage = fontResponse.statusText
          fontResponse.headers.forEach((value, name) => {
            response.setHeader(name, value)
          })
          response.end(Buffer.from(await fontResponse.arrayBuffer()))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    publicFontDevRoute(),
    tanstackStart({
      router: {
        // `*.page.ts` files beside routes are page declarations (see
        // src/lib/pages/page-registry.ts), not routes. Without this the route
        // generator claims them and writes route boilerplate into them.
        routeFileIgnorePattern: "\\.page\\.ts$",
      },
    }),
    nitro({
      routes: {
        "/public-font.woff2": {
          handler: "./src/server/media/public-font-handler.ts",
          method: "GET",
        },
      },
    }),
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
  // Handed to the server bundle so `src/server/auth/origin.ts` can allow this app's
  // own dev address without the port being written out a second time.
  define: {
    __DEV_APP_PORT__: JSON.stringify(DEV_APP_PORT),
  },
  server: {
    port: DEV_APP_PORT,
    strictPort: true,
  },
})
