import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  getLibraryPage,
  lastOpenedLibraryId,
  saveLibraryPageBody,
  setLibraryPageCover,
  setLibraryPageLock,
} from "@/server/note/library/page"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"

/**
 * The Library dashboard's left page (Tyler, 15 Nov 2026), and which library
 * `/library` opens on. Every one is the signed-in person's own.
 */

const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => getLibraryPage(context.user.id))

const lastFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => lastOpenedLibraryId(context.user.id))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveLibraryPageBody(context.user.id, data.body))

const lockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setLibraryPageLock(context.user.id, data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => setLibraryPageCover(context.user.id, data))

export function loadLibraryLeftPage() {
  return loadFn()
}
export function loadLastLibraryId() {
  return lastFn()
}
export function saveLibraryLeftPage(body: string) {
  return saveFn({ data: { body } })
}
export function lockLibraryLeftPage(locked: boolean) {
  return lockFn({ data: { locked } })
}
export function setLibraryLeftPageCover(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
