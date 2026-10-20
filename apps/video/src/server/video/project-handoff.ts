import { createHmac, timingSafeEqual } from "node:crypto"

import { and, eq, gt, inArray, lt } from "drizzle-orm"
import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { z } from "zod"

import { createSecretToken, hashToken, now as currentTime, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { videoHandoffNotes, videoProjectGuests, videoProjects, type VideoProjectGuestRow } from "@/server/video/schema"

/**
 * Guests sent from Project (Connected apps task 01, Tyler's design of
 * 15 Oct 2026). Somebody on a Project task presses "Edit video"; Project
 * checks them and stamps a note with the key the two apps share; the
 * browser brings the note to `/handoff/project`. This file checks it and
 * signs in a guest for that one video project. The whole flow is in
 * `workspace/docs/project-guests.md`.
 *
 * - The stamp is an HMAC of the note with `PROJECT_HANDOFF_KEY`. One changed
 *   character and it no longer matches.
 * - A note works for 60 seconds, and once: its one-time id is saved in the
 *   same transaction that makes the guest, so a copied address fails.
 * - The guest's sign-in lasts 12 hours and opens that project only. It is
 *   not an account.
 */

/** How long a guest stays signed in. Tyler: 12 hours. */
export const GUEST_HOURS = 12

/** The cookie holding a browser's guest tokens, one per video project it was sent to. */
const GUEST_COOKIE = "video_project_guest"

/** The most projects one browser holds at once; the oldest goes first. */
const MAX_GUEST_TOKENS = 5

/**
 * The longest a note may claim to live. Project's last 60 seconds; a little
 * more allows for two clocks that disagree.
 */
const MAX_NOTE_SECONDS = 120

/** Why a note was refused, each said in words on the refusal page. */
export type HandoffRefusal = "used" | "expired" | "bad" | "gone" | "off"

const noteSchema = z.object({
  v: z.literal(1),
  app: z.literal("video"),
  record: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  sub: z.string().min(1).max(36),
  name: z.string().trim().min(1).max(200),
  email: z.string().max(320),
  jti: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  exp: z.number().int(),
})

export type HandoffNote = z.infer<typeof noteSchema>

/** The note inside a stamped address, or why it can't be used. Nothing is saved. */
export function readHandoffNote(raw: string, key: string, at: Date): HandoffNote | HandoffRefusal {
  const [body, stamp, extra] = raw.split(".")
  if (!body || !stamp || extra !== undefined) return "bad"
  // Compared as written, not decoded: base64 decoding ignores the spare bits
  // of the last character, so two different stamps could decode the same.
  const expected = Buffer.from(createHmac("sha256", key).update(body).digest("base64url"))
  const given = Buffer.from(stamp)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "bad"
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return "bad"
  }
  const note = noteSchema.safeParse(parsed)
  if (!note.success) return "bad"
  const seconds = at.getTime() / 1000
  if (note.data.exp <= seconds) return "expired"
  if (note.data.exp > seconds + MAX_NOTE_SECONDS) return "bad"
  return note.data
}

/**
 * Checks a stamped note and, when it holds, saves its one-time id and signs
 * in a guest for its project in one transaction. Returns the guest's cookie
 * token, or why the note was refused.
 */
export async function acceptHandoff(
  raw: string,
  {
    database = db,
    env = process.env,
    at = currentTime(),
  }: { database?: CustomShellDb; env?: NodeJS.ProcessEnv; at?: Date } = {}
): Promise<{ token: string; projectId: string } | { refused: HandoffRefusal }> {
  const key = env.PROJECT_HANDOFF_KEY?.trim()
  if (!key) return { refused: "off" }
  const note = readHandoffNote(raw, key, at)
  if (typeof note === "string") return { refused: note }

  return database.transaction(async (tx) => {
    // Notes and guests past their time are cleared on the way, so neither
    // table grows. An expired note is refused above whether or not its row is kept.
    await tx.delete(videoHandoffNotes).where(lt(videoHandoffNotes.expiresAt, at))
    await tx.delete(videoProjectGuests).where(lt(videoProjectGuests.expiresAt, at))

    const [fresh] = await tx
      .insert(videoHandoffNotes)
      .values({ noteId: note.jti, usedAt: at, expiresAt: new Date(note.exp * 1000) })
      .onConflictDoNothing()
      .returning({ noteId: videoHandoffNotes.noteId })
    if (!fresh) return { refused: "used" as const }

    const [project] = await tx
      .select({ id: videoProjects.id })
      .from(videoProjects)
      .where(eq(videoProjects.id, note.record))
      .limit(1)
    if (!project) return { refused: "gone" as const }

    const token = createSecretToken()
    await tx.insert(videoProjectGuests).values({
      id: uuid(),
      tokenHash: hashToken(token),
      projectId: project.id,
      personId: note.sub,
      personName: note.name,
      personEmail: note.email,
      createdAt: at,
      expiresAt: new Date(at.getTime() + GUEST_HOURS * 3600_000),
    })
    return { token, projectId: project.id }
  })
}

/** The guest tokens this browser holds. */
function guestTokens(): string[] {
  return (getCookie(GUEST_COOKIE) ?? "").split(".").filter((token) => /^[0-9a-f]{64}$/.test(token))
}

/** Adds a guest token to this browser's cookie, keeping the newest few. */
export function addGuestCookie(token: string) {
  const tokens = [...guestTokens().filter((held) => held !== token), token].slice(-MAX_GUEST_TOKENS)
  setCookie(GUEST_COOKIE, tokens.join("."), {
    httpOnly: true,
    maxAge: GUEST_HOURS * 3600,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}

/** The live guest sign-ins this browser holds, one per project. */
export async function findBrowserGuests(database: CustomShellDb = db, at = currentTime()): Promise<VideoProjectGuestRow[]> {
  const tokens = guestTokens()
  if (tokens.length === 0) return []
  return database
    .select()
    .from(videoProjectGuests)
    .where(
      and(
        inArray(
          videoProjectGuests.tokenHash,
          tokens.map((token) => hashToken(token))
        ),
        gt(videoProjectGuests.expiresAt, at)
      )
    )
}
