import { and, desc, eq, inArray } from "drizzle-orm"

import {
  automationCompiledConfigSchema,
  compileAutomationGraph,
  type AutomationCompiledConfig,
} from "@/lib/automations/compile"
import {
  automationGraphSchema,
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/graph"
import {
  automationKindIsTrigger,
  automationNodeName,
} from "@/lib/automations/node-registry"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellNotifications,
  type CustomShellAutomation,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import { plural } from "@/lib/format/plural"

const NAME_MAX_LENGTH = 80

export type InspectedAutomation = {
  graph: AutomationGraph
  compiledConfig: AutomationCompiledConfig | null
  errors: AutomationValidationError[]
  /** False when the stored draft could not be read at all. */
  readable: boolean
}

export type AutomationListRow = {
  id: string
  name: string
  summary: string
  isValid: boolean
  nodeCount: number
  enabled: boolean
  /** What the flow reacts to, in the palette's own words. Null when nothing. */
  triggerName: string | null
  updatedAt: Date
}

/**
 * Reads a stored row without ever throwing. A row whose graph cannot be parsed
 * (hand-edited data, a bug in an older writer) must not take down the list or
 * the editor: it degrades to an empty draft carrying one honest error, and the
 * next save overwrites the unreadable data.
 */
export function inspectAutomation(
  row: CustomShellAutomation
): InspectedAutomation {
  const parsedGraph = automationGraphSchema.safeParse(row.graph)
  if (!parsedGraph.success) {
    return {
      graph: EMPTY_AUTOMATION_GRAPH,
      compiledConfig: null,
      errors: [
        {
          code: "invalid_settings",
          message:
            "This automation's saved data could not be read. Editing it starts from an empty canvas; saving will overwrite the unreadable data.",
        },
      ],
      readable: false,
    }
  }
  const graph = parsedGraph.data
  const compiled = compileAutomationGraph(graph)
  const storedConfig = automationCompiledConfigSchema.safeParse(
    row.compiledConfig
  )
  return {
    graph,
    compiledConfig: storedConfig.success ? storedConfig.data : null,
    errors: compiled.errors,
    readable: true,
  }
}

export function automationSummary(inspected: InspectedAutomation): string {
  if (!inspected.readable) return "Unreadable — needs attention"
  if (inspected.compiledConfig !== null && inspected.errors.length === 0) {
    const steps = Object.keys(inspected.compiledConfig.nodes).length
    return `${steps} ${plural(steps, "step", "steps")}`
  }
  return inspected.graph.nodes.length === 0 ? "Empty draft" : "Needs attention"
}

/**
 * The step this flow starts from when something happens, named the way the
 * canvas names it — or null when the flow only ever runs because somebody
 * pressed Run.
 *
 * Read from the draft rather than the compiled copy, and that is the point: a
 * flow still being drawn has no compiled copy, and the list saying "runs by
 * hand" about a flow with a trigger sitting on it would simply be wrong. What
 * actually *fires* is read from the compiled copy — see `listFlowsWatching` —
 * so a half-finished flow describes itself here without being able to run.
 *
 * Null for two triggers as well as none: the compiler refuses that flow, so
 * there is no honest single answer to give.
 */
export function automationTriggerName(
  inspected: InspectedAutomation
): string | null {
  const triggers = inspected.graph.nodes.filter((node) =>
    automationKindIsTrigger(node.kind)
  )
  return triggers.length === 1
    ? automationNodeName(triggers[0])
    : null
}

export async function listUserAutomations(
  userId: string,
  database: CustomShellDb = db
): Promise<AutomationListRow[]> {
  const rows = await database
    .select()
    .from(customShellAutomations)
    .where(eq(customShellAutomations.userId, userId))
    .orderBy(desc(customShellAutomations.updatedAt))

  return rows.map((row) => {
    const inspected = inspectAutomation(row)
    return {
      id: row.id,
      name: row.name,
      summary: automationSummary(inspected),
      isValid:
        inspected.compiledConfig !== null && inspected.errors.length === 0,
      nodeCount: inspected.graph.nodes.length,
      enabled: row.enabled,
      triggerName: automationTriggerName(inspected),
      updatedAt: row.updatedAt,
    }
  })
}

/**
 * Switches a flow's trigger on or off.
 *
 * Two things are refused rather than quietly allowed, because both would leave
 * a switch reading "on" over a flow that can never fire: a draft with errors in
 * it has no compiled copy for a trigger to be read from, and a flow with no
 * trigger step has nothing to react to. Switching *off* is never refused —
 * getting out is always allowed, whatever state the flow is in.
 *
 * Nothing is caught up on the way back on. A payment that failed while the
 * switch was off is not chased when it goes back on; only what happens next is.
 */
export async function setAutomationEnabled(
  userId: string,
  automationId: string,
  enabled: boolean,
  database: CustomShellDb = db
): Promise<CustomShellAutomation> {
  const row = await getUserAutomation(userId, automationId, database)
  if (!row) throw new Error("NOT_FOUND")

  if (enabled) {
    const inspected = inspectAutomation(row)
    if (!inspected.compiledConfig || inspected.errors.length > 0) {
      throw new Error("NOT_RUNNABLE")
    }
    if (!automationTriggerName(inspected)) throw new Error("NO_TRIGGER")
  }

  const [updated] = await database
    .update(customShellAutomations)
    .set({ enabled, updatedAt: now() })
    .where(
      and(
        eq(customShellAutomations.id, automationId),
        eq(customShellAutomations.userId, userId)
      )
    )
    .returning()
  if (!updated) throw new Error("NOT_FOUND")
  return updated
}

export async function getUserAutomation(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomation | null> {
  const [row] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, automationId),
        eq(customShellAutomations.userId, userId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function createUserAutomation(
  userId: string,
  name: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomation> {
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH)
  if (!trimmed) throw new Error("NAME_REQUIRED")

  const createdAt = now()
  try {
    const [row] = await database
      .insert(customShellAutomations)
      .values({
        id: uuid(),
        userId,
        name: trimmed,
        graph: EMPTY_AUTOMATION_GRAPH,
        compiledConfig: null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
    if (!row) throw new Error("NOT_FOUND")
    return row
  } catch (error) {
    throw asNameTaken(error)
  }
}

export async function saveUserAutomation(
  userId: string,
  input: { id: string; name: string; graph: AutomationGraph },
  database: CustomShellDb = db
): Promise<CustomShellAutomation | null> {
  const trimmed = input.name.trim().slice(0, NAME_MAX_LENGTH)
  if (!trimmed) throw new Error("NAME_REQUIRED")
  const graph = automationGraphSchema.parse(input.graph)
  // Compile on every save: only a fresh, server-verified compile may write
  // compiled_config, and an invalid draft stores null there — never a stale
  // or client-supplied config.
  const compiled = compileAutomationGraph(graph)

  try {
    const [row] = await database
      .update(customShellAutomations)
      .set({
        name: trimmed,
        graph,
        compiledConfig: compiled.config,
        updatedAt: now(),
      })
      .where(
        and(
          eq(customShellAutomations.id, input.id),
          eq(customShellAutomations.userId, userId)
        )
      )
      .returning()
    return row ?? null
  } catch (error) {
    throw asNameTaken(error)
  }
}

export async function duplicateUserAutomation(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomation | null> {
  const source = await getUserAutomation(userId, automationId, database)
  if (!source) return null

  for (let copyNumber = 1; copyNumber <= 100; copyNumber += 1) {
    const createdAt = now()
    try {
      const [row] = await database
        .insert(customShellAutomations)
        .values({
          id: uuid(),
          userId,
          name: copyName(source.name, copyNumber),
          graph: source.graph,
          compiledConfig: source.compiledConfig,
          createdAt,
          updatedAt: createdAt,
        })
        .returning()
      if (!row) throw new Error("NOT_FOUND")
      return row
    } catch (error) {
      if (isUniqueViolation(error)) continue
      throw error
    }
  }
  throw new Error("COPY_LIMIT")
}

/** Deletes only the rows this person owns; ids belonging to others are ignored. */
export async function deleteUserAutomations(
  userId: string,
  automationIds: string[],
  database: CustomShellDb = db
): Promise<number> {
  return database.transaction(async (tx) => {
    const owned = await tx
      .select({ id: customShellAutomations.id })
      .from(customShellAutomations)
      .where(
        and(
          inArray(customShellAutomations.id, automationIds),
          eq(customShellAutomations.userId, userId)
        )
      )

    const ownedIds = owned.map((row) => row.id)
    if (!ownedIds.length) return 0

    const runIds = tx
      .select({ id: customShellAutomationRuns.id })
      .from(customShellAutomationRuns)
      .where(inArray(customShellAutomationRuns.automationId, ownedIds))

    await tx
      .delete(customShellNotifications)
      .where(inArray(customShellNotifications.automationRunId, runIds))

    const rows = await tx
      .delete(customShellAutomations)
      .where(inArray(customShellAutomations.id, ownedIds))
      .returning({ id: customShellAutomations.id })

    return rows.length
  })
}

function copyName(sourceName: string, copyNumber: number): string {
  const suffix = copyNumber === 1 ? " copy" : ` copy ${copyNumber}`
  return `${sourceName.slice(0, NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`
}

function asNameTaken(error: unknown): unknown {
  return isUniqueViolation(error) ? new Error("NAME_TAKEN") : error
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
