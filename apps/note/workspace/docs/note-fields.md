# Note fields

Each note folder works like a Notion database: it has its own fields, and
every note in it fills them in. A "Books" folder might have Author, Rating,
Status and Finished; a "Meetings" folder Date and People.

## Tyler's rules, 18 Oct 2026

- Fields live on folders. "Each folder has its own."
- Field types on day one: text, number, tick box, choice (pick one),
  multi-choice (pick many), date, and link, email and phone.
- A folder inside another folder has its own fields only. It inherits nothing.
- A note can sit outside every folder, with no fields. Moving it into a folder
  gives it that folder's fields.
- Moving a note to another folder drops the fields the new folder doesn't have,
  with a warning first that names them.
- A field with the same name and type in both folders keeps its value when a
  note moves. A choice value is kept only when the new folder's field has an
  option of the same name. ("Yes, keep it")
- AI fill shows the price first, then a suggested value beside each empty
  field, each with a tick to keep it.
- Defaults he agreed to: a field's type can't change once any note has a value
  in it; AI fill only ever picks a choice field's own options.

## The Fields window

The cog on a folder, then Fields. Every change saves at once, so the window
ends with one Done.

- **Add a field** with a name and a type. A choice or multi-choice field gets
  options, each with a name and one of eight colours. A date field gets the
  "Remind me" switch (`note-reminders.md`).
- **A folder holds up to 30 fields**, and a choice up to 50 options. Two
  fields in one folder cannot share a name, and two options in one field
  cannot either, capitals and spaces ignored.
- **The cog on a field** renames it, changes its options or its reminder, or
  changes its type. Renaming always works and keeps every value, because values
  are stored under the field's key, which is fixed when the field is made
  (`makeFieldKey` in `src/lib/note/notes/fields.ts`).
- **Changing the type is refused once any note holds a value** in the field:
  "Some notes already have a value in this field. Make a new field instead."
- **Taking an option away** clears it from every note that had it, in the same
  save.
- **The bin on a field** asks first and says how many notes hold a value in it.
  Deleting the field deletes those values and the field's reminders.
- **The grip** sets the order notes show the fields in.

## On a note

- **One row per field** under the title, in a grey Fields card, with the right
  control for its type: a box to type in, a tick box, a dropdown of coloured
  options, a multi-pick, a calendar with an optional time.
- **Every change saves by itself.** A tick, a pick or a date at once; typed text
  700ms after the last key and at once on leaving the box; a number only when
  the box is left, so "1," on its way to "1,250" is never refused half typed.
- **A value that does not fit is refused** with the reason in the error toast
  ("That is not a number", "A link starts with https:// or http://") and stays
  in the box, marked, so nothing typed is lost.
- **A link, email or phone value** has a button beside it that opens it.
- **Field changes never count as a revision**, so changing a field cannot
  collide with the text being typed in the same note (`note-editor.md`).

## What a value may be

`parseFieldValue` in `src/lib/note/notes/fields.ts` is the one check, used by
the screen and the server alike. Empty always means cleared.

- **Text**: up to 2,000 characters, trimmed.
- **Number**: any number up to a quadrillion either way; commas are allowed
  while typing.
- **Tick box**: ticked, or no value.
- **Choice**: one of the field's own options. **Multi-choice**: any of them,
  kept in the field's order.
- **Date**: a real day, `2026-10-20`, or a day and time, `2026-10-20T14:30`.
- **Link**: an `https://` or `http://` address. **Email**: something@something.
  **Phone**: digits, spaces, +, - and brackets.

## Moving a note

- **The move window asks the server first** which filled fields have nowhere to
  go, and names them: "Author and Rating will be removed". A move that loses
  nothing goes at once. `carryFieldValues` decides what comes across.
- **Moving to Loose notes** removes every value, because a loose note has no
  fields.

## Suggest fields (the AI)

- **The button sits at the foot of the Fields card**, with the price above it:
  "Suggesting costs under 1¢ with Gemini 3.8 Flash." The price is worked out in
  the browser from the note's length and the number of empty fields
  (`src/lib/note/notes/suggest-price.ts`), from the shell's one price list.
- **One Gemini call** reads the title, the text (the first 40,000 characters)
  and the empty fields' names, types and options, through `runAiCall`, so the
  shell's AI meter and the monthly allowance hold (`src/server/note/notes/suggest.ts`).
- **Each empty field then shows a suggestion** with a tick to keep it and a cross
  to drop it. Keeping one saves it the same way as a value typed by hand.
  Nothing is saved before a tick.
- **Choices only get the field's own options.** A suggestion that does not fit
  its field is dropped without a word, since the person never asked for that one
  value. If nothing fits, the toast says the AI suggested nothing this time.
- **Without a Gemini key** it says "Save a Gemini key in Settings → AI first".
  A used-up allowance says so in the shell's own words.

## The video link

- **The Video card** links a note to one of the person's saved videos, picked
  from a search of their own videos. The card then shows the video's cover,
  title and summary, read from the video each time the note opens, so a new
  analysis shows here too.
- **Deleting the video** empties the link and the card says the video was
  deleted. The note keeps the video's title (`video_title`) only to say that.
- **"Make a note" on a video** (Videos screen, foot of the right panel) asks
  which notes folder, then makes a note titled with the video's title: the
  summary as bullets, the action plan as a checklist with the same ticks, the
  quotes as quote blocks, linked back to the video. It is a copy; analysing the
  video again changes nothing in it.

## Templates

- **Templates belong to a folder** (Tyler, 18 Oct 2026). The cog on a folder,
  then Templates, lists them: make one from scratch, change one (its name, the
  title new notes start with, its field values and its text), drag to reorder,
  delete.
- **Save as template** in a note's menu copies that note's title, values and
  text into a new template in its folder.
- **New note in a folder with templates** offers Blank and each template.

## Markdown

- **Download as Markdown** (a note's menu) writes the fields between `---`
  lines at the top, one `Name: value` a line, then the text. Checklists become
  `- [ ]`, tables Markdown tables, toggles and callouts quotes, links to other
  notes `[[Title]]`. Colours are left out.
- **Import Markdown** (a folder's menu) takes one or more `.md` files. Header
  lines are matched by name to the folder's fields, choices by option name.
  Anything that matches no field or does not fit is listed afterwards, file by
  file, never dropped silently. A `title:` line names the note; without one the
  file's name does.
- Both are `src/lib/note/notes/markdown.ts`, built on Tiptap's own Markdown
  reader and writer and the same block list the editor uses.
