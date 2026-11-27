import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import { flowFeeders, flowStepOrder, flowStepsAfter, readyFlowSteps } from "@/lib/video/flow/advance"
import { writerCostCents } from "@/lib/video/ai-estimates"
import {
  FLOW_INVALID_MESSAGE_PREFIX,
  FLOW_NAME_MAX,
  FLOW_RUN_BUSY_MESSAGE,
  FLOW_RUN_NOT_FOUND_MESSAGE,
  FLOW_RUN_NOT_DONE_MESSAGE,
  FLOW_RUN_SAVED_MESSAGE,
  FLOW_RUN_STOPPED_MESSAGE,
  FLOW_STEP_NOT_FOUND_MESSAGE,
  FLOW_STEP_NOT_READY_MESSAGE,
  type FlowRunDetail,
  type FlowRunListItem,
  type FlowFile,
  type FlowRunStep,
  flowInputMessage,
} from "@/lib/video/flow/flows"
import {
  flowBoxLabel,
  flowButtonLabel,
  flowKindOf,
  flowNodeName,
  CHANGEABLE_KINDS,
  FLOW_PROMPT_MAX,
  readFlowNodeSettings,
  type FlowBox,
} from "@/lib/video/flow/node-kinds"
import { PROMPT_IDEA_ANSWER_TOKENS, PROMPT_IDEA_CHARACTERS } from "@/lib/video/flow/prompt-ideas"
import {
  flowRunStatusFrom,
  type FlowRunStatus,
  type FlowStepInput,
  type FlowStepInputs,
  type FlowStepOutput,
  type FlowStepState,
  type FlowStepStatus,
} from "@/lib/video/flow/run-shape"
import { validateFlow } from "@/lib/video/flow/validate"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellAiUsageEvents, customShellMedia, customShellNotifications } from "@/server/schema"
import { attachPastedMediaToProject } from "@/server/video/media-list"
import { createVideo } from "@/server/video/project-videos"
import {
  videoActors,
  videoFlowRuns,
  videoFlowRunSteps,
  videoProjects,
  videoProjectVideos,
  type VideoFlowRunRow,
  type VideoFlowRunStepRow,
} from "@/server/video/schema"

import { getOwnedFlowRow } from "./flows"
import { currentWriter } from "./prices"
import { readThumbnailLayers } from "@/lib/video/thumbnails"
import { createThumbnail } from "@/server/video/thumbnails"

/** Where the runs a person can open stop. Older ones are still kept. */
const RUNS_LISTED = 200

type Database = CustomShellDb

// ------------------------------------------------------------- reading --

async function ownedRun(userId: string, runId: string, database: Database) {
  const [run] = await database
    .select()
    .from(videoFlowRuns)
    .where(and(eq(videoFlowRuns.id, runId), eq(videoFlowRuns.userId, userId)))
    .limit(1)
  if (!run) throw new Error(FLOW_RUN_NOT_FOUND_MESSAGE)
  return run
}

/** One step and its run, both the person's own; the run row is locked for the change. */
async function ownedStepForChange(userId: string, stepId: string, tx: Database) {
  const [step] = await tx.select().from(videoFlowRunSteps).where(eq(videoFlowRunSteps.id, stepId)).limit(1)
  if (!step) throw new Error(FLOW_STEP_NOT_FOUND_MESSAGE)
  const [run] = await tx
    .select()
    .from(videoFlowRuns)
    .where(and(eq(videoFlowRuns.id, step.runId), eq(videoFlowRuns.userId, userId)))
    .for("update")
  if (!run) throw new Error(FLOW_STEP_NOT_FOUND_MESSAGE)
  if (run.status === "stopped") throw new Error(FLOW_RUN_STOPPED_MESSAGE)
  return { step, run }
}

