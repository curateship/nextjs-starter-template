import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { AI_MODEL_PRICES } from "@/lib/ai/ai-models"
import { missingScriptParts } from "@/lib/viral/analysis"
import {
  FORMAT_IDEA_MAX,
  FORMAT_NAME_MAX,
  FORMAT_SCRIPT_FEATURE,
  partsName,
  type FormatPart,
  type FormatScript,
  type ViralFormat,
} from "@/lib/viral/formats"
import { SEGMENT_ROLES, segmentRoleLabels } from "@/lib/viral/viral-breakdown"
import { viralSays } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { viralFormats, viralFormatScripts, viralProjects, type ViralFormatRow } from "@/server/viral/schema"
import { askWriter, WRITER_MODEL } from "@/server/viral/writer"

/**
 * Saved formats and the scripts written from them (`workspace/docs/library.md`,
 * task part 18). A format is the person's own: saved from any analysis, and
 * used to write a script for any of their projects without a source video.
 */

function toFormat(row: ViralFormatRow): ViralFormat {
  return {
    id: row.id,
    name: row.name,
    parts: row.parts,
    sourceTitle: row.sourceTitle,
    sample: row.isSample,
    createdAt: row.createdAt.toISOString(),
  }
}

async function requireOwnedFormat(ownerId: string, formatId: string): Promise<ViralFormatRow> {
  const [row] = await db
    .select()
    .from(viralFormats)
    .where(and(eq(viralFormats.id, formatId), eq(viralFormats.ownerId, ownerId)))
  if (!row) throw viralSays("That format is gone.")
  return row
}

export async function listFormats(ownerId: string): Promise<ViralFormat[]> {
  const rows = await db
    .select()
    .from(viralFormats)
    .where(eq(viralFormats.ownerId, ownerId))
    .orderBy(desc(viralFormats.createdAt))
  return rows.map(toFormat)
}

