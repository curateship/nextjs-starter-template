import { createServerFn } from "@tanstack/react-start"

import { describeAuthError } from "@/lib/api/error-message"
import { getPublicFontUploadError } from "@/lib/public-font"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { adminPost } from "@/server/guards"
import {
  installPublicFont,
  removePublicFont as removeStoredPublicFont,
} from "@/server/media/public-font"
import { R2StorageNotConfiguredError } from "@/server/media/storage"

export function getPublicFontErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return (
    describeAuthError(message) ??
    (message || "The public font could not be changed. Try again.")
  )
}

const uploadPublicFontFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error("Choose a WOFF2 font file.")
    return file
  })
  .handler(async ({ data, context }) => {
    const error = getPublicFontUploadError(data)
    if (error) throw new Error(error)

    await enforceRateLimit(`public-font-upload:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 10 * 60,
    })

    try {
      return await installPublicFont({
        name: data.name,
        size: data.size,
        type: data.type,
        data: new Uint8Array(await data.arrayBuffer()),
      })
    } catch (uploadError) {
      if (uploadError instanceof R2StorageNotConfiguredError) {
        throw new Error("Font storage is not configured.")
      }
      throw uploadError
    }
  })

const removePublicFontFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(() => removeStoredPublicFont())

export function uploadPublicFont(file: File) {
  const formData = new FormData()
  formData.append("file", file)
  return uploadPublicFontFn({ data: formData })
}

export function removePublicFont() {
  return removePublicFontFn()
}
