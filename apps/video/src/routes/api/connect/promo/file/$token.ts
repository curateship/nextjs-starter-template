import { createFileRoute } from "@tanstack/react-router"

import { readFilePart, sendForToken, streamPart } from "@/server/video/promo-sends"

/**
 * Where Promo fetches a sent file (`workspace/docs/send-to-promo.md`). No
 * sign-in: the token is the guard. It is 32 random bytes, only its hash is
 * kept, it opens one send's files only, and it lasts two hours or until the
 * send arrives. `?part=` picks the file, its cover, the PDF or a slide.
 */
export const Route = createFileRoute("/api/connect/promo/file/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const send = await sendForToken(params.token)
        const part = readFilePart(new URL(request.url).searchParams.get("part"))
        if (!send || !part) return Response.json({ error: "No such file." }, { status: 404, headers: { "cache-control": "no-store" } })
        try {
          return await streamPart(send, part)
        } catch (error) {
          console.error("A file for Promo could not be read", send.id, error)
          return Response.json({ error: "The file could not be read. Try again." }, { status: 502, headers: { "cache-control": "no-store" } })
        }
      },
    },
  },
})
