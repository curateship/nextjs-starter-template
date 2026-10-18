import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { defaultMenu, menuSchema, type Menu } from "../src/lib/menu"
import { readBody, send } from "./http"

/**
 * The menu lives in one JSON file on this Mac, so every browser sees the same
 * one. The dev server answers `/api/menu`: GET reads it, PUT replaces it.
 * Both need a sign-in, which `signInGate` in `server/sign-in.ts` checks before
 * a request reaches this file.
 */

export const MENU_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/menu.json"
)

/** Larger than any menu the limits in `menuSchema` allow. */
const MAX_BODY_BYTES = 512 * 1024

/** The saved menu, or the starting one when nothing is saved yet. */
export async function readMenu(file: string): Promise<Menu> {
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultMenu()
    throw error
  }
  const parsed = menuSchema.safeParse(JSON.parse(text))
  if (!parsed.success) {
    throw new Error(`${file} is not a menu Personal can read: ${parsed.error.message}`)
  }
  return parsed.data
}

/**
 * Checks and saves a whole menu. Written to a second file and renamed over the
 * first, so a crash halfway never leaves half a menu behind.
 */
export async function writeMenu(file: string, value: unknown): Promise<Menu> {
  const menu = menuSchema.parse(value)
  await mkdir(path.dirname(file), { recursive: true })
  const draft = `${file}.saving`
  await writeFile(draft, `${JSON.stringify(menu, null, 2)}\n`, "utf8")
  await rename(draft, file)
  return menu
}

/**
 * `/api/menu` for the dev server. A save must come from Personal's own page:
 * another site open in the same browser could otherwise post to this address.
 */
export function menuApi(file: string, allowedOrigins: string[]) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void
  ) => {
    if (request.url?.split("?")[0] !== "/api/menu") return next()
    try {
      if (request.method === "GET") {
        return send(response, 200, await readMenu(file))
      }
      if (request.method !== "PUT") {
        return send(response, 405, { error: "Only GET and PUT." })
      }
      if (!allowedOrigins.includes(request.headers.origin ?? "")) {
        return send(response, 403, { error: "Saves only come from Personal's own page." })
      }
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        return send(response, 415, { error: "Send the menu as JSON." })
      }
      let value: unknown
      try {
        value = JSON.parse(await readBody(request, MAX_BODY_BYTES))
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === "too-large"
        return send(response, tooLarge ? 413 : 400, {
          error: tooLarge ? "That menu is too large." : "That is not JSON.",
        })
      }
      const parsed = menuSchema.safeParse(value)
      if (!parsed.success) {
        return send(response, 400, {
          error: parsed.error.issues[0]?.message ?? "That is not a menu.",
        })
      }
      return send(response, 200, await writeMenu(file, parsed.data))
    } catch (error) {
      console.error("[personal] menu file:", error)
      return send(response, 500, {
        error: error instanceof Error ? error.message : "The menu file failed.",
      })
    }
  }
}
