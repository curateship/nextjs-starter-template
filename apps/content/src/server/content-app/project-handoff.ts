import { now as currentTime } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { recordCard as projectRecordCard } from "@/server/social/project-record-card"
import { readCardRequest, recordCard as videoRecordCard } from "@/server/video/project-record-card"

/**
 * Which part of Content a note from the Project app is for.
 *
 * Project stamps a note for "Edit video" with `app: "video"` and one for "Open
 * in Promo" with `app: "promo"`, and sends both to `/handoff/project`. Video and
 * Promo each answered that address on their own; in Content one route answers
 * both, so it reads the note's `app` first and hands the note to the part that
 * checks it (`workspace/docs/content-app.md`).
 *
 * Nothing is trusted here. The stamp is checked afterwards by the part the note
 * is handed to, with `PROJECT_HANDOFF_KEY`, and a note whose `app` was changed
 * no longer matches its stamp.
 */
export function handoffNoteApp(raw: string): "video" | "promo" | null {
  const [body] = raw.split(".")
  if (!body) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (parsed && typeof parsed === "object" && "app" in parsed) {
      const app = (parsed as { app: unknown }).app
      if (app === "video" || app === "promo") return app
    }
  } catch {
    return null
  }
  return null
}

/**
 * Project's request for a task card's name and picture. Video and Promo each
 * answered `/api/connect/project/record-card` on their own, with the same
 * stamp. The request names a record and not an app, so Content checks the
 * stamp once and looks the record up as a video project first, then as a
 * project (`workspace/docs/content-app.md`).
 */
export async function contentRecordCardResponse(
  request: Request,
  { database = db, env = process.env, at = currentTime() }: { database?: CustomShellDb; env?: NodeJS.ProcessEnv; at?: Date } = {}
) {
  const key = env.PROJECT_HANDOFF_KEY?.trim()
  const record = key ? readCardRequest(new URL(request.url), key, at) : null
  if (!record) return Response.json({ error: "Content does not know this request." }, { status: 401, headers: NEVER_CACHE })
  const card = (await videoRecordCard(record, database)) ?? (await projectRecordCard(record, database))
  if (!card) return Response.json({ error: "That project is gone." }, { status: 404, headers: NEVER_CACHE })
  return Response.json(card, { headers: NEVER_CACHE })
}

const NEVER_CACHE = { "cache-control": "no-store" }