async function spentByStep(stepIds: string[], database: Database) {
  if (!stepIds.length) return new Map<string, number>()
  const rows = await database
    .select({
      stepId: sql<string>`${customShellAiUsageEvents.metadata} ->> 'flowStepId'`,
      cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int`,
    })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.status, "success"),
        inArray(sql<string>`${customShellAiUsageEvents.metadata} ->> 'flowStepId'`, stepIds)
      )
    )
    .groupBy(sql`1`)
  return new Map(rows.map((row) => [row.stepId, row.cents]))
}

function nodeOf(graph: AutomationGraph, nodeId: string): AutomationNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId)
}

function stepView(
  row: VideoFlowRunStepRow,
  graph: AutomationGraph,
  order: string[],
  spent: Map<string, number>
): FlowRunStep {
  const node = nodeOf(graph, row.nodeId)
  const kind = flowKindOf(row.kind)
  const settings = readFlowNodeSettings(node?.settings ?? {})
  const titles = new Map(graph.nodes.map((one) => [one.id, flowNodeName(one)]))
  return {
    id: row.id,
    nodeId: row.nodeId,
    kind: row.kind,
    title: node ? flowNodeName(node) : "Removed node",
    position: row.position,
    status: row.status,
    prompt: settings.prompt,
    waitForOk: settings.waitForOk,
    feedsFrom: flowFeeders(graph, row.nodeId, order).map((id) => titles.get(id) ?? "Removed node"),
    feeds: flowFeeders(graph, row.nodeId, order),
    boxes: settings.asks.map((box) => ({ ...box, label: flowBoxLabel(box) })),
    heading: settings.heading,
    line: settings.line,
    explanation: settings.explanation,
    tip: settings.tip,
    button: kind ? flowButtonLabel(kind, settings) : "Next",
    input: row.input,
    output: row.output,
    promptSent: row.promptSent,
    estimateCents: row.estimateCents,
    costCents: row.costCents ?? spent.get(row.id) ?? null,
    error: row.error,
    note: row.note,
    planned: row.status === "needs_ok" && (row.state?.phase === "planned" || row.state?.phase === "priced"),
    changedWith: row.state?.change?.words ?? null,
    videoPrompt: row.videoPrompt,
    videoPromptFromAi: row.videoPromptFromAi,
    suggestPrompt: settings.suggestPrompt,
    attempts: row.attempts,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

async function runListItems(rows: VideoFlowRunRow[], database: Database): Promise<FlowRunListItem[]> {
  if (!rows.length) return []
  const runIds = rows.map((row) => row.id)
  const [projects, steps] = await Promise.all([
    database
      .select({ id: videoProjects.id, name: videoProjects.name })
      .from(videoProjects)
      .where(inArray(videoProjects.id, [...new Set(rows.flatMap((row) => (row.projectId ? [row.projectId] : [])))])),
    database
      .select({ id: videoFlowRunSteps.id, runId: videoFlowRunSteps.runId, status: videoFlowRunSteps.status, cost: videoFlowRunSteps.costCents })
      .from(videoFlowRunSteps)
      .where(inArray(videoFlowRunSteps.runId, runIds)),
  ])
  const spent = await spentByStep(
    steps.filter((step) => step.cost === null).map((step) => step.id),
    database
  )
  const projectName = new Map(projects.map((project) => [project.id, project.name]))
  return rows.map((row) => {
    const own = steps.filter((step) => step.runId === row.id)
    return {
      id: row.id,
      flowId: row.flowId,
      flowName: row.flowName,
      projectId: row.projectId,
      projectName: row.projectId ? (projectName.get(row.projectId) ?? "Project") : null,
      videoId: row.videoId,
      status: row.status,
      stepsDone: own.filter((step) => step.status === "done").length,
      stepCount: own.length,
      spentCents: own.reduce((sum, step) => sum + (step.cost ?? spent.get(step.id) ?? 0), 0),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

/** The person's runs, newest first. */
export async function listFlowRuns(userId: string, database: Database = db): Promise<FlowRunListItem[]> {
  const rows = await database
    .select()
    .from(videoFlowRuns)
    .where(eq(videoFlowRuns.userId, userId))
    .orderBy(desc(videoFlowRuns.createdAt))
    .limit(RUNS_LISTED)
  return runListItems(rows, database)
}

/** How many runs the person has, for the left panel's Runs row. */
export async function countFlowRuns(userId: string, database: Database = db) {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(videoFlowRuns)
    .where(eq(videoFlowRuns.userId, userId))
  return row?.total ?? 0
}

/** One run with every step, in the order they run. */
export async function getFlowRun(userId: string, runId: string, database: Database = db): Promise<FlowRunDetail> {
  const run = await ownedRun(userId, runId, database)
  const rows = await database
    .select()
    .from(videoFlowRunSteps)
    .where(eq(videoFlowRunSteps.runId, run.id))
    .orderBy(asc(videoFlowRunSteps.position))
  const [[item], video] = await Promise.all([
    runListItems([run], database),
    run.videoId
      ? database
          .select({ name: videoProjectVideos.name })
          .from(videoProjectVideos)
          .where(eq(videoProjectVideos.id, run.videoId))
          .limit(1)
          .then((found) => found[0] ?? null)
      : Promise.resolve(null),
  ])
  const spent = await spentByStep(
    rows.filter((row) => row.costCents === null).map((row) => row.id),
    database
  )
  const order = rows.map((row) => row.nodeId)
  const writer = await currentWriter()
  return {
    ...item,
    videoName: video?.name ?? null,
    ideaCents: writer ? writerCostCents(writer, PROMPT_IDEA_CHARACTERS, PROMPT_IDEA_ANSWER_TOKENS) : 0,
    hasCut: run.timeline !== null,
    error: run.error,
    steps: rows.map((row) => stepView(row, run.graph, order, spent)),
  }
}

// --------------------------------------------------------- moving on --

/**
 * Moves a run on after any change: every step whose feeders are all done
 * becomes ready and waits for its button, with its boxes to fill in (Tyler,
 * 14 Nov 2026, picked "At each step's button"). Then the run's state is worked out again from its steps.
 * The bell rings when the run reaches its end, fails, or was working and now
 * waits for the person; a run that waits straight after Run is pressed does
 * not ring, because the person is looking at it.
 */
export async function settleFlowRun(runId: string, database: Database = db) {
  const [run] = await database.select().from(videoFlowRuns).where(eq(videoFlowRuns.id, runId)).limit(1)
  if (!run || run.status === "stopped") return run ?? null
  let steps = await database
    .select()
    .from(videoFlowRunSteps)
    .where(eq(videoFlowRunSteps.runId, runId))
    .orderBy(asc(videoFlowRunSteps.position))
  const at = now()
  const ready = new Set(readyFlowSteps(run.graph, steps))
  for (const step of steps) {
    if (!ready.has(step.nodeId)) continue
    await database
      .update(videoFlowRunSteps)
      .set({ status: "needs_input", updatedAt: at })
      .where(and(eq(videoFlowRunSteps.id, step.id), eq(videoFlowRunSteps.status, "waiting")))
  }
  if (ready.size) {
    steps = await database
      .select()
      .from(videoFlowRunSteps)
      .where(eq(videoFlowRunSteps.runId, runId))
      .orderBy(asc(videoFlowRunSteps.position))
  }
  // Every step made still waits for the last one: saving into a project.
  const fromSteps = flowRunStatusFrom(steps)
  const status = fromSteps === "done" && !run.projectId ? "waiting" : fromSteps
  if (status === run.status && !ready.size) return run
  const [saved] = await database
    .update(videoFlowRuns)
    .set({
      status,
      updatedAt: at,
      finishedAt: status === "done" ? at : null,
      error: status === "failed" ? (steps.find((step) => step.status === "failed")?.error ?? null) : null,
    })
    .where(and(eq(videoFlowRuns.id, runId), sql`${videoFlowRuns.status} <> 'stopped'`))
    .returning()
  if (saved && status !== run.status) await ringForChange(saved, run.status, steps, database)
  return saved ?? run
}

async function ringForChange(
  run: VideoFlowRunRow,
  before: FlowRunStatus,
  steps: VideoFlowRunStepRow[],
  database: Database
) {
  const titled = (status: FlowStepStatus) => {
    const step = steps.find((one) => one.status === status)
    const node = step ? nodeOf(run.graph, step.nodeId) : undefined
    return node ? flowNodeName(node) : "a step"
  }
  if (run.status === "done") {
    await ringBell(
      run.userId,
      `${run.flowName} is finished`,
      run.videoId
        ? "Every step of the run is done. Its video is in the project."
        : "Every step of the run is done. What it made is in the project's Media.",
      database
    )
  } else if (run.status === "failed") {
    await ringBell(run.userId, `${run.flowName} stopped at ${titled("failed")}`, run.error ?? "Open the run to see why.", database)
  } else if (run.status === "waiting" && before === "running") {
    const step = steps.find((one) => one.status === "needs_ok" || one.status === "needs_input")
    const name = step ? titled(step.status) : "a step"
    await ringBell(
      run.userId,
      step ? `${run.flowName} is waiting on you` : `${run.flowName} is ready to save`,
      !step
        ? "Every step is made. Pick the project it goes into on the last step."
        : step.status === "needs_ok"
          ? `${name} is made and waits for your OK.`
          : `${name} needs something from you.`,
      database
    )
  }
}

async function ringBell(userId: string, message: string, detail: string, database: Database) {
  try {
    await database.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: userId,
      type: "app_activity",
      message: message.slice(0, 300),
      detail: detail.slice(0, 500),
      createdAt: now(),
    })
    await publishNotificationCreated(userId, database)
  } catch (error) {
    console.error("A flow run's notice could not be written", error)
  }
}

// ------------------------------------------------------------ starting --

/**
 * Starts a run of the flow, with no project. A flow that can't run says why
 * (`validate.ts`). The run keeps its own copy of the graph. Nothing goes into
 * a project until the guide's last step saves it (Tyler, 14 Nov 2026: "Flow
 * should not create draft until it is saved"), so a run that stops early
 * leaves no empty draft behind.
 */
export async function startFlowRun(
  userId: string,
  payload: { flowId: string },
  database: Database = db
): Promise<{ runId: string }> {
  const flow = await getOwnedFlowRow(userId, payload.flowId, database)
  const [problem] = validateFlow(flow.graph)
  if (problem) throw new Error(`${FLOW_INVALID_MESSAGE_PREFIX} ${problem.message}`)

  const runId = uuid()
  await database.transaction(async (tx) => {
    const at = now()
    await tx.insert(videoFlowRuns).values({
      id: runId,
      userId,
      flowId: flow.id,
      flowName: flow.name,
      projectId: null,
      videoId: null,
      graph: flow.graph,
      status: "waiting",
      createdAt: at,
      updatedAt: at,
    })
    const order = flowStepOrder(flow.graph)
    await tx.insert(videoFlowRunSteps).values(
      order.map((nodeId, position) => ({
        id: uuid(),
        runId,
        nodeId,
        kind: nodeOf(flow.graph, nodeId)!.kind,
        position,
        status: "waiting" as const,
        updatedAt: at,
      }))
    )
    await settleFlowRun(runId, tx)
  })
  return { runId }
}

/**
 * The guide's last step: the project the run's work goes into (Tyler,
 * 14 Nov 2026, of the project box under Run: "this should be removed. its
 * the last step"). Saving makes the project's video from the cut AI video
 * kept on the run, puts every file the run made or was given on the
 * project's Media shelf, and puts each AI thumbnail on the video's board.
 * A run is saved once; after that, steps made again write into that project.
 */
export async function saveFlowRun(
  userId: string,
  payload: { runId: string; projectId: string },
  database: Database = db
) {
  await database.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(videoFlowRuns)
      .where(and(eq(videoFlowRuns.id, payload.runId), eq(videoFlowRuns.userId, userId)))
      .for("update")
    if (!run) throw new Error(FLOW_RUN_NOT_FOUND_MESSAGE)
    if (run.status === "stopped") throw new Error(FLOW_RUN_STOPPED_MESSAGE)
    if (run.projectId) throw new Error(FLOW_RUN_SAVED_MESSAGE)
    const [project] = await tx
      .select({ id: videoProjects.id })
      .from(videoProjects)
      .where(and(eq(videoProjects.id, payload.projectId), eq(videoProjects.userId, userId)))
      .limit(1)
    if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
    // The last step: every step before it is done first (Tyler, 14 Nov 2026:
    // "why am i able to save a project if the steps are not done?").
    const unfinished = await tx
      .select({ id: videoFlowRunSteps.id })
      .from(videoFlowRunSteps)
      .where(and(eq(videoFlowRunSteps.runId, run.id), sql`${videoFlowRunSteps.status} <> 'done'`))
      .limit(1)
    if (unfinished.length) throw new Error(FLOW_RUN_NOT_DONE_MESSAGE)

    let videoId = run.videoId
    if (run.timeline && !videoId) {
      const video = await createVideo(userId, project.id, { name: run.flowName, timeline: run.timeline }, tx)
      videoId = video.id
    }
    await tx
      .update(videoFlowRuns)
      .set({ projectId: project.id, videoId, updatedAt: now() })
      .where(eq(videoFlowRuns.id, run.id))

    const steps = await tx.select().from(videoFlowRunSteps).where(eq(videoFlowRunSteps.runId, run.id))
    const mediaIds = [
      ...new Set(
        steps.flatMap((step) => [
          ...(step.output?.mediaIds ?? []),
          ...Object.values(step.input ?? {}).flatMap((input) => input.mediaIds ?? []),
        ])
      ),
    ]
    if (mediaIds.length) await attachPastedMediaToProject(userId, project.id, mediaIds, tx)

    // Each AI thumbnail goes on the video's board as the step laid it
    // (thumbnail-answer.ts).
    if (videoId) {
      for (const step of steps) {
        const design = step.output?.thumbnail
        if (flowKindOf(step.kind) !== "ai-thumbnail" || !design || step.output?.thumbnailIds?.length) continue
        const thumbnail = await createThumbnail({
          owner: userId,
          videoId,
          shape: design.shape,
          layers: readThumbnailLayers(design.layers),
          database: tx,
        })
        await tx
          .update(videoFlowRunSteps)
          .set({ output: { ...step.output, thumbnailIds: [thumbnail.id], videoId } })
          .where(eq(videoFlowRunSteps.id, step.id))
      }
    }
    await settleFlowRun(run.id, tx)
  })
  return getFlowRun(userId, payload.runId, database)
}

/**
 * Renames the run. A run starts with its flow's name, which is what its bell,
 * its files and the video it saves are named after, so they take the new one
 * from here on (Tyler, 14 Nov 2026: "need ability to edit the run like
 * title").
 */
export async function renameFlowRun(userId: string, payload: { runId: string; name: string }, database: Database = db) {
  const run = await ownedRun(userId, payload.runId, database)
  const name = payload.name.trim().slice(0, FLOW_NAME_MAX)
  if (!name) return { name: run.flowName }
  await database.update(videoFlowRuns).set({ flowName: name, updatedAt: now() }).where(eq(videoFlowRuns.id, run.id))
  return { name }
}

/**
 * Deletes the person's runs, all or none. A run with a step being made right
 * now is refused, so the worker never writes into a run that is gone. Its
 * steps and their shot rows go with it (cascade); the files it made stay in
 * Media, the cost stays on the meter, and a video it saved stays in its
 * project.
 */
export async function deleteFlowRuns(userId: string, payload: { runIds: string[] }, database: Database = db) {
  const ids = [...new Set(payload.runIds)]
  if (!ids.length) return { deleted: 0 }
  return database.transaction(async (tx) => {
    const owned = await tx
      .select({ id: videoFlowRuns.id })
      .from(videoFlowRuns)
      .where(and(inArray(videoFlowRuns.id, ids), eq(videoFlowRuns.userId, userId)))
      .for("update")
    if (owned.length !== ids.length) throw new Error(FLOW_RUN_NOT_FOUND_MESSAGE)
    const busy = await tx
      .select({ id: videoFlowRunSteps.id })
      .from(videoFlowRunSteps)
      .where(and(inArray(videoFlowRunSteps.runId, ids), eq(videoFlowRunSteps.status, "working")))
      .limit(1)
    if (busy.length) throw new Error(FLOW_RUN_BUSY_MESSAGE)
    await tx.delete(videoFlowRuns).where(and(inArray(videoFlowRuns.id, ids), eq(videoFlowRuns.userId, userId)))
    return { deleted: ids.length }
  })
}

/** Stops the run. A step being made finishes, but nothing after it starts. */
export async function stopFlowRun(userId: string, runId: string, database: Database = db) {
  const run = await ownedRun(userId, runId, database)
  if (run.status === "stopped" || run.status === "done") return { status: run.status }
  const at = now()
  await database
    .update(videoFlowRuns)
    .set({ status: "stopped", finishedAt: at, updatedAt: at, leaseToken: null, leaseExpiresAt: null })
    .where(eq(videoFlowRuns.id, run.id))
  return { status: "stopped" as const }
}

// ------------------------------------------------------- the person --

async function ownedMediaRows(userId: string, mediaIds: string[], database: Database) {
  const unique = [...new Set(mediaIds)]
  if (!unique.length) return []
  const rows = await database
    .select({ id: customShellMedia.id, fileType: customShellMedia.fileType })
    .from(customShellMedia)
    .where(and(inArray(customShellMedia.id, unique), eq(customShellMedia.userId, userId)))
  if (rows.length !== unique.length) return null
  return unique.map((id) => rows.find((row) => row.id === id)!)
}

/**
 * The person's own files among these ids, in the order asked, so the guide's
 * card can show and play what a box holds rather than saying "Filled in"
 * (Tyler, 14 Nov 2026: "actually show the video thumbnail and playable"). A
 * file that isn't theirs, or is gone, is left out.
 */
export async function getFlowFiles(userId: string, mediaIds: string[], database: Database = db): Promise<FlowFile[]> {
  const unique = [...new Set(mediaIds)]
  if (!unique.length) return []
  const rows = await database
    .select()
    .from(customShellMedia)
    .where(and(inArray(customShellMedia.id, unique), eq(customShellMedia.userId, userId)))
  // The editor's own reading of a file: a video plays from its smooth 720p
  // copy once that is made, the original only until then, so a tile never
  // pulls a 4K upload (Tyler, 14 Nov 2026: "it should work like how video
  // editor works").
  const { serializeVideoMedia } = await import("@/server/video/media-list")
  const files = await serializeVideoMedia(rows, database)
  return unique.flatMap((id) => {
    const file = files.find((one) => one.id === id)
    return file ? [{ id: file.id, name: file.original_name, fileType: file.file_type, url: file.playback_url }] : []
  })
}

/**
 * A page of the person's Media for a Files box, newest first, one kind at a
 * time, each file read as the editor reads it so a video's thumbnail comes
 * from its smooth copy (Tyler, 14 Nov 2026: "this should show the images we
 * already have in video editor"). The editor's own list needs a project, and
 * a run has none until it is saved.
 */
export async function listFlowMedia(
  userId: string,
  query: { page: number; pageSize: number; fileType: "image" | "video" | "audio"; search?: string },
  database: Database = db
): Promise<{ files: FlowFile[]; total: number }> {
  const [{ findWorkspaceIdForRequest }, { listOwnedMedia }] = await Promise.all([
    import("@/server/workspaces/for-request"),
    import("@/server/media/library"),
  ])
  const workspaceId = await findWorkspaceIdForRequest(userId)
  if (!workspaceId) return { files: [], total: 0 }
  const listed = await listOwnedMedia({ workspaceId, userId, ...query })
  return { files: await getFlowFiles(userId, listed.media.map((item) => item.id), database), total: listed.total }
}

/** The two checks that reach outside the database, handed in so a test can stand in for them. */
export type BoxChecks = {
  linkIsVideo: (link: string) => boolean
  voices: (userId: string) => Promise<{ id: string; name: string; speaker: string }[]>
}

async function defaultBoxChecks(): Promise<BoxChecks> {
  const [{ parseVideoLink }, { listVoices }] = await Promise.all([
    import("@/server/video/viral/download"),
    import("@/server/video/voice"),
  ])
  return {
    linkIsVideo: (link) => {
      try {
        return parseVideoLink(link) !== null
      } catch {
        return false
      }
    },
    voices: listVoices,
  }
}

/**
 * What one box was given, checked against the person: their own files, their
 * own actor, a voice on their list, a link to a video the download knows. A
 * box left empty is refused, named, so the step says which.
 */
async function readBox(
  userId: string,
  box: FlowBox,
  given: FlowStepInput | undefined,
  database: Database,
  checks: BoxChecks
): Promise<FlowStepInputs[string]> {
  const label = flowBoxLabel(box)
  // A box that can be left empty, left empty, keeps nothing.
  if (box.optional && !boxHolds(given)) return {}
  switch (box.kind) {
    case "text": {
      const text = given?.text?.trim() ?? ""
      if (!text) throw new Error(flowInputMessage(label, "text"))
      return { text }
    }
    case "video":
    case "media": {
      const ids = given?.mediaIds ?? []
      if (!ids.length) throw new Error(flowInputMessage(label, box.kind === "video" ? "video" : "files"))
      const rows = await ownedMediaRows(userId, ids, database)
      if (!rows) throw new Error(flowInputMessage(label, "notYours"))
      if (box.kind === "video" && rows.some((row) => row.fileType !== "video")) throw new Error(flowInputMessage(label, "notVideo"))
      return { mediaIds: rows.map((row) => row.id) }
    }
    case "link": {
      const link = given?.link?.trim() ?? ""
      if (!link || !checks.linkIsVideo(link)) throw new Error(flowInputMessage(label, "link"))
      return { link }
    }
    case "actor-voice": {
      if (!given?.actorId && !given?.voiceId) throw new Error(flowInputMessage(label, "actorOrVoice"))
      const kept: FlowStepInputs[string] = {}
      if (given.actorId) {
        const [actor] = await database
          .select({ id: videoActors.id })
          .from(videoActors)
          .where(and(eq(videoActors.id, given.actorId), eq(videoActors.userId, userId)))
          .limit(1)
        if (!actor) throw new Error(flowInputMessage(label, "actor"))
        kept.actorId = actor.id
      }
      if (given.voiceId) {
        const voice = (await checks.voices(userId)).find((one) => one.id === given.voiceId)
        if (!voice) throw new Error(flowInputMessage(label, "voice"))
        kept.voiceId = voice.id
        kept.voice = { voiceId: voice.id, voiceName: voice.name, speaker: voice.speaker }
      }
      return kept
    }
  }
}

/** Whether anything was put in a box. */
function boxHolds(given: FlowStepInput | undefined) {
  return Boolean(given?.text?.trim() || given?.link?.trim() || given?.mediaIds?.length || given?.actorId || given?.voiceId)
}

/**
 * The step's video prompt as its button sent it. Words the AI wrote and the
 * person left alone stay marked as the AI's, so a change above them can
 * write them afresh; anything else is the person's own and is kept.
 */
function sentPrompt(step: VideoFlowRunStepRow, given: string | undefined) {
  if (given === undefined) return {}
  const words = given.trim().slice(0, FLOW_PROMPT_MAX)
  const untouched = step.videoPromptFromAi && words === (step.videoPrompt ?? "").trim()
  return { videoPrompt: words || null, videoPromptFromAi: untouched }
}

async function queueStep(stepId: string, runId: string, tx: Database) {
  await tx
    .update(videoFlowRunSteps)
    .set({ status: "queued", error: null, note: null, wakeAt: null, updatedAt: now() })
    .where(eq(videoFlowRunSteps.id, stepId))
  await settleFlowRun(runId, tx)
}

/**
 * A step's button: what is in its boxes is checked and kept, then the step
 * goes to the worker to be made (Tyler, 14 Nov 2026, picked "At each step's
 * button"). Files go on the project's Media shelf once the run is saved into
 * one.
 */
export async function startFlowStep(
  userId: string,
  payload: { stepId: string; inputs?: Record<string, FlowStepInput>; prompt?: string },
  database: Database = db,
  checks?: BoxChecks
) {
  const boxChecks = checks ?? (await defaultBoxChecks())
  const runId = await database.transaction(async (tx) => {
    const { step, run } = await ownedStepForChange(userId, payload.stepId, tx)
    const node = nodeOf(run.graph, step.nodeId)
    if (!node || !flowKindOf(step.kind) || step.status !== "needs_input") throw new Error(FLOW_STEP_NOT_READY_MESSAGE)
    const inputs: FlowStepInputs = {}
    for (const box of readFlowNodeSettings(node.settings).asks) {
      inputs[box.id] = await readBox(userId, box, payload.inputs?.[box.id], tx, boxChecks)
    }
    await tx
      .update(videoFlowRunSteps)
      .set({ input: inputs, ...sentPrompt(step, payload.prompt), updatedAt: now() })
      .where(eq(videoFlowRunSteps.id, step.id))
    const mediaIds = Object.values(inputs).flatMap((input) => input.mediaIds ?? [])
    if (run.projectId && mediaIds.length) await attachPastedMediaToProject(userId, run.projectId, mediaIds, tx)
    await queueStep(step.id, run.id, tx)
    return run.id
  })
  return getFlowRun(userId, runId, database)
}

/**
 * OK on a step that waited for it, with the words changed first when the
 * person edited them. The steps after it then go on with what it says now.
 */
export async function approveFlowStep(
  userId: string,
  payload: { stepId: string; text?: string; prompt?: string },
  database: Database = db
) {
  const runId = await database.transaction(async (tx) => {
    const { step, run } = await ownedStepForChange(userId, payload.stepId, tx)
    if (step.status !== "needs_ok") throw new Error(FLOW_STEP_NOT_READY_MESSAGE)
    // OK on a plan: now it is made, and paid for (flow.md, "Plan, OK, then make").
    // OK on a price: now it is made and paid for, from the Prompt card's
    // words as they are at OK, and Wait for my OK still stops it once made
    // (run-shape.ts, `priced`).
    if (step.state?.phase === "priced") {
      await tx
        .update(videoFlowRunSteps)
        .set({
          status: "queued",
          state: { ...step.state, phase: "making", priceOk: true },
          ...sentPrompt(step, payload.prompt),
          finishedAt: null,
          updatedAt: now(),
        })
        .where(eq(videoFlowRunSteps.id, step.id))
      await settleFlowRun(run.id, tx)
      return run.id
    }
    if (step.state?.phase === "planned") {
      await tx
        .update(videoFlowRunSteps)
        .set({
          status: "queued",
          state: { ...step.state, phase: "making", approved: true },
          finishedAt: null,
          updatedAt: now(),
        })
        .where(eq(videoFlowRunSteps.id, step.id))
      await settleFlowRun(run.id, tx)
      return run.id
    }
    const edited = payload.text?.trim()
    const output: FlowStepOutput | null =
      edited && step.output?.text !== undefined ? { ...step.output, text: edited } : step.output
    await tx
      .update(videoFlowRunSteps)
      .set({ status: "done", output, updatedAt: now() })
      .where(eq(videoFlowRunSteps.id, step.id))
    await settleFlowRun(run.id, tx)
    return run.id
  })
  return getFlowRun(userId, runId, database)
}

/**
 * Sends a step back to be made again with what its boxes held. Every step its
 * result reached goes back to waiting, keeping what its boxes held so it
 * opens filled in.
 */
async function sendBack(
  step: VideoFlowRunStepRow,
  run: VideoFlowRunRow,
  tx: Database,
  { keepMade, state, prompt }: { keepMade: boolean; state?: FlowStepState; prompt?: string }
) {
  const at = now()
  const after = [...flowStepsAfter(run.graph, step.nodeId)]
  if (after.length) {
    await tx
      .update(videoFlowRunSteps)
      .set({ status: "waiting", output: null, state: null, error: null, note: null, wakeAt: null, finishedAt: null, costCents: null, updatedAt: at })
      .where(and(eq(videoFlowRunSteps.runId, run.id), inArray(videoFlowRunSteps.nodeId, after)))
    // An idea the AI wrote from what this step made is written afresh from
    // what it makes now; words the person wrote stay.
    await tx
      .update(videoFlowRunSteps)
      .set({ videoPrompt: null, videoPromptFromAi: false })
      .where(and(eq(videoFlowRunSteps.runId, run.id), inArray(videoFlowRunSteps.nodeId, after), eq(videoFlowRunSteps.videoPromptFromAi, true)))
  }
  // Try again keeps everything already made and paid for, so it is never
  // paid for twice; Make it again starts the step from nothing.
  await tx
    .update(videoFlowRunSteps)
    .set({ status: "queued", state: state ?? (keepMade ? step.state : null), ...sentPrompt(step, prompt), output: null, error: null, note: null, wakeAt: null, finishedAt: null, costCents: null, updatedAt: at })
    .where(eq(videoFlowRunSteps.id, step.id))
  await settleFlowRun(run.id, tx)
}

/** Make it again: an AI step made or waiting for its OK is made once more, from the prompt as it is now. */
export async function redoFlowStep(userId: string, payload: { stepId: string; prompt?: string }, database: Database = db) {
  const runId = await database.transaction(async (tx) => {
    const { step, run } = await ownedStepForChange(userId, payload.stepId, tx)
    const kind = flowKindOf(step.kind)
    const redoable = step.status === "needs_ok" || step.status === "done" || step.status === "failed"
    if (!kind || !redoable || !step.input) throw new Error(FLOW_STEP_NOT_READY_MESSAGE)
    await sendBack(step, run, tx, { keepMade: false, prompt: payload.prompt })
    return run.id
  })
  return getFlowRun(userId, runId, database)
}

/**
 * Change it: a made AI picture or clip is made again with the words typed
 * ("make it daytime", "slower snow"), keeping the rest. A picture is made from
 * itself; a clip from the same picture, its prompt and the words, after its
 * price is OK'd again. The steps after it go back to waiting, as on Make it
 * again, because they read the old one.
 */
export async function changeFlowStep(userId: string, payload: { stepId: string; words: string }, database: Database = db) {
  const words = payload.words.trim()
  const runId = await database.transaction(async (tx) => {
    const { step, run } = await ownedStepForChange(userId, payload.stepId, tx)
    const mediaId = step.output?.mediaIds?.[0]
    const made = step.status === "needs_ok" || step.status === "done"
    const kind = flowKindOf(step.kind)
    if (!kind || !CHANGEABLE_KINDS.has(kind) || !made || !mediaId || !step.input || !words) throw new Error(FLOW_STEP_NOT_READY_MESSAGE)
    await sendBack(step, run, tx, { keepMade: false, state: { phase: "making", change: { words, mediaId } } })
    return run.id
  })
  return getFlowRun(userId, runId, database)
}

/** Try again on a failed step: made again with what its boxes held and the prompt as it is now. */
export async function retryFlowStep(userId: string, payload: { stepId: string; prompt?: string }, database: Database = db) {
  const runId = await database.transaction(async (tx) => {
    const { step, run } = await ownedStepForChange(userId, payload.stepId, tx)
    if (step.status !== "failed") throw new Error(FLOW_STEP_NOT_READY_MESSAGE)
    await sendBack(step, run, tx, { keepMade: true, prompt: payload.prompt })
    return run.id
  })
  return getFlowRun(userId, runId, database)
}
