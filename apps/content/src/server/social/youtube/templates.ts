import { and, asc, eq, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  TEMPLATE_NAME_MAX,
  TEMPLATE_SECTION_KINDS,
  TEMPLATE_SECTION_NAME_MAX,
  TEMPLATE_SECTION_TEXT_MAX,
  TEMPLATE_SECTIONS_MAX,
  type TemplateSection,
} from "@/lib/social/youtube/options"

import { ownedProject } from "../projects"
import { promoYoutubeTemplates } from "./schema"

/**
 * Description templates (YouTube task, part 6). Tyler, 26 Nov 2026: "I want
 * to have discription templates so we can use similiar structure every time
 * for certain video". A template is one project's own ("Inside each
 * project"), and is a named list of sections in order, each "Fixed words" or
 * "AI writes it" ("A list of sections"). Write in New post fills the AI
 * sections and copies the fixed ones word for word.
 *
 * Deleting a template never changes a description already written with it:
 * an upload keeps its own words, and its `template_id` turns null.
 */

export type YoutubeTemplateRow = { id: string; name: string; sections: TemplateSection[]; position: number }

/** A section list as it may be stored: trimmed, within its limits, none empty. */
export function cleanSections(sections: TemplateSection[]): TemplateSection[] {
  if (sections.length > TEMPLATE_SECTIONS_MAX) throw new Refusal(`A template holds at most ${TEMPLATE_SECTIONS_MAX} sections.`)
  return sections.map((section, index) => {
    const name = section.name.replace(/\s+/g, " ").trim()
    const text = section.text.replace(/\r\n/g, "\n").trim()
    if (!name) throw new Refusal(`Section ${index + 1} needs a name.`)
    if (name.length > TEMPLATE_SECTION_NAME_MAX) throw new Refusal(`Section ${index + 1}'s name is longer than ${TEMPLATE_SECTION_NAME_MAX} characters.`)
    if (!(TEMPLATE_SECTION_KINDS as readonly string[]).includes(section.kind)) throw new Refusal(`Section ${index + 1} is neither fixed words nor written by the AI.`)
    if (text.length > TEMPLATE_SECTION_TEXT_MAX) throw new Refusal(`Section ${index + 1}'s words are longer than ${TEMPLATE_SECTION_TEXT_MAX.toLocaleString("en-US")} characters.`)
    if (section.kind === "fixed" && !text) throw new Refusal(`Section ${index + 1} is fixed words, so it needs its words.`)
    return { name, kind: section.kind, text }
  })
}

function cleanName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim()
  if (!clean) throw new Refusal("Give the template a name.")
  if (clean.length > TEMPLATE_NAME_MAX) throw new Refusal(`A template's name is at most ${TEMPLATE_NAME_MAX} characters.`)
  return clean
}

/** One project's templates, in their order. */
export async function listYoutubeTemplates(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<YoutubeTemplateRow[]> {
  return db
    .select({ id: promoYoutubeTemplates.id, name: promoYoutubeTemplates.name, sections: promoYoutubeTemplates.sections, position: promoYoutubeTemplates.position })
    .from(promoYoutubeTemplates)
    .where(and(eq(promoYoutubeTemplates.userId, userId), eq(promoYoutubeTemplates.projectId, projectId)))
    .orderBy(asc(promoYoutubeTemplates.position), asc(promoYoutubeTemplates.createdAt))
}

/** A new template at the end of the project's list, with the sections given. */
export async function createYoutubeTemplate(
  userId: string,
  input: { projectId: string; name: string; sections: TemplateSection[] },
  db: CustomShellDb = defaultDb
): Promise<YoutubeTemplateRow> {
  await ownedProject(userId, input.projectId, db)
  const name = cleanName(input.name)
  const sections = cleanSections(input.sections)
  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${promoYoutubeTemplates.position}), -1)::int` })
    .from(promoYoutubeTemplates)
    .where(eq(promoYoutubeTemplates.projectId, input.projectId))
  const row = { id: uuid(), userId, projectId: input.projectId, name, sections, position: (last?.position ?? -1) + 1 }
  await db.insert(promoYoutubeTemplates).values(row)
  return { id: row.id, name, sections, position: row.position }
}

/** A template's name or sections, saved as they are typed. Only the fields given change. */
export async function updateYoutubeTemplate(
  userId: string,
  input: { id: string; name?: string; sections?: TemplateSection[] },
  db: CustomShellDb = defaultDb
): Promise<YoutubeTemplateRow> {
  const set: Partial<typeof promoYoutubeTemplates.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) set.name = cleanName(input.name)
  if (input.sections !== undefined) set.sections = cleanSections(input.sections)
  const [row] = await db
    .update(promoYoutubeTemplates)
    .set(set)
    .where(and(eq(promoYoutubeTemplates.id, input.id), eq(promoYoutubeTemplates.userId, userId)))
    .returning({ id: promoYoutubeTemplates.id, name: promoYoutubeTemplates.name, sections: promoYoutubeTemplates.sections, position: promoYoutubeTemplates.position })
  if (!row) throw new Refusal("That template is not there any more.")
  return row
}

/** The project's templates in a new order, the ids given first to last. An id that is not the project's is refused. */
export async function arrangeYoutubeTemplates(
  userId: string,
  input: { projectId: string; ids: string[] },
  db: CustomShellDb = defaultDb
): Promise<void> {
  const known = await listYoutubeTemplates(userId, input.projectId, db)
  const ids = new Set(known.map((row) => row.id))
  if (input.ids.length !== known.length || input.ids.some((id) => !ids.has(id))) {
    throw new Refusal("The templates changed meanwhile. Reload the page and move them again.")
  }
  await db.transaction(async (tx) => {
    for (const [position, id] of input.ids.entries()) {
      await tx
        .update(promoYoutubeTemplates)
        .set({ position })
        .where(and(eq(promoYoutubeTemplates.id, id), eq(promoYoutubeTemplates.userId, userId)))
    }
  })
}

/** Deletes a template. Uploads written with it keep their words. */
export async function deleteYoutubeTemplate(userId: string, id: string, db: CustomShellDb = defaultDb): Promise<void> {
  const gone = await db
    .delete(promoYoutubeTemplates)
    .where(and(eq(promoYoutubeTemplates.id, id), eq(promoYoutubeTemplates.userId, userId)))
    .returning({ id: promoYoutubeTemplates.id })
  if (!gone.length) throw new Refusal("That template is not there any more.")
}
