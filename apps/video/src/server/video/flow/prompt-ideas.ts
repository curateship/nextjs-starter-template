import { and, desc, eq, isNull, isNotNull, ne } from "drizzle-orm"
import { z } from "zod"

import { flowFeeders } from "@/lib/video/flow/advance"
import { FLOW_STEP_NOT_FOUND_MESSAGE, FLOW_STEP_NOT_READY_MESSAGE } from "@/lib/video/flow/flows"
import { FLOW_KIND_INFO, FLOW_PROMPT_MAX, flowKindOf, flowNodeName, readFlowNodeSettings } from "@/lib/video/flow/node-kinds"
import { PROMPT_IDEA_EARLIER_MAX, promptIdeaRequest, type PromptIdeaFeed } from "@/lib/video/flow/prompt-ideas"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { videoFlowRuns, videoFlowRunSteps, videoFlows } from "@/server/video/schema"
import { askWriter } from "@/server/video/writer"

import { getFlowRun } from "./runs"

type Database = CustomShellDb

const ideaAnswer = z.object({ prompt: z.string().trim().min(1) })

/** A step being made, or one in a stopped run, takes no new idea. */
const TAKES_AN_IDEA = new Set(["waiting", "needs_input", "needs_ok", "done", "failed"])

/**
 * The AI's idea for this video's prompt at one step, kept on the step
 * (tasks/flow/03-each-video-its-own-prompts.md, Part 2).
 *
 * - **First idea** (`replace` false): only for a node with its switch on,
 *   only once every step it reads is done, and only while the step has no
 *   prompt yet. A step that already has one is handed back untouched, so a
 *   second tab or a reload never pays twice.
 * - **New idea** (`replace` true): the words are replaced whatever they were.
 *   The page asks before it throws away words the person wrote.
 *
 * The writer is asked outside any transaction, so a slow answer never holds
 * the run's row. If the step changed meanwhile (made again, or given a prompt
 * by its button), the first idea is dropped rather than written over it.
 */
export async function suggestFlowPrompt(
  userId: string,
  payload: { stepId: string; replace?: boolean },
  database: Database = db
) {
  const [found] = await database
    .select({ step: videoFlowRunSteps, run: videoFlowRuns })
    .from(videoFlowRunSteps)
    .innerJoin(videoFlowRuns, eq(videoFlowRuns.id, videoFlowRunSteps.runId))
    .where(and(eq(videoFlowRunSteps.id, payload.stepId), eq(videoFlowRuns.userId, userId)))
    .limit(1)
  if (!found) throw new Error(FLOW_STEP_NOT_FOUND_MESSAGE)
  const { step, run } = found
  const node = run.graph.nodes.find((one) => one.id === step.nodeId)
  const kind = flowKindOf(step.kind)
  if (!node || !kind || run.status === "stopped" || !TAKES_AN_IDEA.has(step.status)) throw new Error(FLOW_STEP_NOT_READY_MESSAGE)
  const settings = readFlowNodeSettings(node.settings)
  if (!payload.replace && (!settings.suggestPrompt || step.videoPrompt !== null)) return getFlowRun(userId, run.id, database)

  const steps = await database.select().from(videoFlowRunSteps).where(eq(videoFlowRunSteps.runId, run.id))
  const order = [...steps].sort((a, b) => a.position - b.position).map((one) => one.nodeId)
  const feederIds = flowFeeders(run.graph, step.nodeId, order)
  const feeders = feederIds.flatMap((id) => steps.filter((one) => one.nodeId === id))
  // An idea built on a step that isn't made yet would be a guess.
  if (feeders.some((one) => one.status !== "done")) throw new Error(FLOW_STEP_NOT_READY_MESSAGE)

  const feeds: PromptIdeaFeed[] = feeders.map((one) => {
    const from = run.graph.nodes.find((graphNode) => graphNode.id === one.nodeId)
    return {
      title: from ? flowNodeName(from) : "An earlier step",
      videoPrompt: one.videoPrompt,
      changedWith: one.state?.change?.words ?? null,
      text: one.output?.text ?? null,
    }
  })
  const [flow, earlier] = await Promise.all([
    run.flowId
      ? database
          .select({ description: videoFlows.description })
          .from(videoFlows)
          .where(eq(videoFlows.id, run.flowId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    // A step that starts the video differs from the same step in the
    // channel's earlier videos ("Avoid earlier scenes").
    feeders.length || !run.flowId
      ? Promise.resolve([])
      : database
          .select({ prompt: videoFlowRunSteps.videoPrompt })
          .from(videoFlowRunSteps)
          .innerJoin(videoFlowRuns, eq(videoFlowRuns.id, videoFlowRunSteps.runId))
          .where(
            and(
              eq(videoFlowRuns.userId, userId),
              eq(videoFlowRuns.flowId, run.flowId),
              ne(videoFlowRuns.id, run.id),
              eq(videoFlowRunSteps.nodeId, step.nodeId),
              isNotNull(videoFlowRunSteps.videoPrompt)
            )
          )
          .orderBy(desc(videoFlowRuns.createdAt))
          .limit(PROMPT_IDEA_EARLIER_MAX)
          .then((rows) => rows.flatMap((row) => (row.prompt ? [row.prompt] : []))),
  ])

  const answer = await askWriter({
    userId,
    feature: "flow_prompt_idea",
    metadata: {
      ...(run.projectId ? { projectId: run.projectId } : {}),
      ...(run.videoId ? { videoId: run.videoId } : {}),
      flowRunId: run.id,
      flowStepId: step.id,
    },
    prompt: promptIdeaRequest({
      flowName: run.flowName,
      flowDescription: flow?.description ?? "",
      stepTitle: flowNodeName(node),
      kindName: FLOW_KIND_INFO[kind].name,
      structure: settings.prompt,
      feeds,
      earlier,
    }),
    schema: ideaAnswer,
    label: "Prompt idea",
  })

  await database
    .update(videoFlowRunSteps)
    .set({ videoPrompt: answer.prompt.slice(0, FLOW_PROMPT_MAX), videoPromptFromAi: true, updatedAt: now() })
    .where(
      and(
        eq(videoFlowRunSteps.id, step.id),
        eq(videoFlowRunSteps.status, step.status),
        payload.replace ? undefined : isNull(videoFlowRunSteps.videoPrompt)
      )
    )
  return getFlowRun(userId, run.id, database)
}
