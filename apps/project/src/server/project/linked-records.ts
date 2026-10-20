import { createHmac } from "node:crypto"

import { eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LINKED_APPS, isLinkedApp, type LinkedApp } from "@/lib/project/linked-records"
import { createSecretToken } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { projectTasks } from "@/server/project/schema"

/**
 * A task that points at one record in Video or Promo, and the stamped note
 * that sends its person there signed in. Tyler's design of 15 Oct 2026, with
 * his answers of 19 Oct 2026, is in `workspace/docs/connected-apps.md`:
 *
 * - The task keeps the pasted address, and Project reads the app and the
 *   record from it by matching it against the app addresses in the server
 *   settings. Only the site admin sets it.
 * - Pressing the button checks the person (the assignee or the site admin),
 *   then stamps a note with the key Project shares with that app. The note
 *   lasts 60 seconds and works once; the other app checks it.
 * - Project never calls the other app. The browser carries the note there.
 */

/** How long a note works for, in seconds. */
export const NOTE_SECONDS = 60

/** Where each app's handoff address is, under its own address. */
const HANDOFF_PATH = "/handoff/project"

/** The page in each app whose address names one record. */
const RECORD_PATHS: Record<LinkedApp, RegExp> = {
  video: /^\/admin\/video-editor\/([A-Za-z0-9-]{1,64})\/?$/,
  promo: /^\/admin\/projects\/([A-Za-z0-9-]{1,64})\/?$/,
}

type AppSettings = { origin: string; key: string }

/**
 * Each connected app's address and the key Project shares with it, from the
 * server settings. An app with either missing isn't connected.
 */
export function connectedApp(app: LinkedApp, env: NodeJS.ProcessEnv = process.env): AppSettings | null {
  const name = app.toUpperCase()
  const address = env[`CONNECTED_${name}_URL`]?.trim()
  const key = env[`CONNECTED_${name}_KEY`]?.trim()
  if (!address || !key) return null
  try {
    const url = new URL(address)
    // Only a web address has an origin to send the browser to.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return { origin: url.origin, key }
  } catch {
    return null
  }
}

/**
 * Which app and record a pasted address is, or a refusal in words. Anything
 * not on a connected app's own address is refused.
 */
export function readLinkedAddress(
  address: string,
  env: NodeJS.ProcessEnv = process.env
): { app: LinkedApp; recordId: string } {
  let url: URL
  try {
    url = new URL(address.trim())
  } catch {
    throw new Error(PROJECT_ERRORS.linkedAddressUnknown)
  }
  for (const app of LINKED_APPS) {
    const settings = connectedApp(app, env)
    if (!settings || settings.origin !== url.origin) continue
    const match = RECORD_PATHS[app].exec(url.pathname)
    if (match) return { app, recordId: match[1] }
  }
  throw new Error(PROJECT_ERRORS.linkedAddressUnknown)
}

/** Points the task at the record in a pasted address, or at nothing when it's empty. */
export async function setTaskLink(
  user: { id: string },
  input: { taskId: string; address: string },
  database: ProjectDb = db,
  env: NodeJS.ProcessEnv = process.env
) {
  const { membership, task } = await requireTaskAccess(user.id, input.taskId, database)
  if (!membership.siteAdmin) throw new Error(PROJECT_ERRORS.notRunningTeam)
  const address = input.address.trim()
  const link = address ? { ...readLinkedAddress(address, env), address } : null
  await database
    .update(projectTasks)
    .set({
      linkedApp: link?.app ?? null,
      linkedRecordId: link?.recordId ?? null,
      linkedAddress: link?.address ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projectTasks.id, task.id))
}

/** What a task shows about its record. The address itself goes to the site admin only. */
export type TaskLink = {
  app: LinkedApp
  /** The pasted address, for the site admin's settings field; null for everyone else. */
  address: string | null
  /** This person may press the button. */
  canOpen: boolean
  /** The app is connected on this server, so the button can work. */
  connected: boolean
}

export function taskLinkFor(
  task: { linkedApp: string | null; linkedAddress: string | null; assigneeUserId: string | null },
  viewer: { userId: string; siteAdmin: boolean },
  env: NodeJS.ProcessEnv = process.env
): TaskLink | null {
  if (!isLinkedApp(task.linkedApp) || !task.linkedAddress) return null
  return {
    app: task.linkedApp,
    address: viewer.siteAdmin ? task.linkedAddress : null,
    canOpen: viewer.siteAdmin || task.assigneeUserId === viewer.userId,
    connected: Boolean(connectedApp(task.linkedApp, env)),
  }
}

/** What Project tells the other app about the person, stamped so it can't be changed. */
export type HandoffNote = {
  v: 1
  app: LinkedApp
  record: string
  /** The Project person's id, name and email. */
  sub: string
  name: string
  email: string
  /** A random one-time id the other app keeps, so the note works once. */
  jti: string
  /** Seconds since 1970 when the note stops working. */
  exp: number
}

/** The note as text, then its HMAC stamp, both in URL-safe base64. */
export function stampNote(note: HandoffNote, key: string) {
  const body = Buffer.from(JSON.stringify(note)).toString("base64url")
  const stamp = createHmac("sha256", key).update(body).digest("base64url")
  return `${body}.${stamp}`
}

/**
 * The address that signs this person in to the task's record, made only when
 * they may press the button. Someone else gets a refusal and no note.
 */
export async function openLinkedRecord(
  user: { id: string; name: string; email: string },
  taskId: string,
  database: ProjectDb = db,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
): Promise<{ url: string }> {
  const { membership, task } = await requireTaskAccess(user.id, taskId, database)
  if (!isLinkedApp(task.linkedApp) || !task.linkedRecordId) throw new Error(PROJECT_ERRORS.noLinkedRecord)
  if (!membership.siteAdmin && task.assigneeUserId !== user.id) {
    throw new Error(PROJECT_ERRORS.linkedOpenNotAllowed)
  }
  const settings = connectedApp(task.linkedApp, env)
  if (!settings) throw new Error(PROJECT_ERRORS.linkedAppNotSetUp)
  const note = stampNote(
    {
      v: 1,
      app: task.linkedApp,
      record: task.linkedRecordId,
      sub: user.id,
      name: user.name,
      email: user.email,
      jti: createSecretToken(),
      exp: Math.floor(now / 1000) + NOTE_SECONDS,
    },
    settings.key
  )
  return { url: `${settings.origin}${HANDOFF_PATH}?note=${encodeURIComponent(note)}` }
}
