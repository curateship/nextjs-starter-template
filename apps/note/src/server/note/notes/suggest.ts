import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { runAiCall } from "@/server/ai/usage"
import { db } from "@/server/db"
import { generateJson, requireGeminiKey } from "@/server/note/gemini"
import { folderFields } from "@/server/note/notes/fields"
import { noteNotes } from "@/server/note/schema"
import { DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"
import {
  hasValue,
  NOTE_FIELD_TYPE_LABELS,
  parseFieldValue,
  sameName,
  type NoteField,
  type NoteFieldValues,
} from "@/lib/note/notes/fields"
import { noteTitle, NOTES_SAY } from "@/lib/note/notes/notes"
import { SUGGEST_TEXT_MAX } from "@/lib/note/notes/suggest-price"

/**
 * "Suggest fields": Gemini reads a note and offers a value for each empty
 * field. Nothing is saved here. The screen shows each suggestion beside its
 * field with a tick to keep it (Tyler, 18 Oct 2026), and a kept one saves
 * through the same door as a value typed by hand.
 *
 * A choice only ever gets one of the field's own options (the default Tyler
 * agreed on 18 Oct 2026), and a suggestion that does not fit its field is
 * dropped without a word, since the person never asked for that one value.
 * One call, metered on the shell's AI meter like Analyse.
 */

const MODEL = DEFAULT_AI_MODEL.gemini

const answerSchema = z.object({
  fields: z
    .array(
      z.object({
        name: z.string().max(100),
        value: z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(100)).max(50)]).nullable(),
      })
    )
    .max(60),
})

function describeField(field: NoteField) {
  const kind = NOTE_FIELD_TYPE_LABELS[field.type]
  switch (field.type) {
    case "select":
      return `- "${field.name}" (${kind}): exactly one of ${JSON.stringify(field.options.map((o) => o.label))}`
    case "multi_select":
      return `- "${field.name}" (${kind}): a list of any of ${JSON.stringify(field.options.map((o) => o.label))}`
    case "date":
      return `- "${field.name}" (${kind}): "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM" when a time is clear`
    case "number":
      return `- "${field.name}" (${kind}): a number`
    case "checkbox":
      return `- "${field.name}" (${kind}): true or false`
    case "url":
      return `- "${field.name}" (${kind}): a full https:// address found in the note`
    case "email":
      return `- "${field.name}" (${kind}): an email address found in the note`
    case "phone":
      return `- "${field.name}" (${kind}): a phone number found in the note`
    default:
      return `- "${field.name}" (${kind}): short text`
  }
}

function suggestPrompt(note: { title: string; text: string }, fields: NoteField[]) {
  return `You fill in fields for a personal note. Read the note and suggest a value for each field below.

Rules:
- Only use what the note says or clearly implies. If the note does not say, give null.
- Never invent a choice that is not in the list given for that field.
- Answer as JSON: {"fields": [{"name": "<field name exactly as given>", "value": <value or null>}]}

Fields:
${fields.map(describeField).join("\n")}

Note title: ${noteTitle(note.title)}
Note:
${note.text.slice(0, SUGGEST_TEXT_MAX)}`
}

/** An answer turned into values that fit their fields; anything else is dropped. */
export function readSuggestions(fields: NoteField[], answer: z.infer<typeof answerSchema>): NoteFieldValues {
  const out: NoteFieldValues = {}
  for (const item of answer.fields) {
    const field = fields.find((each) => sameName(each.name, item.name))
    if (!field || item.value === null) continue
    let raw: unknown
    if (field.type === "select") {
      raw = field.options.find((option) => sameName(option.label, String(item.value)))?.id
    } else if (field.type === "multi_select") {
      const labels = Array.isArray(item.value) ? item.value : String(item.value).split(",")
      raw = labels
        .map((label) => field.options.find((option) => sameName(option.label, label))?.id)
        .filter(Boolean)
    } else if (field.type === "checkbox") {
      raw = item.value === true || item.value === "true"
    } else if (field.type === "number") {
      raw = item.value
    } else {
      raw = Array.isArray(item.value) ? item.value.join(", ") : String(item.value)
    }
    if (raw === undefined) continue
    const parsed = parseFieldValue(field, raw)
    if (parsed.ok && parsed.value !== null && hasValue(parsed.value)) out[field.key] = parsed.value
  }
  return out
}

export async function suggestFields(ownerId: string, noteId: string): Promise<{ suggestions: NoteFieldValues }> {
  const [note] = await db
    .select()
    .from(noteNotes)
    .where(and(eq(noteNotes.id, noteId), eq(noteNotes.ownerId, ownerId)))
  if (!note) throw new Error(NOTES_SAY.noteNotFound)
  if (note.deletedAt) throw new Error(NOTES_SAY.inTrash)
  const empty = (await folderFields(note.folderId)).filter((field) => !hasValue(note.fieldValues[field.key]))
  if (!empty.length) throw new Error(NOTES_SAY.noEmptyFields)

  const apiKey = await requireGeminiKey()
  const label = "Suggesting fields"
  const answer = await runAiCall(
    {
      userId: ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_suggest_fields",
      metadata: { noteId },
    },
    async () => {
      const result = await generateJson({
        apiKey,
        model: MODEL,
        parts: [{ text: suggestPrompt({ title: note.title, text: note.bodyText }, empty) }],
        schema: answerSchema,
        label,
      })
      return {
        result: result.value,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    }
  )
  const suggestions = readSuggestions(empty, answer)
  if (!Object.keys(suggestions).length) throw new Error(NOTES_SAY.aiNoAnswer)
  return { suggestions }
}
