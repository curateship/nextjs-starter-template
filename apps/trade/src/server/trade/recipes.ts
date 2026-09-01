import { and, desc, eq, inArray } from "drizzle-orm"

import {
  automationGraphSchema,
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/graph"
import {
  compileRecipeGraph,
  recipeCompiledConfigSchema,
  type RecipeCompiledConfig,
} from "@/lib/recipes/compile"
import { plural } from "@/lib/format/plural"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { tradeFlowRuns, tradeRecipes } from "@/server/trade/schema"

const NAME_MAX_LENGTH = 80

export type TradeRecipe = typeof tradeRecipes.$inferSelect

export type InspectedRecipe = {
  graph: AutomationGraph
  compiledConfig: RecipeCompiledConfig | null
  errors: AutomationValidationError[]
  readable: boolean
}

export type RecipeListRow = {
  id: string
  name: string
  summary: string
  isValid: boolean
  nodeCount: number
  updatedAt: Date
}

export function inspectRecipe(row: TradeRecipe): InspectedRecipe {
  const parsedGraph = automationGraphSchema.safeParse(row.graph)
  if (!parsedGraph.success) {
    return {
      graph: EMPTY_AUTOMATION_GRAPH,
      compiledConfig: null,
      errors: [
        {
          code: "invalid_settings",
          message:
            "This recipe's saved data could not be read. Editing starts from an empty canvas; saving will overwrite the unreadable data.",
        },
      ],
      readable: false,
    }
  }

  const graph = parsedGraph.data
  const compiled = compileRecipeGraph(graph)
  const storedConfig = recipeCompiledConfigSchema.safeParse(row.compiledConfig)
  return {
    graph,
    compiledConfig: storedConfig.success ? storedConfig.data : null,
    errors: compiled.errors,
    readable: true,
  }
}

function recipeSummary(inspected: InspectedRecipe): string {
  if (!inspected.readable) return "Unreadable, needs attention"
  if (inspected.compiledConfig && inspected.errors.length === 0) {
    const steps = Object.keys(inspected.compiledConfig.nodes).length
    return `${steps} ${plural(steps, "step", "steps")}`
  }
  return inspected.graph.nodes.length === 0 ? "Empty draft" : "Needs attention"
}

export async function listWorkspaceRecipes(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<RecipeListRow[]> {
  const rows = await database
    .select()
    .from(tradeRecipes)
    .where(eq(tradeRecipes.workspaceId, workspaceId))
    .orderBy(desc(tradeRecipes.updatedAt))

  return rows.map((row) => {
    const inspected = inspectRecipe(row)
    return {
      id: row.id,
      name: row.name,
      summary: recipeSummary(inspected),
      isValid:
        Boolean(inspected.compiledConfig) && inspected.errors.length === 0,
      nodeCount: inspected.graph.nodes.length,
      updatedAt: row.updatedAt,
    }
  })
}

export async function getWorkspaceRecipe(
  workspaceId: string,
  recipeId: string,
  database: CustomShellDb = db
): Promise<TradeRecipe | null> {
  const [row] = await database
    .select()
    .from(tradeRecipes)
    .where(
      and(
        eq(tradeRecipes.id, recipeId),
        eq(tradeRecipes.workspaceId, workspaceId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function createWorkspaceRecipe(
  workspaceId: string,
  userId: string,
  name: string,
  database: CustomShellDb = db,
  sourceGraph: AutomationGraph = EMPTY_AUTOMATION_GRAPH
): Promise<TradeRecipe> {
  const trimmed = recipeName(name)
  const graph = automationGraphSchema.parse(sourceGraph)
  const compiled = compileRecipeGraph(graph)
  const createdAt = now()

  try {
    const [row] = await database
      .insert(tradeRecipes)
      .values({
        id: uuid(),
        workspaceId,
        userId,
        name: trimmed,
        graph,
        compiledConfig: compiled.config,
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

export async function saveWorkspaceRecipe(
  workspaceId: string,
  input: { id: string; name: string; graph: AutomationGraph },
  database: CustomShellDb = db
): Promise<TradeRecipe | null> {
  const name = recipeName(input.name)
  const graph = automationGraphSchema.parse(input.graph)
  const compiled = compileRecipeGraph(graph)

  try {
    const [row] = await database
      .update(tradeRecipes)
      .set({
        name,
        graph,
        compiledConfig: compiled.config,
        updatedAt: now(),
      })
      .where(
        and(
          eq(tradeRecipes.id, input.id),
          eq(tradeRecipes.workspaceId, workspaceId)
        )
      )
      .returning()
    return row ?? null
  } catch (error) {
    throw asNameTaken(error)
  }
}

export async function renameWorkspaceRecipe(
  workspaceId: string,
  recipeId: string,
  name: string,
  database: CustomShellDb = db
): Promise<TradeRecipe | null> {
  try {
    const [row] = await database
      .update(tradeRecipes)
      .set({ name: recipeName(name), updatedAt: now() })
      .where(
        and(
          eq(tradeRecipes.id, recipeId),
          eq(tradeRecipes.workspaceId, workspaceId)
        )
      )
      .returning()
    return row ?? null
  } catch (error) {
    throw asNameTaken(error)
  }
}

export async function duplicateWorkspaceRecipe(
  workspaceId: string,
  userId: string,
  recipeId: string,
  database: CustomShellDb = db
): Promise<TradeRecipe | null> {
  const source = await getWorkspaceRecipe(workspaceId, recipeId, database)
  if (!source) return null
  const graph = automationGraphSchema.parse(source.graph)
  const compiled = compileRecipeGraph(graph)

  for (let copyNumber = 1; copyNumber <= 100; copyNumber += 1) {
    const createdAt = now()
    try {
      const [row] = await database
        .insert(tradeRecipes)
        .values({
          id: uuid(),
          workspaceId,
          userId,
          name: copyName(source.name, copyNumber),
          graph,
          compiledConfig: compiled.config,
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

export async function deleteWorkspaceRecipes(
  workspaceId: string,
  recipeIds: string[],
  database: CustomShellDb = db
): Promise<number> {
  return database.transaction(async (tx) => {
    const owned = await tx
      .select({ id: tradeRecipes.id })
      .from(tradeRecipes)
      .where(
        and(
          inArray(tradeRecipes.id, recipeIds),
          eq(tradeRecipes.workspaceId, workspaceId)
        )
      )
      .for("update")
    const ownedIds = owned.map((row) => row.id)
    if (ownedIds.length === 0) return 0

    const [live] = await tx
      .select({ id: tradeFlowRuns.id })
      .from(tradeFlowRuns)
      .where(
        and(
          inArray(tradeFlowRuns.automationId, ownedIds),
          inArray(tradeFlowRuns.status, ["running", "stopping"])
        )
      )
      .limit(1)
    if (live) throw new Error("RECIPE_RUNNING")

    const deleted = await tx
      .delete(tradeRecipes)
      .where(inArray(tradeRecipes.id, ownedIds))
      .returning({ id: tradeRecipes.id })
    return deleted.length
  })
}

function recipeName(name: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH)
  if (!trimmed) throw new Error("NAME_REQUIRED")
  return trimmed
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
