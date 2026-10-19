import { and, eq, isNull, lte } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import type { Db } from "@/server/note/notes/db-types"
import { tellOwner } from "@/server/note/notices"
import { noteNoteFields, noteNoteReminders, noteNotes } from "@/server/note/schema"
import { formatNoteDate, isNoteDate, type NoteField, type NoteFieldValues } from "@/lib/note/notes/fields"
import { noteTitle } from "@/lib/note/notes/notes"

/**
 * Date reminders. A date field with "Remind me" on rings the bell on the day
 * at 9:00 in the person's own time zone, or at the date's own time when it
 * has one (the default Tyler agreed on 18 Oct 2026). The bell only, no email.
 *
 * The time zone comes from the browser that saved the date, because the
 * server cannot know where somebody is. A date already past when it is saved
 * rings nothing: a reminder for yesterday is noise.
 */

const DEFAULT_HOUR = 9

/** Whether the browser's time zone name is one this server knows. */
export function cleanTimeZone(timeZone: string | undefined) {
  if (!timeZone) return "UTC"
  try {
    new Intl.DateTimeFormat("en", { timeZone })
    return timeZone
  } catch {
    return "UTC"
  }
}

/** How far ahead of UTC a time zone is at one instant, in milliseconds. */
function zoneOffset(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(at / 1000) * 1000
}

/** The instant a reminder for this date value rings, in this time zone. */
export function reminderDueAt(value: string, timeZone: string): Date | null {
  if (!isNoteDate(value)) return null
  const [day, time] = value.split("T")
  const [y, m, d] = day.split("-").map(Number)
  const [hh, mm] = time ? time.split(":").map(Number) : [DEFAULT_HOUR, 0]
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // The offset at the wall time is close; checking it again at the result
  // settles the hour either side of a clock change.
  let at = wall - zoneOffset(wall, timeZone)
  const again = zoneOffset(at, timeZone)
  if (wall - again !== at) at = wall - again
  return new Date(at)
}

/**
 * Brings one note's reminders in line with its values: one row per date
 * field with Remind me on and a date in the future, none for anything else.
 * A row whose time did not change keeps whether it was already sent.
 */
export async function syncNoteReminders(
  tx: Db,
  note: { id: string; values: NoteFieldValues },
  fields: NoteField[],
  timeZone: string
) {
  const existing = await tx
    .select()
    .from(noteNoteReminders)
    .where(eq(noteNoteReminders.noteId, note.id))
  const wanted = new Map<string, Date>()
  const at = now()
  for (const field of fields) {
    if (field.type !== "date" || !field.remind) continue
    const value = note.values[field.key]
    if (typeof value !== "string") continue
    const due = reminderDueAt(value, cleanTimeZone(timeZone))
    if (due && due.getTime() > at.getTime()) wanted.set(field.key, due)
  }
  for (const row of existing) {
    const due = wanted.get(row.fieldKey)
    if (!due) {
      await tx.delete(noteNoteReminders).where(eq(noteNoteReminders.id, row.id))
    } else if (due.getTime() !== row.dueAt.getTime()) {
      await tx
        .update(noteNoteReminders)
        .set({ dueAt: due, sentAt: null })
        .where(eq(noteNoteReminders.id, row.id))
    }
    wanted.delete(row.fieldKey)
  }
  for (const [fieldKey, dueAt] of wanted) {
    await tx.insert(noteNoteReminders).values({ id: uuid(), noteId: note.id, fieldKey, dueAt, createdAt: at })
  }
}

/**
 * Rings every reminder that has come due, one bell notice each, and marks it
 * sent first so a crash half way never rings the same one twice. A note in
 * Trash rings nothing and its reminder is dropped.
 */
export async function sendDueReminders(limit = 50) {
  const due = await db
    .select({
      id: noteNoteReminders.id,
      noteId: noteNoteReminders.noteId,
      fieldKey: noteNoteReminders.fieldKey,
      ownerId: noteNotes.ownerId,
      title: noteNotes.title,
      deletedAt: noteNotes.deletedAt,
      folderId: noteNotes.folderId,
      values: noteNotes.fieldValues,
    })
    .from(noteNoteReminders)
    .innerJoin(noteNotes, eq(noteNotes.id, noteNoteReminders.noteId))
    .where(and(isNull(noteNoteReminders.sentAt), lte(noteNoteReminders.dueAt, now())))
    .orderBy(noteNoteReminders.dueAt)
    .limit(limit)

  let sent = 0
  for (const reminder of due) {
    if (reminder.deletedAt) {
      await db.delete(noteNoteReminders).where(eq(noteNoteReminders.id, reminder.id))
      continue
    }
    const claimed = await db
      .update(noteNoteReminders)
      .set({ sentAt: now() })
      .where(and(eq(noteNoteReminders.id, reminder.id), isNull(noteNoteReminders.sentAt)))
      .returning({ id: noteNoteReminders.id })
    if (!claimed.length) continue
    const [field] = reminder.folderId
      ? await db
          .select({ name: noteNoteFields.name })
          .from(noteNoteFields)
          .where(and(eq(noteNoteFields.folderId, reminder.folderId), eq(noteNoteFields.key, reminder.fieldKey)))
      : []
    const value = reminder.values[reminder.fieldKey]
    await tellOwner({
      ownerId: reminder.ownerId,
      noteId: reminder.noteId,
      message: `Reminder: ${noteTitle(reminder.title)}, ${field?.name ?? "date"}`,
      detail: typeof value === "string" ? formatNoteDate(value) : null,
    })
    sent += 1
  }
  // `full` says the batch was as big as allowed, so more may be waiting.
  return { sent, full: due.length === limit }
}
