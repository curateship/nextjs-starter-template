import { createFileRoute } from "@tanstack/react-router"
import { getFromR2, parseLocalObjectUrlPath, usesLocalObjectStorage } from "@/lib/utils/r2"

const FORWARDED_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
]

export const Route = createFileRoute("/cdn/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const base = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "")
        const objectPath = params._splat || ""
        if (!objectPath || objectPath.split("/").includes("..")) {
          return Response.json({ error: "CDN object not found" }, { status: 404 })
        }

        if (usesLocalObjectStorage()) {
          const localObjectPath = parseLocalObjectUrlPath(objectPath)
          if (!localObjectPath) {
            return Response.json({ error: "CDN object not found" }, { status: 404 })
          }

          try {
            const object = await getFromR2(localObjectPath, request.headers.get("range"))
            const headers = new Headers({
              "Accept-Ranges": "bytes",
              "Cache-Control": "public, max-age=31536000, immutable",
              "Content-Length": String(object.ContentLength || 0),
              "Content-Type": object.ContentType || "application/octet-stream",
              "X-Content-Type-Options": "nosniff",
            })
            if (object.ContentRange) headers.set("Content-Range", object.ContentRange)

            return new Response(object.Body as BodyInit, {
              status: object.ContentRange ? 206 : 200,
              headers,
            })
          } catch {
            return Response.json({ error: "CDN object not found" }, { status: 404 })
          }
        }

        if (!base) {
          return Response.json({ error: "CDN object not found" }, { status: 404 })
        }

        const upstream = await fetch(
          `${base}/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
          {
            headers: request.headers.get("range")
              ? { Range: request.headers.get("range")! }
              : undefined,
          }
        )
        const headers = new Headers()
        for (const name of FORWARDED_HEADERS) {
          const value = upstream.headers.get(name)
          if (value) headers.set(name, value)
        }
        headers.set("Cache-Control", "public, max-age=31536000, immutable")
        headers.set("X-Content-Type-Options", "nosniff")

        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        })
      },
    },
  },
})
