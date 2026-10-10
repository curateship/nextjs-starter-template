import { and, eq } from "drizzle-orm"

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  automationGraphSchema,
  type AutomationGraph,
} from "@/lib/automations/graph"
import { automationNodeName } from "@/lib/automations/node-registry"
import {
  AUTOMATION_TEMPLATES,
  automationTemplate,
  type AutomationTemplateKey,
} from "@/lib/automations/templates"
import { sanitizeAutomationEmailBlocks } from "@/server/automations/flows"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAutomationTemplateOverrides } from "@/server/schema"

export type UserAutomationTemplate = {
  key: AutomationTemplateKey
  name: string
  description: string
  graph: AutomationGraph
  steps: string[]
  isCustomized: boolean
  isValid: boolean
  updatedAt: Date | null
}

function templateView(
  key: AutomationTemplateKey,
  override?: typeof customShellAutomationTemplateOverrides.$inferSelect
): UserAutomationTemplate {
  const builtIn = automationTemplate(key)
  const graph = automationGraphSchema.parse(override?.graph ?? builtIn.graph)
  const compiled = compileAutomationGraph(graph)
  return {
    key,
    name: override?.name ?? builtIn.name,
    description: override?.description ?? builtIn.description,
    graph,
    steps: graph.nodes.map(automationNodeName),
    isCustomized: Boolean(override),
    isValid: compiled.config !== null && compiled.errors.length === 0,
    updatedAt: override?.updatedAt ?? null,
  }
}

export async function listUserAutomationTemplates(
  userId: string,
  database: CustomShellDb = db
): Promise<UserAutomationTemplate[]> {
  const rows = await database
    .select()
    .from(customShellAutomationTemplateOverrides)
    .where(eq(customShellAutomationTemplateOverrides.userId, userId))
  const byKey = new Map(rows.map((row) => [row.templateKey, row]))

  return AUTOMATION_TEMPLATES.map((template) =>
    templateView(template.key, byKey.get(template.key))
  )
}

export async function getUserAutomationTemplate(
  userId: string,
  key: AutomationTemplateKey,
  database: CustomShellDb = db
): Promise<UserAutomationTemplate> {
  const [row] = await database
    .select()
    .from(customShellAutomationTemplateOverrides)
    .where(
      and(
        eq(customShellAutomationTemplateOverrides.userId, userId),
        eq(customShellAutomationTemplateOverrides.templateKey, key)
      )
    )
    .limit(1)
  return templateView(key, row)
}

export async function saveUserAutomationTemplateDetails(
  userId: string,
  input: {
    key: AutomationTemplateKey
    name: string
    description: string
  },
  database: CustomShellDb = db
): Promise<UserAutomationTemplate> {
  const name = input.name.trim().slice(0, 80)
  const description = input.description.trim().slice(0, 300)
  if (!name) throw new Error("NAME_REQUIRED")
  if (!description) throw new Error("DESCRIPTION_REQUIRED")
  const builtIn = automationTemplate(input.key)
  const timestamp = now()

  await database
    .insert(customShellAutomationTemplateOverrides)
    .values({
      id: uuid(),
      userId,
      templateKey: input.key,
      name,
      description,
      graph: builtIn.graph,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        customShellAutomationTemplateOverrides.userId,
        customShellAutomationTemplateOverrides.templateKey,
      ],
      set: { name, description, updatedAt: timestamp },
    })

  return getUserAutomationTemplate(userId, input.key, database)
}

export async function saveUserAutomationTemplateGraph(
  userId: string,
  key: AutomationTemplateKey,
  sourceGraph: AutomationGraph,
  database: CustomShellDb = db
): Promise<UserAutomationTemplate> {
  const builtIn = automationTemplate(key)
  const graph = sanitizeAutomationEmailBlocks(
    automationGraphSchema.parse(sourceGraph)
  )
  const timestamp = now()

  await database
    .insert(customShellAutomationTemplateOverrides)
    .values({
      id: uuid(),
      userId,
      templateKey: key,
      name: builtIn.name,
      description: builtIn.description,
      graph,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        customShellAutomationTemplateOverrides.userId,
        customShellAutomationTemplateOverrides.templateKey,
      ],
      set: { graph, updatedAt: timestamp },
    })

  return getUserAutomationTemplate(userId, key, database)
}

export async function resetUserAutomationTemplate(
  userId: string,
  key: AutomationTemplateKey,
  database: CustomShellDb = db
): Promise<UserAutomationTemplate> {
  await database
    .delete(customShellAutomationTemplateOverrides)
    .where(
      and(
        eq(customShellAutomationTemplateOverrides.userId, userId),
        eq(customShellAutomationTemplateOverrides.templateKey, key)
      )
    )
  return templateView(key)
}
