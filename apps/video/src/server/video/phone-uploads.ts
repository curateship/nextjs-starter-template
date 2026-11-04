import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm"
import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"

import { createSecretToken, hashToken, now as currentTime, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject } from "@/server/video/projects"
import { customShellUsers } from "@/server/schema"
import { videoPhoneLinks, videoProjects, type VideoPhoneLinkRow } from "@/server/video/schema"

/**
 * Sending files to a video project from a phone (workspace/docs/phone-uploads.md).
 *
 * The editor makes a link and shows it as a QR code. The link's secret sits
 * after the `#`, so it never reaches a server log or a referrer. The phone's
 * page sends it here once: a link opened within 15 minutes, and never before,
 * becomes a sign-in for that one phone, held in its own cookie, good for two
 * hours of sending files into that one project and nothing else. Only hashes
 * of the two secrets are kept.
 */

/** How long a new link may wait to be opened. */
export const PHONE_LINK_MINUTES = 15
/** How long the phone that opened it may go on sending files. */
export const PHONE_SESSION_HOURS = 2

const PHONE_COOKIE = "video_phone"

/** Why the phone's page could not open a link, each said in words there. */
export type PhoneLinkRefusal = "bad" | "expired" | "used"

/**
 * A new link for the owner's own project. Links and phone sign-ins past both
 * their times are cleared on the way, so the table never grows.
 */
export async function createPhoneLink(
  userId: string,
  projectId: string,
  database: CustomShellDb = db,
  at = currentTime()
) {
  await getOwnedProject(userId, projectId, database)
  await database
    .delete(videoPhoneLinks)
    .where(
      and(
        lt(videoPhoneLinks.expiresAt, at),
        or(isNull(videoPhoneLinks.sessionExpiresAt), lt(videoPhoneLinks.sessionExpiresAt, at))
      )
    )
  const token = createSecretToken()
  const id = uuid()
  const expiresAt = new Date(at.getTime() + PHONE_LINK_MINUTES * 60_000)
  await database.insert(videoPhoneLinks).values({
    id,
    userId,
    projectId,
    tokenHash: hashToken(token),
    createdAt: at,
    expiresAt,
  })
  return { id, token, expiresAt }
}

/**
 * Opens a link on the phone: checks it and, when it holds, starts the phone's
 * sign-in in the same write that marks the link used, so two phones racing
 * for one link can't both get in. Returns the sign-in's secret for the cookie.
 */
export async function openPhoneLink(
  token: string,
  database: CustomShellDb = db,
  at = currentTime()
): Promise<{ session: string; projectName: string } | { refused: PhoneLinkRefusal }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { refused: "bad" }
  const [link] = await database
    .select()
    .from(videoPhoneLinks)
    .where(eq(videoPhoneLinks.tokenHash, hashToken(token)))
    .limit(1)
  if (!link) return { refused: "bad" }
  if (link.openedAt) return { refused: "used" }
  if (link.expiresAt <= at) return { refused: "expired" }

  const session = createSecretToken()
  const [opened] = await database
    .update(videoPhoneLinks)
    .set({
      openedAt: at,
      sessionHash: hashToken(session),
      sessionExpiresAt: new Date(at.getTime() + PHONE_SESSION_HOURS * 3600_000),
    })
    .where(and(eq(videoPhoneLinks.id, link.id), isNull(videoPhoneLinks.openedAt)))
    .returning({ id: videoPhoneLinks.id })
  if (!opened) return { refused: "used" }

  const [project] = await database
    .select({ name: videoProjects.name })
    .from(videoProjects)
    .where(eq(videoProjects.id, link.projectId))
    .limit(1)
  return { session, projectName: project?.name ?? "your project" }
}

/** The live phone sign-in behind this secret, or null. */
export async function findPhoneSession(
  session: string | undefined,
  database: CustomShellDb = db,
  at = currentTime()
): Promise<VideoPhoneLinkRow | null> {
  if (!session || !/^[0-9a-f]{64}$/.test(session)) return null
  // Only while the owner's account is still active: a suspended account's
  // phone stops sending at once.
  const [found] = await database
    .select({ link: videoPhoneLinks })
    .from(videoPhoneLinks)
    .innerJoin(customShellUsers, eq(customShellUsers.id, videoPhoneLinks.userId))
    .where(
      and(
        eq(videoPhoneLinks.sessionHash, hashToken(session)),
        gt(videoPhoneLinks.sessionExpiresAt, at),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)
  return found?.link ?? null
}

/**
 * Ends a link at once, scanned or not: the code stops opening and the phone
 * that opened it stops sending. The owner's "Stop this phone" in the editor.
 */
export async function endPhoneLink(
  userId: string,
  linkId: string,
  database: CustomShellDb = db,
  at = currentTime()
) {
  await database
    .update(videoPhoneLinks)
    .set({ expiresAt: at, sessionHash: null, sessionExpiresAt: at })
    .where(and(eq(videoPhoneLinks.id, linkId), eq(videoPhoneLinks.userId, userId)))
}

/** Counts one more file arrived through this link, for the editor's window. */
export async function countPhoneFile(linkId: string, database: CustomShellDb = db) {
  await database
    .update(videoPhoneLinks)
    .set({ filesReceived: sql`${videoPhoneLinks.filesReceived} + 1` })
    .where(eq(videoPhoneLinks.id, linkId))
}

/**
 * What the editor's window shows about its own link: still waiting to be
 * scanned, open on a phone, or past its time, and how many files came.
 */
export async function phoneLinkStatus(
  userId: string,
  linkId: string,
  database: CustomShellDb = db,
  at = currentTime()
) {
  const [link] = await database
    .select()
    .from(videoPhoneLinks)
    .where(and(eq(videoPhoneLinks.id, linkId), eq(videoPhoneLinks.userId, userId)))
    .limit(1)
  if (!link) return { state: "ended" as const, files: 0 }
  const state = link.openedAt
    ? link.sessionExpiresAt && link.sessionExpiresAt > at
      ? ("open" as const)
      : ("ended" as const)
    : link.expiresAt > at
      ? ("waiting" as const)
      : ("ended" as const)
  return { state, files: link.filesReceived }
}

/** The phone's sign-in secret, from its cookie. */
export function readPhoneCookie() {
  return getCookie(PHONE_COOKIE)
}

export function setPhoneCookie(session: string) {
  setCookie(PHONE_COOKIE, session, {
    httpOnly: true,
    maxAge: PHONE_SESSION_HOURS * 3600,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}