/** Save format on an analysis. A format with no name is named by its parts. */
export async function saveFormat(
  ownerId: string,
  input: { name: string; parts: FormatPart[]; sourceTitle: string | null }
): Promise<ViralFormat> {
  if (!input.parts.length) throw viralSays("This analysis has no script parts to keep as a format.")
  const at = now()
  const [row] = await db
    .insert(viralFormats)
    .values({
      id: uuid(),
      ownerId,
      name: input.name.trim().slice(0, FORMAT_NAME_MAX) || partsName(input.parts),
      parts: input.parts,
      sourceTitle: input.sourceTitle?.trim() || null,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return toFormat(row)
}

export async function renameFormat(ownerId: string, formatId: string, name: string): Promise<ViralFormat> {
  const format = await requireOwnedFormat(ownerId, formatId)
  const cleaned = name.trim().slice(0, FORMAT_NAME_MAX)
  if (!cleaned) throw viralSays("Give the format a name.")
  const [row] = await db
    .update(viralFormats)
    .set({ name: cleaned, updatedAt: now() })
    .where(eq(viralFormats.id, format.id))
    .returning()
  return toFormat(row)
}

/** Deletes a format and every script written from it. */
export async function deleteFormat(ownerId: string, formatId: string): Promise<void> {
  const format = await requireOwnedFormat(ownerId, formatId)
  await db.delete(viralFormats).where(eq(viralFormats.id, format.id))
}

/** Every script written from one format, newest first. */
export async function listFormatScripts(ownerId: string, formatId: string): Promise<FormatScript[]> {
  await requireOwnedFormat(ownerId, formatId)
  const rows = await db
    .select()
    .from(viralFormatScripts)
    .where(and(eq(viralFormatScripts.formatId, formatId), eq(viralFormatScripts.ownerId, ownerId)))
    .orderBy(desc(viralFormatScripts.createdAt))
  const projectIds = [...new Set(rows.flatMap((row) => (row.projectId ? [row.projectId] : [])))]
  const names = new Map(
    (projectIds.length
      ? await db.select({ id: viralProjects.id, name: viralProjects.name }).from(viralProjects).where(inArray(viralProjects.id, projectIds))
      : []
    ).map((row) => [row.id, row.name])
  )
  return rows.map((row) => ({
    id: row.id,
    formatId: row.formatId,
    projectId: row.projectId,
    projectName: row.projectId ? (names.get(row.projectId) ?? null) : null,
    idea: row.idea,
    script: row.script,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * What one script from a format costs, roughly, before it runs. The question
 * is about 1,200 tokens and the script about 800, so it rounds up to 1 cent.
 */
export function formatScriptPriceCents(): number {
  const price = AI_MODEL_PRICES[WRITER_MODEL]
  const cents = ((1_200 / 1_000_000) * price.inputPerMillion + (800 / 1_000_000) * price.outputPerMillion) * 100
  return Math.max(1, Math.ceil(cents))
}

const roleEnum = z.enum(SEGMENT_ROLES).catch("other")
const scriptSchema = z.object({
  script: z
    .array(z.object({ role: roleEnum, seconds: z.number().finite().min(0).max(3_600), words: z.string().min(1).max(4_000) }))
    .min(1)
    .max(30),
})

function formatPrompt(parts: FormatPart[], topic: string, idea: string) {
  const shape = parts
    .map((part) => `- ${part.role} (about ${part.seconds}s)${part.summary ? `: ${part.summary}` : ""}`)
    .join("\n")
  return `Write a script for a short social video in this exact structure. Each part does what it says and runs about as long as it says.

The structure, in order:
${shape}

The creator's subject, in their words: """${topic}"""
The idea for this video, in their words: """${idea}"""

Answer with JSON only, in exactly this shape, and nothing else:
{ "script": [{ "role": "hook", "seconds": 3, "words": "what is said and shown" }] }
The script must have exactly these parts, in this order: ${parts.map((part) => part.role).join(", ")}.`
}

/**
 * Write a script on Library → Formats: one Gemini call for an idea line,
 * written for the project's topic in the format's structure. A script that
 * leaves out a part of the format is refused, as Analyse refuses one.
 */
export async function writeFromFormat(
  ownerId: string,
  input: { formatId: string; projectId: string; idea: string }
): Promise<FormatScript> {
  const format = await requireOwnedFormat(ownerId, input.formatId)
  const project = await requireOwnedViralProject(ownerId, input.projectId)
  if (project.isSample) throw viralSays("This is a sample project, so nothing is written for it. Pick one of your own projects.")
  const idea = input.idea.trim().replace(/\s+/g, " ").slice(0, FORMAT_IDEA_MAX)
  if (!idea) throw viralSays("Say what this video is about first.")
  const topic = project.topic.trim()
  if (!topic) throw viralSays(`"${project.name}" has no topic yet. Set Your topic in its ⋮ first, so the script is written for it.`)
  await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, formatScriptPriceCents())

  const answer = await askWriter({
    userId: ownerId,
    feature: FORMAT_SCRIPT_FEATURE,
    metadata: { formatId: format.id, ...viralProjectSpendMetadata(project.id) },
    prompt: formatPrompt(format.parts, topic, idea),
    schema: scriptSchema,
    label: "The script",
  })
  const missing = missingScriptParts(
    format.parts.map((part) => part.role),
    answer.script
  )
  if (missing.length) {
    throw viralSays(
      `The script came back missing ${missing.map((role) => `"${segmentRoleLabels[role]}"`).join(" and ")}, so it isn't in this format. Press Write again.`
    )
  }
  const script = answer.script.map((part) => ({ ...part, seconds: Math.round(part.seconds) }))
  const at = now()
  const [row] = await db
    .insert(viralFormatScripts)
    .values({ id: uuid(), ownerId, formatId: format.id, projectId: project.id, idea, script, createdAt: at })
    .returning()
  return {
    id: row.id,
    formatId: row.formatId,
    projectId: project.id,
    projectName: project.name,
    idea: row.idea,
    script: row.script,
    createdAt: row.createdAt.toISOString(),
  }
}
