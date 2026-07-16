import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  automationGraphSchema,
  compileAutomationGraph,
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/automation"
import {
  compiledConfigSchema,
  type CompiledConfig,
} from "@/lib/automations/compiled-config"
import { db, type CustomShellDb } from "@/server/db"
import {
  newsletterAutomations,
  type NewsletterAutomation,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export const AUTOMATION_STATUSES = ["draft", "active", "paused"] as const
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]

const nameSchema = z.string().trim().min(1).max(80)

export const ACTIVE_SAVE_REJECTED_MESSAGE =
  "This automation is active. Fix the validation errors or pause it before saving."
export const ACTIVATE_REJECTED_MESSAGE =
  "This automation has validation errors and cannot be activated."

export type InspectedAutomation = {
  graph: AutomationGraph
  status: AutomationStatus
  compiledConfig: CompiledConfig | null
  errors: AutomationValidationError[]
}

export type AutomationListRow = {
  id: string
  name: string
  status: AutomationStatus
  summary: string
  isValid: boolean
  updatedAt: Date
}

function rowStatus(row: NewsletterAutomation): AutomationStatus {
  return AUTOMATION_STATUSES.includes(row.status as AutomationStatus)
    ? (row.status as AutomationStatus)
    : "draft"
}

export function inspectAutomation(
  row: NewsletterAutomation
): InspectedAutomation {
  const parsedGraph = automationGraphSchema.safeParse(row.graph)
  if (!parsedGraph.success) {
    throw new Error("Automation draft could not be read")
  }
  const graph = parsedGraph.data
  const compiled = compileAutomationGraph(graph)
  const storedConfig = compiledConfigSchema.safeParse(row.compiledConfig)
  return {
    graph,
    status: rowStatus(row),
    compiledConfig: storedConfig.success ? storedConfig.data : null,
    errors: compiled.errors,
  }
}

export function automationSummary(inspected: InspectedAutomation): string {
  if (inspected.compiledConfig !== null && inspected.errors.length === 0) {
    // Steps the run walks after the trigger fires.
    const steps = Object.keys(inspected.compiledConfig.nodes).length - 1
    return `${steps} step${steps === 1 ? "" : "s"} after the trigger`
  }
  return inspected.graph.nodes.length === 0 ? "Empty draft" : "Needs attention"
}

