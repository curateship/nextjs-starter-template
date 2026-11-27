import { createHmac, timingSafeEqual } from "node:crypto"

import { eq } from "drizzle-orm"

import { now as currentTime } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { promoProjects } from "@/server/social/schema"

/**
 * The name and picture of one Promo project, for the Video or Promo card in a
 * Project task's notes (Project's note blocks task, part 10; Tyler, 5 Nov 2026:
 * "Task's record, with name + picture"). The whole flow is in
 * `workspace/docs/project-guests.md`, "The card in Project's notes".
 *
 * - Project asks with `?record=&exp=&sig=`. The stamp is an HMAC of
 *   `record-card.v1.<record>.<exp>` with `PROJECT_HANDOFF_KEY`, the key the
 *   two apps already share. The words in front mean a card request can never
 *   pass as a sign-in note, and a sign-in note never as a card request.
 * - A request works for at most two minutes. It signs nobody in and changes
 *   nothing: it reads one project's name and its picture.
 * - Project asks only for someone who may press Open in Promo on that task.
 */

/** The longest a request may claim to live. Project's last 60 seconds; a little more allows for two clocks that disagree. */
const MAX_REQUEST_SECONDS = 120
const RECORD = /^[A-Za-z0-9-]{1,64}$/

/** The project a stamped card request names, or null when the stamp, the time or the id is wrong. */
export function readCardRequest(url: URL, key: string, at: Date): string | null {
  const record = url.searchParams.get("record") ?? ""
  const expText = url.searchParams.get("exp") ?? ""
  const stamp = url.searchParams.get("sig") ?? ""
  if (!RECORD.test(record) || !/^\d{1,12}$/.test(expText)) return null
  const exp = Number(expText)
  const seconds = at.getTime() / 1000
  if (exp <= seconds || exp > seconds + MAX_REQUEST_SECONDS) return null
  // Compared as written, not decoded: two different stamps could decode the same.
  const expected = Buffer.from(createHmac("sha256", key).update(`record-card.v1.${record}.${exp}`).digest("base64url"))
  const given = Buffer.from(stamp)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return record
}

/** One Promo project's name and picture, or null when it's gone. */
export async function recordCard(projectId: string, database: CustomShellDb = db) {
  const [project] = await database
    .select({ name: promoProjects.name, imageUrl: promoProjects.imageUrl })
    .from(promoProjects)
    .where(eq(promoProjects.id, projectId))
    .limit(1)
  if (!project) return null
  return { name: project.name, pictureUrl: project.imageUrl.startsWith("https://") ? project.imageUrl : null }
}

const NEVER_CACHE = { "cache-control": "no-store" }

/** Project's card request, answered with the name and picture, or refused with nothing about the project. */
export async function recordCardResponse(
  request: Request,
  { database = db, env = process.env, at = currentTime() }: { database?: CustomShellDb; env?: NodeJS.ProcessEnv; at?: Date } = {}
) {
  const key = env.PROJECT_HANDOFF_KEY?.trim()
  const record = key ? readCardRequest(new URL(request.url), key, at) : null
  if (!record) return Response.json({ error: "Promo does not know this request." }, { status: 401, headers: NEVER_CACHE })
  const card = await recordCard(record, database)
  if (!card) return Response.json({ error: "That Promo project is gone." }, { status: 404, headers: NEVER_CACHE })
  return Response.json(card, { headers: NEVER_CACHE })
}
