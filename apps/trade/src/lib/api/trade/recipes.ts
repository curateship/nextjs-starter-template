import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  automationGraphSchema,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/graph"
import type { RecipeCompiledConfig } from "@/lib/recipes/compile"
import { createErrorMessage } from "@/lib/api/error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  createWorkspaceRecipe,
  deleteWorkspaceRecipes,
  duplicateWorkspaceRecipe,
  getWorkspaceRecipe,
  inspectRecipe,
  listWorkspaceRecipes,
  renameWorkspaceRecipe,
  saveWorkspaceRecipe,
  type TradeRecipe,
} from "@/server/trade/recipes"
import {
  runWorkspaceRecipe,
  type RecipeRunOutcome,
} from "@/server/trade/recipes/run"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export type RecipeListItem = {
  id: string
  name: string
  summary: string
  isValid: boolean
  nodeCount: number
  updated_at: string
}

export type RecipeDetail = {
  id: string
  name: string
  graph: AutomationGraph
  compiledConfig: RecipeCompiledConfig | null
  errors: AutomationValidationError[]
  created_at: string
  updated_at: string
}

export type RecipesPage = { recipes: RecipeListItem[] }

export function toRecipeListItem(recipe: RecipeDetail): RecipeListItem {
  const nodeCount = recipe.graph.nodes.length
  const isValid = recipe.compiledConfig !== null && recipe.errors.length === 0
  return {
    id: recipe.id,
    name: recipe.name,
    summary: isValid
      ? `${nodeCount} ${nodeCount === 1 ? "step" : "steps"}`
      : nodeCount === 0
        ? "Empty draft"
        : "Needs attention",
    isValid,
    nodeCount,
    updated_at: recipe.updated_at,
  }
}

const nameSchema = z.string().trim().min(1).max(80)
const recipeIdSchema = z.object({
  recipeId: z.string().min(1).max(36),
})
const recipeIdsSchema = z.object({
  recipeIds: z.array(z.string().min(1).max(36)).min(1).max(200),
})
const saveSchema = recipeIdSchema.extend({
  name: nameSchema,
  graph: automationGraphSchema,
})
const renameSchema = recipeIdSchema.extend({ name: nameSchema })
const runSchema = recipeIdSchema.extend({ pressId: z.string().uuid() })

const recipeErrorMessages: Record<string, string> = {
  NOT_FOUND: "That recipe no longer exists.",
  NAME_REQUIRED: "Name the recipe first.",
  NAME_TAKEN: "A recipe with that name already exists.",
  COPY_LIMIT: "Could not find a free name for the copy.",
  RECIPE_RUNNING: "Stop this recipe's live run before deleting the recipe.",
}

export const getRecipeErrorMessage = createErrorMessage(
  recipeErrorMessages,
  "We could not save that change. Please try again."
)

export const getRecipeLoadErrorMessage = createErrorMessage(
  recipeErrorMessages,
  "We could not load your recipes. Please try again."
)

const loadRecipesPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<RecipesPage> => ({
    recipes: (
      await listWorkspaceRecipes(await workspaceIdForRequest(context.user.id))
    ).map((row) => ({
      id: row.id,
      name: row.name,
      summary: row.summary,
      isValid: row.isValid,
      nodeCount: row.nodeCount,
      updated_at: row.updatedAt.toISOString(),
    })),
  }))

const getRecipeFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(recipeIdSchema)
  .handler(async ({ data, context }): Promise<RecipeDetail> => {
    const row = await getWorkspaceRecipe(
      await workspaceIdForRequest(context.user.id),
      data.recipeId
    )
    if (!row) throw new Error("NOT_FOUND")
    return serializeRecipe(row)
  })

const createRecipeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: nameSchema }))
  .handler(async ({ data, context }): Promise<RecipeDetail> =>
    serializeRecipe(
      await createWorkspaceRecipe(
        await workspaceIdForRequest(context.user.id),
        context.user.id,
        data.name
      )
    )
  )

const saveRecipeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(saveSchema)
  .handler(async ({ data, context }): Promise<RecipeDetail> => {
    const row = await saveWorkspaceRecipe(
      await workspaceIdForRequest(context.user.id),
      { id: data.recipeId, name: data.name, graph: data.graph }
    )
    if (!row) throw new Error("NOT_FOUND")
    return serializeRecipe(row)
  })

const renameRecipeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(renameSchema)
  .handler(async ({ data, context }): Promise<RecipeDetail> => {
    const row = await renameWorkspaceRecipe(
      await workspaceIdForRequest(context.user.id),
      data.recipeId,
      data.name
    )
    if (!row) throw new Error("NOT_FOUND")
    return serializeRecipe(row)
  })

const duplicateRecipeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(recipeIdSchema)
  .handler(async ({ data, context }): Promise<RecipeDetail> => {
    const row = await duplicateWorkspaceRecipe(
      await workspaceIdForRequest(context.user.id),
      context.user.id,
      data.recipeId
    )
    if (!row) throw new Error("NOT_FOUND")
    return serializeRecipe(row)
  })

const deleteRecipesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(recipeIdsSchema)
  .handler(async ({ data, context }): Promise<{ count: number }> => ({
    count: await deleteWorkspaceRecipes(
      await workspaceIdForRequest(context.user.id),
      data.recipeIds
    ),
  }))

const runRecipeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(runSchema)
  .handler(async ({ data, context }): Promise<RecipeRunOutcome> =>
    runWorkspaceRecipe(context.user.id, {
      workspaceId: await workspaceIdForRequest(context.user.id),
      recipeId: data.recipeId,
      pressId: data.pressId,
      now: Date.now(),
    })
  )

export function loadRecipesPage() {
  return loadRecipesPageFn()
}

export function getRecipe(recipeId: string): Promise<RecipeDetail> {
  return getRecipeFn({ data: { recipeId } }) as Promise<RecipeDetail>
}

export function createRecipe(name: string) {
  return createRecipeFn({ data: { name } })
}

export function saveRecipe(input: {
  recipeId: string
  name: string
  graph: AutomationGraph
}) {
  return saveRecipeFn({ data: input })
}

export function renameRecipe(recipeId: string, name: string) {
  return renameRecipeFn({ data: { recipeId, name } })
}

export function duplicateRecipe(recipeId: string) {
  return duplicateRecipeFn({ data: { recipeId } })
}

export function deleteRecipes(recipeIds: string[]) {
  return deleteRecipesFn({ data: { recipeIds } })
}

export function runRecipe(recipeId: string, pressId: string) {
  return runRecipeFn({ data: { recipeId, pressId } })
}

function serializeRecipe(row: TradeRecipe): RecipeDetail {
  const inspected = inspectRecipe(row)
  return {
    id: row.id,
    name: row.name,
    graph: inspected.graph,
    compiledConfig: inspected.compiledConfig,
    errors: inspected.errors,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}
