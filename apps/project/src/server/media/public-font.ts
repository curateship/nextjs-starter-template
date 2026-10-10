import { eq } from "drizzle-orm"

import { appPublicTheme } from "@/lib/app-options"
import {
  cleanPublicFontName,
  publicFontStoragePath,
  validatePublicFontFile,
  type PublicFontAsset,
} from "@/lib/public-font"
import { publicThemeOverrides, type PublicTheme } from "@/lib/public-theme"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSettings, DEFAULT_SETTINGS_KEY } from "@/server/schema"
import {
  parseShellGlobals,
  readShellGlobals,
  shellGlobalsForWrite,
} from "@/server/shell-settings"
import {
  deleteFromR2,
  getFromR2,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media/storage"

type PublicFontStorage = {
  createId: () => string
  write: (path: string, data: Uint8Array) => Promise<void>
  remove: (path: string) => Promise<void>
}

const defaultStorage: PublicFontStorage = {
  createId: uuid,
  write: (path, data) => uploadToR2(path, data, "font/woff2"),
  remove: deleteFromR2,
}

export type PublicFontState = {
  publicFont: PublicFontAsset | null
  publicTheme: PublicTheme
}

type PublicFontSource = {
  current: () => Promise<PublicFontAsset | null>
  read: (path: string) => Promise<{
    Body?: unknown
    ContentLength?: number
    ETag?: string
  }>
}

const defaultSource: PublicFontSource = {
  current: async () => (await readShellGlobals()).publicFont,
  read: getFromR2,
}

/** Validates, stores, and selects one app-wide public font. */
export async function installPublicFont(
  file: { name: string; size: number; type: string; data: Uint8Array },
  database: CustomShellDb = db,
  storage: PublicFontStorage = defaultStorage
): Promise<PublicFontState> {
  validatePublicFontFile(file, file.data)

  const publicFont: PublicFontAsset = {
    name: cleanPublicFontName(file.name),
    version: storage.createId(),
  }
  const storagePath = publicFontStoragePath(publicFont)
  await storage.write(storagePath, file.data)

  let saved: { previousFont: PublicFontAsset | null; publicTheme: PublicTheme }
  try {
    saved = await database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ settings: customShellSettings.settings })
        .from(customShellSettings)
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
        .limit(1)
        .for("update")

      const globals = parseShellGlobals(existing?.settings)
      const nextTheme = { ...globals.publicTheme, useCustomFont: true }
      const settings = {
        ...shellGlobalsForWrite(existing?.settings),
        publicFont,
        publicTheme: publicThemeOverrides(nextTheme, appPublicTheme()),
      }
      const timestamp = now()

      if (existing) {
        await tx
          .update(customShellSettings)
          .set({ settings, updatedAt: timestamp })
          .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      } else {
        await tx.insert(customShellSettings).values({
          key: DEFAULT_SETTINGS_KEY,
          settings,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }

      return { previousFont: globals.publicFont, publicTheme: nextTheme }
    })
  } catch (error) {
    await storage.remove(storagePath).catch(() => undefined)
    throw error
  }

  if (saved.previousFont && saved.previousFont.version !== publicFont.version) {
    await storage
      .remove(publicFontStoragePath(saved.previousFont))
      .catch((error) => {
        console.error("Replaced public font could not be removed", error)
      })
  }

  return { publicFont, publicTheme: saved.publicTheme }
}

/** Clears the uploaded font and restores the built-in font kept in the theme. */
export async function removePublicFont(
  database: CustomShellDb = db,
  storage: Pick<PublicFontStorage, "remove"> = defaultStorage
): Promise<PublicFontState> {
  const saved = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)
      .for("update")

    const globals = parseShellGlobals(existing?.settings)
    const nextTheme = { ...globals.publicTheme, useCustomFont: false }
    const settings = {
      ...shellGlobalsForWrite(existing?.settings),
      publicFont: null,
      publicTheme: publicThemeOverrides(nextTheme, appPublicTheme()),
    }
    const timestamp = now()

    if (existing) {
      await tx
        .update(customShellSettings)
        .set({ settings, updatedAt: timestamp })
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    } else {
      await tx.insert(customShellSettings).values({
        key: DEFAULT_SETTINGS_KEY,
        settings,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    return { previousFont: globals.publicFont, publicTheme: nextTheme }
  })

  if (saved.previousFont) {
    await storage
      .remove(publicFontStoragePath(saved.previousFont))
      .catch((error) => {
        console.error("Removed public font file could not be deleted", error)
      })
  }

  return { publicFont: null, publicTheme: saved.publicTheme }
}

/** Serves only the current public font through the app's own origin. */
export async function publicFontResponse(
  request: Request,
  source: PublicFontSource = defaultSource
) {
  try {
    const publicFont = await source.current()
    const version = new URL(request.url).searchParams.get("v")
    if (!publicFont || version !== publicFont.version) {
      return unavailableFontResponse("Not found", 404)
    }

    const object = await source.read(publicFontStoragePath(publicFont))
    if (!object.Body) return unavailableFontResponse("Font unavailable", 502)

    const headers = new Headers({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "font/woff2",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    })
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", object.ContentLength.toString())
    }
    if (object.ETag) headers.set("ETag", object.ETag)

    return new Response(toBodyInit(object.Body), { headers })
  } catch (error) {
    return unavailableFontResponse(
      "Font unavailable",
      error instanceof R2StorageNotConfiguredError ? 503 : 502
    )
  }
}

function unavailableFontResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function toBodyInit(body: unknown): BodyInit {
  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream() as ReadableStream
  }

  return body as BodyInit
}
