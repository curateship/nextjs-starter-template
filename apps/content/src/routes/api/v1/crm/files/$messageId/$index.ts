import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { requireAdmin } from "@/server/auth/security"
import { db } from "@/server/db"
import { getFromR2, R2StorageNotConfiguredError } from "@/server/media/storage"
import { currentWorkspaceId } from "@/server/people/workspaces"
import { customShellCrmMessages } from "@/server/schema"

/**
 * One file of one CRM message, served to an admin of the site it belongs to
 * (CRM task 21, built in task 36 on 7 Nov 2026). **Somebody else's mail is
 * not public**, so there is no bucket address: the message is read with the
 * site's id in the query, and a file from another site answers "not found".
 *
 * A picture of a plain kind is shown in the page. Everything else downloads,
 * typed as bytes, so a stranger's HTML or script can never run here, and
 * `nosniff` stops the browser guessing otherwise.
 */
const SHOWN_IN_PAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export const Route = createFileRoute("/api/v1/crm/files/$messageId/$index")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        let workspaceId: string
        try {
          const admin = await requireAdmin()
          workspaceId = await currentWorkspaceId(admin.id)
        } catch {
          return Response.json({ detail: "Not allowed" }, { status: 403 })
        }

        const index = Number(params.index)
        if (!Number.isInteger(index) || index < 0 || index > 200) {
          return Response.json({ detail: "File not found" }, { status: 404 })
        }

        const [message] = await db
          .select({ attachments: customShellCrmMessages.attachments })
          .from(customShellCrmMessages)
          .where(
            and(
              eq(customShellCrmMessages.workspaceId, workspaceId),
              eq(customShellCrmMessages.id, params.messageId)
            )
          )
          .limit(1)
        const file = message?.attachments[index]
        if (!file?.storageKey) {
          return Response.json({ detail: "File not found" }, { status: 404 })
        }

        try {
          const object = await getFromR2(file.storageKey)
          if (!object.Body) return Response.json({ detail: "Failed to load the file" }, { status: 502 })
          const type = (file.contentType ?? "").toLowerCase()
          const inPage = SHOWN_IN_PAGE.has(type)
          const name = file.filename.replace(/["\\\r\n]/g, "") || "file"
          const headers = new Headers({
            "Cache-Control": "private, no-store",
            "Content-Type": inPage ? type : "application/octet-stream",
            "Content-Disposition": `${inPage ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
            "X-Content-Type-Options": "nosniff",
          })
          if (object.ContentLength !== undefined) headers.set("Content-Length", object.ContentLength.toString())
          const body = object.Body as { transformToWebStream?: () => ReadableStream }
          return new Response(body.transformToWebStream ? body.transformToWebStream() : (object.Body as BodyInit), {
            status: 200,
            headers,
          })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json({ detail: "File storage is not set up." }, { status: 503 })
          }
          return Response.json({ detail: "Failed to load the file" }, { status: 502 })
        }
      },
    },
  },
})
