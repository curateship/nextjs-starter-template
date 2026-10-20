import { eq } from "drizzle-orm"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { findCurrentUser } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { mediaIdsForScope } from "@/server/video/media-list"
import { findBrowserGuests } from "@/server/video/project-handoff"
import {
  videoProjects,
  videoRenderJobs,
  type VideoProjectGuestRow,
} from "@/server/video/schema"

/**
 * The door for the editor calls a guest sent from Project may make
 * (`workspace/docs/project-guests.md`). Everything else stays behind the
 * shell's `userGet`/`userPost`/`adminPost`, which a guest never passes
 * because a guest has no session.
 *
 * - `editorGet` and `editorPost` (in `editor-guards.ts`) let in a signed-in person, as `userGet` and
 *   `userPost` do, or a browser holding a guest sign-in. They hand the
 *   handler both on `context.caller`. `editorPost` also checks the request
 *   came from this app's own pages, as `userPost` does.
 * - The handler then asks `actorFor(caller, projectId)` who to act as. A
 *   guest sign-in for that project acts as the project's owner, which is
 *   what every owner check below it expects. Without one, the signed-in
 *   person acts as themselves, exactly as before. Anyone else is told the
 *   project isn't there.
 *
 * So a guest reaches the one project they were sent to and nothing else, and
 * everyone else's calls behave as they always did.
 */

export type EditorCaller = {
  user: Awaited<ReturnType<typeof findCurrentUser>>
  guests: VideoProjectGuestRow[]
}

async function readEditorCaller(): Promise<EditorCaller> {
  const [user, guests] = await Promise.all([findCurrentUser(), findBrowserGuests()])
  return { user, guests }
}

/** The caller `editorGet` and `editorPost` (editor-guards.ts) hand on. */
export async function findEditorCaller(): Promise<EditorCaller> {
  const caller = await readEditorCaller()
  if (!caller.user && caller.guests.length === 0) throw new Error("AUTH_REQUIRED")
  return caller
}

/** Who a call about one project acts as, and the guest behind it if there is one. */
export type EditorActor = {
  userId: string
  /** The guest sign-in for this project, or null for a signed-in person. */
  guest: VideoProjectGuestRow | null
}

export async function actorFor(
  caller: EditorCaller,
  projectId: string,
  database: CustomShellDb = db
): Promise<EditorActor> {
  const guest = caller.guests.find((held) => held.projectId === projectId)
  if (guest) {
    const [project] = await database
      .select({ userId: videoProjects.userId })
      .from(videoProjects)
      .where(eq(videoProjects.id, projectId))
      .limit(1)
    if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
    return { userId: project.userId, guest }
  }
  if (caller.user) return { userId: caller.user.id, guest: null }
  throw new Error(PROJECT_NOT_FOUND_MESSAGE)
}

/** The signed-in person, for a call that names no project. A guest is refused. */
export function signedInActor(caller: EditorCaller): EditorActor {
  if (!caller.user) throw new Error("AUTH_REQUIRED")
  return { userId: caller.user.id, guest: null }
}

/** As `actorFor`, for a call that names an export rather than its project. */
export async function actorForExport(
  caller: EditorCaller,
  exportId: string,
  database: CustomShellDb = db
): Promise<EditorActor> {
  if (caller.guests.length > 0) {
    const [job] = await database
      .select({ projectId: videoRenderJobs.projectId })
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, exportId))
      .limit(1)
    if (job?.projectId) return actorFor(caller, job.projectId, database)
  }
  if (caller.user) return { userId: caller.user.id, guest: null }
  throw new Error(PROJECT_NOT_FOUND_MESSAGE)
}

/**
 * Whose media a file address may be answered for: the owner of a guest's
 * project when the media is in it (linked to it, or a clip on its timeline),
 * otherwise the signed-in person. Null for nobody. For the filmstrip and
 * waveform addresses, which are plain routes rather than server functions.
 */
export async function mediaViewerId(mediaId: string, database: CustomShellDb = db): Promise<string | null> {
  const caller = await readEditorCaller()
  for (const guest of caller.guests) {
    if (await projectHoldsMedia(guest.projectId, mediaId, database)) {
      return (await actorFor(caller, guest.projectId, database)).userId
    }
  }
  return caller.user?.id ?? null
}

/** As `mediaViewerId`, for an export's file and cover addresses. */
export async function exportViewerId(exportId: string, database: CustomShellDb = db): Promise<string | null> {
  const caller = await readEditorCaller()
  if (!caller.user && caller.guests.length === 0) return null
  return (await actorForExport(caller, exportId, database).catch(() => null))?.userId ?? null
}

/**
 * The files a project holds: linked to it, or used by a clip on its timeline.
 * The same list its own media panel shows (`mediaIdsForScope`). Empty for a
 * project that is gone.
 */
export async function projectMediaIds(projectId: string, database: CustomShellDb = db): Promise<Set<string>> {
  const [project] = await database
    .select({ userId: videoProjects.userId })
    .from(videoProjects)
    .where(eq(videoProjects.id, projectId))
    .limit(1)
  if (!project) return new Set()
  return new Set(await mediaIdsForScope(project.userId, { type: "project", id: projectId }, database))
}

/** The media is linked to the project, or a clip on its timeline uses it. */
export async function projectHoldsMedia(projectId: string, mediaId: string, database: CustomShellDb = db) {
  return (await projectMediaIds(projectId, database)).has(mediaId)
}

/** As `actorFor`, for a call that names one media file rather than its project. */
export async function actorForMedia(
  caller: EditorCaller,
  mediaId: string,
  database: CustomShellDb = db
): Promise<EditorActor> {
  for (const guest of caller.guests) {
    if (await projectHoldsMedia(guest.projectId, mediaId, database)) return actorFor(caller, guest.projectId, database)
  }
  if (caller.user) return { userId: caller.user.id, guest: null }
  throw new Error(PROJECT_NOT_FOUND_MESSAGE)
}

/** The words a guest's changes are marked with in the project's history. */
export function guestEditorName(guest: VideoProjectGuestRow | null) {
  return guest ? `${guest.personName} via Project` : null
}
