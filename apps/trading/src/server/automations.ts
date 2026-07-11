import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  automationDraftSchema,
  automationDraftProtectionSchema,
  automationGraphSchema,
  automationStrategyConfigSchema,
  compileAutomationGraph,
  type AutomationGraph,
  type AutomationProtection,
  type AutomationStrategyConfig,
  type AutomationValidationError,
} from "@/lib/automations/automation"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"
import { db, type CustomShellDb } from "@/server/db"
import {
  tradingAutomations,
  type TradingAutomation,
  type TradingAutomationDraft,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

const nameSchema = z.string().trim().min(1).max(80)
const storedDraftSchema = automationGraphSchema.extend({
  protection: automationDraftProtectionSchema,
})

const EMPTY_GRAPH: AutomationGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}

export type InspectedAutomation = {
  graph: AutomationGraph
  protection: AutomationProtection
  compiledConfig: AutomationStrategyConfig | null
  errors: AutomationValidationError[]
}

export function inspectAutomation(row: TradingAutomation): InspectedAutomation {
  const parsedDraft = storedDraftSchema.safeParse(row.graph)
  if (!parsedDraft.success) {
    throw new Error("Automation draft could not be read")
  }
  const { protection, ...graph } = parsedDraft.data
  const compiled = compileAutomationGraph({
    interval: row.interval,
    graph,
    protection,
  })
  const storedConfig = automationStrategyConfigSchema.safeParse(
    row.compiledConfig
  )
  return {
    graph,
    protection,
    compiledConfig: storedConfig.success ? storedConfig.data : null,
    errors: compiled.errors,
  }
}

export async function listUserAutomations(
  userId: string,
  database: CustomShellDb = db
): Promise<TradingAutomation[]> {
  return database
    .select()
    .from(tradingAutomations)
    .where(eq(tradingAutomations.userId, userId))
    .orderBy(desc(tradingAutomations.updatedAt))
}

export async function getUserAutomation(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<TradingAutomation | null> {
  const [row] = await database
    .select()
    .from(tradingAutomations)
    .where(
      and(
        eq(tradingAutomations.id, automationId),
        eq(tradingAutomations.userId, userId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function createUserAutomation(
  userId: string,
  input: { name: string; interval: StrategyInterval },
  database: CustomShellDb = db
): Promise<TradingAutomation> {
  const createdAt = now()
  try {
    const [row] = await database
      .insert(tradingAutomations)
      .values({
        id: uuid(),
        userId,
        name: nameSchema.parse(input.name),
        interval: input.interval,
        graph: storedDraft(EMPTY_GRAPH, {}),
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

export async function saveUserAutomation(
  userId: string,
  automationId: string,
  input: {
    name: string
    interval: StrategyInterval
    graph: AutomationGraph
    protection: AutomationProtection
  },
  database: CustomShellDb = db
): Promise<TradingAutomation | null> {
  const name = nameSchema.parse(input.name)
  const draft = automationDraftSchema.parse({
    interval: input.interval,
    graph: input.graph,
    protection: input.protection,
  })
  const compiled = compileAutomationGraph(draft)
  const compiledConfig = compiled.config
    ? automationStrategyConfigSchema.parse(compiled.config)
    : null

  try {
    const [row] = await database
      .update(tradingAutomations)
      .set({
        name,
        interval: draft.interval,
        graph: storedDraft(draft.graph, draft.protection),
        compiledConfig,
        updatedAt: now(),
      })
      .where(
        and(
          eq(tradingAutomations.id, automationId),
          eq(tradingAutomations.userId, userId)
        )
      )
      .returning()
    return row ?? null
  } catch (error) {
    throwFriendlyUniqueNameError(error)
  }
}

export async function duplicateUserAutomation(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<TradingAutomation | null> {
  const source = await getUserAutomation(userId, automationId, database)
  if (!source) return null

  for (let copyNumber = 1; copyNumber <= 100; copyNumber += 1) {
    const createdAt = now()
    try {
      const [row] = await database
        .insert(tradingAutomations)
        .values({
          id: uuid(),
          userId,
          name: copyName(source.name, copyNumber),
          interval: source.interval,
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

export async function deleteUserAutomation(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const rows = await database
    .delete(tradingAutomations)
    .where(
      and(
        eq(tradingAutomations.id, automationId),
        eq(tradingAutomations.userId, userId)
      )
    )
    .returning({ id: tradingAutomations.id })
  return rows.length > 0
}

function storedDraft(
  graph: AutomationGraph,
  protection: AutomationProtection
): TradingAutomationDraft {
  return { ...graph, protection }
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
