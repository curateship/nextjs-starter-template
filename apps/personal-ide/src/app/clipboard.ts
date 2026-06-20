import type { ClipboardEvent as ReactClipboardEvent } from "react"

export function clipboardImage(event: ReactClipboardEvent | ClipboardEvent) {
  const clipboardData = event.clipboardData
  if (!clipboardData) return null

  return (
    Array.from(clipboardData.files).find((item) => item.type.startsWith("image/")) ??
    Array.from(clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile() ??
    null
  )
}

export function pastedImageExtension(image: File) {
  return (
    {
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[image.type.toLowerCase()] ?? image.name.split(".").pop()?.toLowerCase()
  )
}
