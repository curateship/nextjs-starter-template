# Note reminders

A date field can ring the bell on its day. Tyler, 18 Oct 2026: a date reminder
rings the bell only, no email.

## How it works

- **A date field has a "Remind me" switch** in the folder's Fields window. With
  it on, every note in the folder with a date in that field gets a reminder.
- **It rings at 9:00 on the day, in the person's own time zone**, or at the
  date's own time when it has one (the default Tyler agreed on 18 Oct 2026).
  The time zone comes from the browser that saved the date, because the server
  cannot know where somebody is (`reminderDueAt` in
  `src/server/note/notes/reminders.ts`).
- **A date already past when it is saved rings nothing.** A reminder for
  yesterday is noise.
- **Changing the date moves the reminder; clearing it removes it.** So do
  switching Remind me off, deleting the field, and moving the note to a folder
  that has no such field.
- **A note in Trash rings nothing**, and its reminder is dropped when it comes
  due. An archived note still rings.

## The notice

- **The `note-notes` worker** checks for due reminders on the shell's 15-second
  background pass (`src/server/note/notes/jobs.ts`). Each one is marked sent
  before the notice goes, so a crash half way never rings the same one twice.
- **The bell notice reads "Reminder: <note title>, <field name>"** with the date
  under it. It is the shell's `app_activity` kind, which each person can switch
  off in Settings → Notifications, like the video notices.
- **Clicking it opens `/notes?open=<id>`** with that note. Which note a notice
  is about is kept in `note_notice_links` beside it, which since migration 0098
  holds either a video or a note, never both.
