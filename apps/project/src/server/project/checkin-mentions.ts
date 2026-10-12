import { and, eq, inArray } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { messageText, taggedUserIds } from "@/lib/project/mentions"
import { checkinMentionHeading, teamDayHref } from "@/lib/project/notices"
import { CHECKIN_NOTE_FIELDS, type CheckinNoteField, type CheckinNotes } from "@/lib/project/rules"
import type { ProjectDb } from "@/server/project/access"
import { writeAppNotices } from "@/server/project/notices"
import { projectCheckinMentions, projectTeamMembers } from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * @ tags in the check-in's three notes. A tag is saved in the note's words
 * in the chat's format, `@[Leo Park](<user id>)`, and in
 * `project_checkin_mentions` per note, so a note changed during the day tells
 * only the people newly tagged in it, the chat's rule. Anyone on the team can
 * be tagged, since everyone on the team reads the notes.
 */

type Tags = Record<CheckinNoteField, string[]>

/** Who each note tags. Refuses a tag of anyone who isn't on the team. */
export async function requireTeamTags(
  teamId: string,
  notes: CheckinNotes,
  database: ProjectDb
): Promise<Tags> {
  const tags = Object.fromEntries(
    CHECKIN_NOTE_FIELDS.map((field) => [field, notes[field] ? taggedUserIds(notes[field]) : []])
  ) as Tags
  const everyone = [...new Set(Object.values(tags).flat())]
  if (everyone.length === 0) return tags
  const onTeam = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(and(eq(projectTeamMembers.teamId, teamId), inArray(projectTeamMembers.userId, everyone)))
  if (onTeam.length !== everyone.length) throw new Error(PROJECT_ERRORS.tagNotOnTeam)
  return tags
}

/**
 * Saves who each note tags now, and tells each person newly tagged in a
 * note, once per note: "Leo mentioned you in their check-in". Tagging
 * yourself sends nothing. Pass the transaction the notes save in.
 */
export async function tellNewlyTagged(
  checkin: { id: string; userId: string; day: string },
  notes: CheckinNotes,
  tags: Tags,
  database: ProjectDb
) {
  const before = await database
    .select({ field: projectCheckinMentions.field, userId: projectCheckinMentions.userId })
    .from(projectCheckinMentions)
    .where(eq(projectCheckinMentions.checkinId, checkin.id))
  const had = new Set(before.map((row) => `${row.field}:${row.userId}`))
  await database.delete(projectCheckinMentions).where(eq(projectCheckinMentions.checkinId, checkin.id))
  const rows = CHECKIN_NOTE_FIELDS.flatMap((field) =>
    tags[field].map((userId) => ({ checkinId: checkin.id, field, userId }))
  )
  if (rows.length) await database.insert(projectCheckinMentions).values(rows)

  const fresh = rows.filter((row) => !had.has(`${row.field}:${row.userId}`) && row.userId !== checkin.userId)
  if (fresh.length === 0) return
  const [writer] = await database
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, checkin.userId))
  await writeAppNotices(
    database,
    fresh.map((row) => ({
      kind: "checkin_mention",
      recipientUserId: row.userId,
      actorUserId: checkin.userId,
      message: checkinMentionHeading(writer?.name ?? "Someone"),
      detail: messageText(notes[row.field] ?? ""),
      href: teamDayHref(checkin.day),
    }))
  )
}
