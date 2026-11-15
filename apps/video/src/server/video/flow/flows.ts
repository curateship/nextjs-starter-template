import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { automationGraphSchema, type AutomationGraph } from "@/lib/automations/graph"
import {
  FLOW_CHANGED_MESSAGE,
  FLOW_NAME_MAX,
  FLOW_NOT_FOUND_MESSAGE,
  type FlowDetail,
  type FlowListItem,
} from "@/lib/video/flow/flows"
import { FLOW_STARTERS } from "@/lib/video/flow/starter"
import { validateFlow } from "@/lib/video/flow/validate"
import { EMPTY_AUTOMATION_GRAPH } from "@/lib/automations/graph"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { videoFlowRuns, videoFlows, videoFlowStarts, type VideoFlowRow } from "@/server/video/schema"

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, FLOW_NAME_MAX)
}

/**
 * Puts each starter flow in the person's table the first time their list is
 * read after it exists (Tyler, 14 Nov 2026: "the flows are the templates").
 * A row in `video_flow_starts` says each one was made, so deleting it never
 * brings it back.
 */
async function ensureStarters(userId: string, database: CustomShellDb) {
  await database.transaction(async (tx) => {
    for (const starter of FLOW_STARTERS) {
      const [started] = await tx
        .insert(videoFlowStarts)
        .values({ userId, starter: starter.key, createdAt: now() })
        .onConflictDoNothing()
        .returning({ userId: videoFlowStarts.userId })
      if (!started) continue
      const at = now()
      await tx.insert(videoFlows).values({
        id: uuid(),
        userId,
        name: starter.name,
        description: starter.description,
        graph: starter.graph(),
        starter: starter.key,
        createdAt: at,
        updatedAt: at,
      })
    }
  })
}

async function runFacts(userId: string, flowIds: string[], database: CustomShellDb) {
  if (!flowIds.length) return new Map<string, { runs: number; lastRunAt: string | null }>()
  const rows = await database
    .select({
      flowId: videoFlowRuns.flowId,
      runs: sql<number>`count(*)::int`,
      lastRunAt: sql<Date | null>`max(${videoFlowRuns.createdAt})`,
    })
    .from(videoFlowRuns)
    .where(and(eq(videoFlowRuns.userId, userId), inArray(videoFlowRuns.flowId, flowIds)))
    .groupBy(videoFlowRuns.flowId)
  return new Map(
    rows.map((row) => [
      row.flowId ?? "",
      { runs: row.runs, lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null },
    ])
  )
}

function listItem(row: VideoFlowRow, facts: { runs: number; lastRunAt: string | null } | undefined): FlowListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    nodeCount: row.graph.nodes.length,
    problemCount: validateFlow(row.graph).length,
    runCount: facts?.runs ?? 0,
    lastRunAt: facts?.lastRunAt ?? null,
    starter: row.starter !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Every flow of the person's, last changed first. */
export async function listFlows(userId: string, database: CustomShellDb = db): Promise<FlowListItem[]> {
  await ensureStarters(userId, database)
  const rows = await database
    .select()
    .from(videoFlows)
    .where(eq(videoFlows.userId, userId))
    .orderBy(desc(videoFlows.updatedAt))
  const facts = await runFacts(
    userId,
    rows.map((row) => row.id),
    database
  )
  return rows.map((row) => listItem(row, facts.get(row.id)))
}

export async function getOwnedFlowRow(userId: string, flowId: string, database: CustomShellDb = db) {
  const [row] = await database
    .select()
    .from(videoFlows)
    .where(and(eq(videoFlows.id, flowId), eq(videoFlows.userId, userId)))
    .limit(1)
  if (!row) throw new Error(FLOW_NOT_FOUND_MESSAGE)
  return row
}

export async function getFlow(userId: string, flowId: string, database: CustomShellDb = db): Promise<FlowDetail> {
  const row = await getOwnedFlowRow(userId, flowId, database)
  const facts = await runFacts(userId, [row.id], database)
  return { ...listItem(row, facts.get(row.id)), graph: row.graph, version: row.version }
}

/** A new flow, a blank canvas. One built from another flow is a duplicate of it. */
export async function createFlow(
  userId: string,
  payload: { name: string },
  database: CustomShellDb = db
): Promise<FlowDetail> {
  const name = cleanName(payload.name) || "New flow"
  const at = now()
  const [row] = await database
    .insert(videoFlows)
    .values({
      id: uuid(),
      userId,
      name,
      description: "",
      graph: EMPTY_AUTOMATION_GRAPH,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return { ...listItem(row, undefined), graph: row.graph, version: row.version }
}

/**
 * Saves the canvas. Refused when the flow moved on since `version`, which
 * means another window saved it, so the older canvas never writes over it.
 */
export async function saveFlowGraph(
  userId: string,
  payload: { flowId: string; graph: AutomationGraph; version: number },
  database: CustomShellDb = db
): Promise<{ version: number; updatedAt: string; problemCount: number }> {
  const graph = automationGraphSchema.parse(payload.graph)
  const [saved] = await database
    .update(videoFlows)
    .set({ graph, version: sql`${videoFlows.version} + 1`, updatedAt: now() })
    .where(and(eq(videoFlows.id, payload.flowId), eq(videoFlows.userId, userId), eq(videoFlows.version, payload.version)))
    .returning({ version: videoFlows.version, updatedAt: videoFlows.updatedAt })
  if (!saved) {
    await getOwnedFlowRow(userId, payload.flowId, database)
    throw new Error(FLOW_CHANGED_MESSAGE)
  }
  return { version: saved.version, updatedAt: saved.updatedAt.toISOString(), problemCount: validateFlow(graph).length }
}

/** The name and the description, each saved as it is typed. */
export async function updateFlowDetails(
  userId: string,
  payload: { flowId: string; name?: string; description?: string },
  database: CustomShellDb = db
): Promise<FlowListItem> {
  await getOwnedFlowRow(userId, payload.flowId, database)
  const name = payload.name === undefined ? undefined : cleanName(payload.name)
  const [row] = await database
    .update(videoFlows)
    .set({
      ...(name ? { name } : {}),
      ...(payload.description === undefined ? {} : { description: payload.description.slice(0, 2000) }),
      updatedAt: now(),
    })
    .where(and(eq(videoFlows.id, payload.flowId), eq(videoFlows.userId, userId)))
    .returning()
  const facts = await runFacts(userId, [row.id], database)
  return listItem(row, facts.get(row.id))
}

export async function duplicateFlow(userId: string, flowId: string, database: CustomShellDb = db): Promise<FlowDetail> {
  const source = await getOwnedFlowRow(userId, flowId, database)
  const at = now()
  const [row] = await database
    .insert(videoFlows)
    .values({
      id: uuid(),
      userId,
      name: cleanName(`${source.name} copy`),
      description: source.description,
      graph: source.graph,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return { ...listItem(row, undefined), graph: row.graph, version: row.version }
}

/** Deletes the flow. Its runs stay, each with its own copy of the graph. */
export async function deleteFlow(userId: string, flowId: string, database: CustomShellDb = db) {
  await getOwnedFlowRow(userId, flowId, database)
  await database.delete(videoFlows).where(and(eq(videoFlows.id, flowId), eq(videoFlows.userId, userId)))
  return { deleted: flowId }
}
