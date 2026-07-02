import {
  getFromR2,
  R2StorageNotConfiguredError,
  toBodyInit,
} from "@/server/media-storage"

export async function streamPrivateR2Object({
  storagePath,
  contentType,
  range,
  cacheControl = "private, max-age=3600",
  missingBodyMessage = "Failed to load asset",
  storageNotConfiguredMessage = "R2 storage is not configured.",
  failureMessage = "Failed to load asset",
}: {
  storagePath: string
  contentType: string
  range?: string | null
  cacheControl?: string
  missingBodyMessage?: string
  storageNotConfiguredMessage?: string
  failureMessage?: string
}) {
  try {
    const object = await getFromR2(storagePath, range)
    if (!object.Body) {
      return Response.json({ detail: missingBodyMessage }, { status: 502 })
    }

    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
      "Content-Type": object.ContentType || contentType,
      "X-Content-Type-Options": "nosniff",
    })
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", object.ContentLength.toString())
    }
    if (object.ContentRange) {
      headers.set("Content-Range", object.ContentRange)
    }

    return new Response(toBodyInit(object.Body), {
      status: range && object.ContentRange ? 206 : 200,
      headers,
    })
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) {
      return Response.json(
        { detail: storageNotConfiguredMessage },
        { status: 503 }
      )
    }
    return Response.json({ detail: failureMessage }, { status: 502 })
  }
}
