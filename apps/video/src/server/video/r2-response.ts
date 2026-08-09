import { getFromR2, R2StorageNotConfiguredError } from "@/server/media/storage"

/**
 * Streams a private stored object back through the app, the way the shell's
 * own media file route does — shared here because this app has several binary
 * routes (proxies, filmstrips) that would otherwise each rebuild the same
 * status-and-header dance.
 */
export async function streamPrivateR2Object({
  storagePath,
  contentType,
  range,
  cacheControl = "private, max-age=3600",
}: {
  storagePath: string
  contentType: string
  range?: string | null
  cacheControl?: string
}) {
  try {
    const object = await getFromR2(storagePath, range ?? undefined)
    if (!object.Body) {
      return Response.json(
        { detail: "Stored file has no content" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      )
    }

    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
      "Content-Type": object.ContentType || contentType,
      "X-Content-Type-Options": "nosniff",
    })
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", String(object.ContentLength))
    }
    if (object.ContentRange) {
      headers.set("Content-Range", object.ContentRange)
    }

    return new Response(toBodyInit(object.Body), {
      // 206 only when the caller asked for a range AND storage honored it —
      // claiming 206 for a full body breaks video seeking.
      status: range && object.ContentRange ? 206 : 200,
      headers,
    })
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) {
      return Response.json(
        {
          detail:
            "R2 storage is not configured. Set the CUSTOM_SHELL_R2_* environment variables.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    }
    return Response.json(
      { detail: "Failed to read stored file" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    )
  }
}

function toBodyInit(body: unknown): BodyInit {
  const stream = (
    body as { transformToWebStream?: () => ReadableStream }
  ).transformToWebStream?.()
  return (stream ?? body) as BodyInit
}
