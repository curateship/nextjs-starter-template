import { createServer } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { liveServer } from "./live"

/**
 * Starts live Personal. Built into `dist-server/main.js` next to the page in
 * `dist/` (`npm run build`), and run by the Docker image.
 */

/**
 * A setting live Personal can't start without. Starting anyway would put it
 * online with no way in, or with every save refused.
 */
function setting(name: string) {
  const value = process.env[name]
  if (!value) {
    console.error(`[personal] Set ${name} before starting.`)
    process.exit(1)
  }
  return value
}

const origin = setting("PERSONAL_ORIGIN")
const handler = liveServer({
  distDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist"),
  menuFile: setting("PERSONAL_MENU_FILE"),
  password: setting("PERSONAL_PASSWORD"),
  origin,
  // Cloudflare names the visitor; without it, everyone is one visitor.
  visitorOf: (request) => String(request.headers["cf-connecting-ip"] ?? ""),
})

const port = Number(process.env.PORT ?? 3000)
createServer((request, response) => void handler(request, response)).listen(port, () => {
  console.log(`[personal] Listening on ${port} for ${origin}.`)
})