export async function listWorkspaceAutomations(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<AutomationListRow[]> {
  const rows = await database
    .select()
    .from(newsletterAutomations)
    .where(eq(newsletterAutomations.workspaceId, workspaceId))
    .orderBy(desc(newsletterAutomations.updatedAt))

  return rows.map((row) => {
    const inspected = inspectAutomation(row)
    return {
      id: row.id,
      name: row.name,
      status: inspected.status,
      summary: automationSummary(inspected),
      isValid:
        inspected.compiledConfig !== null && inspected.errors.length === 0,
      updatedAt: row.updatedAt,
    }
  })
}

export async function getWorkspaceAutomation(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<NewsletterAutomation | null> {
  const [row] = await database
    .select()
    .from(newsletterAutomations)
    .where(
      and(
        eq(newsletterAutomations.id, automationId),
        eq(newsletterAutomations.workspaceId, workspaceId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function createWorkspaceAutomation(
  workspaceId: string,
  input: { name: string },
  database: CustomShellDb = db
): Promise<NewsletterAutomation> {
  const createdAt = now()
  try {
    const [row] = await database
      .insert(newsletterAutomations)
      .values({
        id: uuid(),
        workspaceId,
        name: nameSchema.parse(input.name),
        status: "draft",
        graph: EMPTY_AUTOMATION_GRAPH,
        compiledConfig: null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    if (!row) throw new Error("Automation was not created")
    return row
  } catch (error) {
    throwFriendlyUniqueNameError(error)
  }
}

export async function saveWorkspaceAutomation(
  workspaceId: string,
  input: { id: string; name: string; graph: AutomationGraph },
  database: CustomShellDb = db
): Promise<NewsletterAutomation | null> {
  const name = nameSchema.parse(input.name)
  const graph = automationGraphSchema.parse(input.graph)
  const compiled = compileAutomationGraph(graph)

  const existing = await getWorkspaceAutomation(workspaceId, input.id, database)
  if (!existing) return null
  // An active automation must never carry a broken config: reject the save
  // instead of silently nulling out what the run engine enrolls from.
  if (rowStatus(existing) === "active" && compiled.config === null) {
    throw new Error(ACTIVE_SAVE_REJECTED_MESSAGE)
  }

  try {
    const [row] = await database
      .update(newsletterAutomations)
      .set({
        name,
        graph,
        compiledConfig: compiled.config,
        updatedAt: now(),
      })
      .where(
        and(
          eq(newsletterAutomations.id, input.id),
          eq(newsletterAutomations.workspaceId, workspaceId)
        )
      )
      .returning()
    return row ?? null
  } catch (error) {
    throwFriendlyUniqueNameError(error)
  }
}

export async function setWorkspaceAutomationStatus(
  workspaceId: string,
  input: { id: string; status: AutomationStatus },
  database: CustomShellDb = db
): Promise<NewsletterAutomation | null> {
  const existing = await getWorkspaceAutomation(workspaceId, input.id, database)
  if (!existing) return null

  if (input.status === "active") {
    // Activation recompiles from the stored graph — the compiled config the
    // engine will enroll from must be provably current and valid.
    const inspected = inspectAutomation(existing)
    const compiled = compileAutomationGraph(inspected.graph)
    if (compiled.config === null) {
      throw new Error(ACTIVATE_REJECTED_MESSAGE)
    }
    const [row] = await database
      .update(newsletterAutomations)
      .set({
        status: "active",
        compiledConfig: compiled.config,
        updatedAt: now(),
      })
      .where(
        and(
          eq(newsletterAutomations.id, input.id),
          eq(newsletterAutomations.workspaceId, workspaceId)
        )
      )
      .returning()
    return row ?? null
  }

  const [row] = await database
    .update(newsletterAutomations)
    .set({ status: input.status, updatedAt: now() })
    .where(
      and(
        eq(newsletterAutomations.id, input.id),
        eq(newsletterAutomations.workspaceId, workspaceId)
      )
    )
    .returning()
  return row ?? null
}

export async function duplicateWorkspaceAutomation(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<NewsletterAutomation | null> {
  const source = await getWorkspaceAutomation(
    workspaceId,
    automationId,
    database
  )
  if (!source) return null

  for (let copyNumber = 1; copyNumber <= 100; copyNumber += 1) {
    const createdAt = now()
    try {
      const [row] = await database
        .insert(newsletterAutomations)
        .values({
          id: uuid(),
          workspaceId,
          name: copyName(source.name, copyNumber),
          // Copies never inherit "active": enrolling contacts twice by
          // duplicating would surprise everyone.
          status: "draft",
          graph: source.graph,
          compiledConfig: source.compiledConfig,
          createdAt,
          updatedAt: createdAt,
        })
        .returning()
      if (!row) throw new Error("Automation was not duplicated")
      return row
    } catch (error) {
      if (isUniqueViolation(error)) continue
      throw error
    }
  }
  throw new Error("Could not create a unique Automation copy")
}

export async function deleteWorkspaceAutomation(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const rows = await database
    .delete(newsletterAutomations)
    .where(
      and(
        eq(newsletterAutomations.id, automationId),
        eq(newsletterAutomations.workspaceId, workspaceId)
      )
    )
    .returning({ id: newsletterAutomations.id })
  return rows.length > 0
}

function copyName(sourceName: string, copyNumber: number): string {
  const suffix = copyNumber === 1 ? " copy" : ` copy ${copyNumber}`
  return `${sourceName.slice(0, 80 - suffix.length).trimEnd()}${suffix}`
}

function throwFriendlyUniqueNameError(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new Error("Automation name already exists")
  }
  throw error
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true
    }
    current =
      typeof current === "object"
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return false
}
