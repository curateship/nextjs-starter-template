import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FLOW_CHANGED_MESSAGE,
  FLOW_RUN_BUSY_MESSAGE,
  FLOW_RUN_NOT_DONE_MESSAGE,
  flowInputMessage,
} from "@/lib/video/flow/flows"
import { createFlowNode } from "@/lib/video/flow/node-kinds"
import { timelineSchema } from "@/lib/video/timeline-schema"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, customShellMedia, customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { getOwnedVideo } from "@/server/video/project-videos"
import { createOwnedProject } from "@/server/video/projects"
import { videoFlowRuns, videoFlowRunSteps, videoProjectVideos } from "@/server/video/schema"

import { createFlow, deleteFlow, getFlow, listFlows, saveFlowGraph } from "./flows"
import {
  approveFlowStep,
  deleteFlowRuns,
  getFlowFiles,
  getFlowRun,
  listFlowRuns,
  redoFlowStep,
  renameFlowRun,
  retryFlowStep,
  saveFlowRun,
  startFlowRun,
  startFlowStep,
  stopFlowRun,
  type BoxChecks,
} from "./runs"
import { flowTick } from "./tick"

const writer = vi.hoisted(() => ({ answers: [] as unknown[], prompts: [] as string[], metadata: [] as unknown[] }))

// A file's address needs the storage settings, which a test database has none of.
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))
vi.mock("@/server/video/writer", () => ({
  askWriter: async ({ prompt, metadata }: { prompt: string; metadata: unknown }) => {
    writer.prompts.push(prompt)
    writer.metadata.push(metadata)
    const answer = writer.answers.shift()
    if (answer instanceof Error) throw answer
    // A function is something the person does while the AI is answering.
    if (typeof answer === "function") return await answer()
    return answer
  },
}))

// The paid makers, counted: each call is a payment.
const makers = vi.hoisted(() => ({ music: [] as { mood: string; forMs?: number; spend?: unknown }[], failMusicCall: 0 }))
vi.mock("@/server/video/ai-music", () => ({
  makeAiMusic: async (args: { mood: string; forMs?: number; spend?: unknown }) => {
    makers.music.push(args)
    if (makers.music.length === makers.failMusicCall) throw new Error("ElevenLabs said no.")
    return { media: { id: `music-${makers.music.length}` }, lengthMs: args.forMs ?? 60_000, cents: 30 }
  },
}))

// What is said in the raw video: "hello there" at 1s, "the good part" at 5s.
vi.mock("@/server/video/transcripts", () => ({
  fileWords: async () => [
    { text: "hello", startMs: 1000, endMs: 1400 },
    { text: "there", startMs: 1450, endMs: 1900 },
    { text: "the", startMs: 5000, endMs: 5200 },
    { text: "good", startMs: 5250, endMs: 5600 },
    { text: "part", startMs: 5650, endMs: 6100 },
  ],
  readSavedTranscript: async () => ({ words: [], transcriber: "gemini", durationMs: 10_000 }),
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
let projectId: string
const keys = ["CUSTOM_SHELL_GEMINI_API_KEY"] as const
const savedKeys = keys.map((key) => process.env[key])

const checks: BoxChecks = {
  linkIsVideo: (link) => link.startsWith("https://www.youtube.com/"),
  voices: async () => [{ id: "rachel", name: "Rachel", speaker: "elevenlabs" }],
}

async function insertMedia(id: string, fileType: "image" | "video" | "audio", owner = user.id) {
  const at = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: owner,
    filename: `${id}.bin`,
    originalName: `${id}.mp4`,
    fileSize: 8,
    mimeType: fileType === "video" ? "video/mp4" : "image/png",
    fileType,
    storagePath: `${owner}/${id}.bin`,
    createdAt: at,
    updatedAt: at,
  })
}

async function starterFlowId() {
  const flows = await listFlows(user.id, database)
  return flows.find((flow) => flow.name === "Transcript to video")!.id
}

function stepByNode(run: Awaited<ReturnType<typeof getFlowRun>>, nodeId: string) {
  return run.steps.find((step) => step.nodeId === nodeId)!
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  projectId = (await createOwnedProject(user.id, "Launch", database)).project.id
  for (const key of keys) process.env[key] = "test-key"
  writer.answers = []
  writer.prompts = []
  writer.metadata = []
  makers.music = []
  makers.failMusicCall = 0
})

afterEach(async () => {
  keys.forEach((key, index) => {
    if (savedKeys[index] === undefined) delete process.env[key]
    else process.env[key] = savedKeys[index]
  })
  await client.close()
})

describe("flows", () => {
  it("puts each starter in the table once, and a deleted one stays deleted", async () => {
    const first = await listFlows(user.id, database)
    expect(first.map((flow) => flow.name).sort()).toEqual(["Pomodoro study video", "Transcript to video"])
    expect(first.every((flow) => flow.nodeCount === 3 && flow.problemCount === 0 && flow.starter)).toBe(true)
    const pomodoro = first.find((flow) => flow.name === "Pomodoro study video")!
    await deleteFlow(user.id, pomodoro.id, database)
    expect((await listFlows(user.id, database)).map((flow) => flow.name)).toEqual(["Transcript to video"])
  })

  it("refuses a save from an older copy of the canvas", async () => {
    const flow = await createFlow(user.id, { name: "Mine" }, database)
    const node = createFlowNode("ai-text", { id: "a", x: 0, y: 0 })
    const saved = await saveFlowGraph(user.id, { flowId: flow.id, graph: { ...flow.graph, nodes: [node] }, version: flow.version }, database)
    expect(saved.version).toBe(flow.version + 1)
    await expect(saveFlowGraph(user.id, { flowId: flow.id, graph: flow.graph, version: flow.version }, database)).rejects.toThrow(
      FLOW_CHANGED_MESSAGE
    )
    expect((await getFlow(user.id, flow.id, database)).graph.nodes).toHaveLength(1)
  })

  it("never lets another person open or run someone's flow", async () => {
    const other = await insertUser(database, { email: "other@example.com" })
    const flowId = await starterFlowId()
    await expect(getFlow(other.id, flowId, database)).rejects.toThrow("Flow not found")
    await expect(startFlowRun(other.id, { flowId }, database)).rejects.toThrow("Flow not found")
  })
})

describe("a run of the starter flow", () => {
  it("adds no video to the project yet, and opens on the script", async () => {
    const videosBefore = await database.select().from(videoProjectVideos).where(eq(videoProjectVideos.projectId, projectId))
    const { runId } = await startFlowRun(user.id, { flowId: await starterFlowId() }, database)
    const run = await getFlowRun(user.id, runId, database)
    expect(run.videoId).toBeNull()
    expect(run.projectId).toBeNull()
    const videosAfter = await database.select().from(videoProjectVideos).where(eq(videoProjectVideos.projectId, projectId))
    expect(videosAfter).toHaveLength(videosBefore.length)
    expect(run.status).toBe("waiting")
    expect(run.steps.map((step) => [step.nodeId, step.status])).toEqual([
      ["script", "needs_input"],
      ["make-video", "waiting"],
      ["thumbnail", "waiting"],
    ])
    // Each step holds its own boxes; a line only brings the step before it.
    expect(stepByNode(run, "script").boxes.map((box) => box.label)).toEqual(["Transcript"])
    expect(stepByNode(run, "make-video").boxes.map((box) => box.label)).toEqual(["Raw video"])
    expect(stepByNode(run, "make-video").feedsFrom).toEqual(["Generate a script"])
  })

  it("never saves into a project that isn't the person's", async () => {
    const other = await insertUser(database, { email: "other@example.com" })
    const theirs = (await createOwnedProject(other.id, "Theirs", database)).project.id
    const { runId } = await startFlowRun(user.id, { flowId: await starterFlowId() }, database)
    await expect(saveFlowRun(user.id, { runId, projectId: theirs }, database)).rejects.toThrow("Project not found")
  })

  it("goes script with its transcript, OK with an edit, then the video with its upload, cut with captions", async () => {
    const { runId } = await startFlowRun(user.id, { flowId: await starterFlowId() }, database)
    let run = await getFlowRun(user.id, runId, database)

    // An empty transcript is refused, named, and the step still waits.
    await expect(
      startFlowStep(user.id, { stepId: stepByNode(run, "script").id, inputs: { transcript: { text: "  " } } }, database, checks)
    ).rejects.toThrow(flowInputMessage("Transcript", "text"))
    expect(stepByNode(await getFlowRun(user.id, runId, database), "script").status).toBe("needs_input")
    // Generate script keeps the transcript box, then starts it.
    run = await startFlowStep(
      user.id,
      { stepId: stepByNode(run, "script").id, inputs: { transcript: { text: "We talked about the good part." } } },
      database,
      checks
    )
    expect(stepByNode(run, "script").status).toBe("queued")
    expect(stepByNode(run, "script").input).toEqual({ transcript: { text: "We talked about the good part." } })
    expect(run.status).toBe("running")

    writer.answers.push({ text: "Open on the good part." })
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    const script = stepByNode(run, "script")
    // Wait for my OK is on in the starter.
    expect(script.error).toBe(null)
    expect(script.status).toBe("needs_ok")
    expect(script.output?.text).toBe("Open on the good part.")
    expect(writer.prompts[0].startsWith("Plan a short video script")).toBe(true)
    expect(writer.prompts[0]).toContain("### Transcript\nWe talked about the good part.")
    expect(writer.metadata[0]).toMatchObject({ flowRunId: runId, flowStepId: script.id })
    expect(writer.metadata[0]).not.toHaveProperty("projectId")
    expect(run.status).toBe("waiting")

    run = await approveFlowStep(user.id, { stepId: script.id, text: "Just the good part." }, database)
    expect(stepByNode(run, "script").output?.text).toBe("Just the good part.")
    // Ready, but a step waits for its own button.
    expect(stepByNode(run, "make-video").status).toBe("needs_input")
    await flowTick()
    expect(writer.prompts).toHaveLength(1)

    // The video's box takes videos only.
    await insertMedia("still", "image")
    await expect(
      startFlowStep(user.id, { stepId: stepByNode(run, "make-video").id, inputs: { "raw-video": { mediaIds: ["still"] } } }, database, checks)
    ).rejects.toThrow(flowInputMessage("Raw video", "notVideo"))
    await insertMedia("raw", "video")
    run = await startFlowStep(
      user.id,
      { stepId: stepByNode(run, "make-video").id, inputs: { "raw-video": { mediaIds: ["raw"] } } },
      database,
      checks
    )
    expect(stepByNode(run, "make-video").status).toBe("queued")

    // The AI keeps 4.9 to 6.3 seconds, which is cut to the words "the good part".
    writer.answers.push({ title: "Good part", captions: true, segments: [{ file: "F1", start: 4.9, end: 6.3 }] })
    writer.answers.push(new Error("Stop here"))
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "make-video").error).toBe(null)
    expect(stepByNode(run, "make-video").status).toBe("done")
    expect(writer.prompts[1]).toContain("### Generate a script\nJust the good part.")
    expect(writer.prompts[1]).toContain("[5.0-6.1] the good part")

    // Not saved yet: no video anywhere, and the run waits on its last step.
    expect(run.videoId).toBeNull()
    expect(run.status).toBe("waiting")
    // The last step waits for every step before it, the thumbnail too.
    await expect(saveFlowRun(user.id, { runId, projectId }, database)).rejects.toThrow(FLOW_RUN_NOT_DONE_MESSAGE)
    await database
      .update(videoFlowRunSteps)
      .set({ status: "done" })
      .where(eq(videoFlowRunSteps.id, stepByNode(run, "thumbnail").id))
    run = await saveFlowRun(user.id, { runId, projectId }, database)
    // Saved: the video goes into the project with the cut already on it.
    expect(run.projectId).toBe(projectId)
    expect(run.videoName).toBe("Transcript to video")
    await expect(saveFlowRun(user.id, { runId, projectId }, database)).rejects.toThrow("already saved")
    const video = await getOwnedVideo(user.id, run.videoId!, database)
    const timeline = timelineSchema.parse(video.timeline)
    const clips = timeline.tracks.flatMap((track) => track.clips)
    const cut = clips.find((clip) => clip.kind === "video")!
    expect(cut).toMatchObject({ mediaId: "raw", startMs: 0, trimStartMs: 5000, durationMs: 1100 })
    expect(clips.some((clip) => clip.kind === "text")).toBe(true)
    // The captions' lane is above the video's.
    expect(timeline.tracks[0].clips[0].kind).toBe("text")
  })

  it("shows only the person's own files in a box, in the order asked", async () => {
    const other = await insertUser(database, { email: "other@example.com" })
    await insertMedia("clip", "video")
    await insertMedia("still", "image")
    await insertMedia("theirs", "video", other.id)
    const files = await getFlowFiles(user.id, ["still", "theirs", "clip", "gone"], database)
    expect(files.map((file) => [file.id, file.fileType, file.name])).toEqual([
      ["still", "image", "still.mp4"],
      ["clip", "video", "clip.mp4"],
    ])
    expect(files[1].url).toBe(`https://media.test/${user.id}/clip.bin`)
  })

  it("starts a step with a box that can be left empty, left empty", async () => {
    const flow = await getFlow(user.id, await starterFlowId(), database)
    const graph = {
      ...flow.graph,
      nodes: flow.graph.nodes.map((node) =>
        node.id === "script"
          ? { ...node, settings: { ...node.settings, asks: [{ id: "transcript", kind: "text", label: "Transcript", optional: true }] } }
          : node
      ),
    }
    await saveFlowGraph(user.id, { flowId: flow.id, graph, version: flow.version }, database)
    const { runId } = await startFlowRun(user.id, { flowId: flow.id }, database)
    let run = await getFlowRun(user.id, runId, database)
    run = await startFlowStep(user.id, { stepId: stepByNode(run, "script").id, inputs: {} }, database, checks)
    expect(stepByNode(run, "script")).toMatchObject({ status: "queued", input: { transcript: {} } })
  })

  it("never takes another person's file as an upload", async () => {
    const other = await insertUser(database, { email: "other@example.com" })
    await insertMedia("theirs", "video", other.id)
    const { runId } = await startFlowRun(user.id, { flowId: await starterFlowId() }, database)
    await database.update(videoFlowRunSteps).set({ status: "needs_input" }).where(eq(videoFlowRunSteps.runId, runId))
    const run = await getFlowRun(user.id, runId, database)
    await expect(
      startFlowStep(user.id, { stepId: stepByNode(run, "make-video").id, inputs: { "raw-video": { mediaIds: ["theirs"] } } }, database, checks)
    ).rejects.toThrow(flowInputMessage("Raw video", "notYours"))
  })
})

describe("making steps again", () => {
  async function scriptMade() {
    const { runId } = await startFlowRun(user.id, { flowId: await starterFlowId() }, database)
    const run = await getFlowRun(user.id, runId, database)
    await startFlowStep(user.id, { stepId: stepByNode(run, "script").id, inputs: { transcript: { text: "Words." } } }, database, checks)
    return runId
  }

  it("fails a step with the reason, and Try again makes it again", async () => {
    const runId = await scriptMade()
    writer.answers.push(new Error("Google said no."))
    await flowTick()
    let run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "script")).toMatchObject({ status: "failed", error: "Google said no." })
    expect(run.status).toBe("failed")
    const bells = await database.select().from(customShellNotifications).where(eq(customShellNotifications.recipientUserId, user.id))
    expect(bells.some((bell) => bell.message?.includes("stopped at Generate a script"))).toBe(true)

    run = await retryFlowStep(user.id, { stepId: stepByNode(run, "script").id }, database)
    expect(stepByNode(run, "script").status).toBe("queued")
    writer.answers.push({ text: "Second go." })
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "script")).toMatchObject({ status: "needs_ok", attempts: 2 })
  })

  it("Make it again asks the AI once more", async () => {
    const runId = await scriptMade()
    writer.answers.push({ text: "First." })
    await flowTick()
    let run = await getFlowRun(user.id, runId, database)
    run = await redoFlowStep(user.id, { stepId: stepByNode(run, "script").id }, database)
    expect(stepByNode(run, "script")).toMatchObject({ status: "queued", output: null })
    writer.answers.push({ text: "Second." })
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "script").output?.text).toBe("Second.")
  })

  it("shows what each step cost from the meter", async () => {
    const runId = await scriptMade()
    writer.answers.push({ text: "Made." })
    await flowTick()
    let run = await getFlowRun(user.id, runId, database)
    const stepId = stepByNode(run, "script").id
    await database.insert(customShellAiUsageEvents).values({
      id: "usage-1",
      userId: user.id,
      provider: "gemini",
      model: "gemini-3.8-flash",
      feature: "flow_text",
      inputTokens: 10,
      outputTokens: 10,
      costCents: 3,
      status: "success",
      monthStart: "2026-11-01",
      metadata: { flowStepId: stepId },
      createdAt: now(),
    })
    await database.update(videoFlowRunSteps).set({ costCents: null }).where(eq(videoFlowRunSteps.id, stepId))
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "script").costCents).toBe(3)
    expect(run.spentCents).toBe(3)
  })

  it("drops what was made from an old script when the script is made again meanwhile", async () => {
    const runId = await scriptMade()
    writer.answers.push({ text: "Old script." })
    await flowTick()
    let run = await getFlowRun(user.id, runId, database)
    const scriptId = stepByNode(run, "script").id
    run = await approveFlowStep(user.id, { stepId: scriptId }, database)
    await insertMedia("raw", "video")
    run = await startFlowStep(
      user.id,
      { stepId: stepByNode(run, "make-video").id, inputs: { "raw-video": { mediaIds: ["raw"] } } },
      database,
      checks
    )
    // While the AI cuts the video, the person presses Make it again on the script.
    writer.answers.push(async () => {
      await redoFlowStep(user.id, { stepId: scriptId }, database)
      return { title: "Old cut", captions: false, segments: [{ file: "F1", start: 4.9, end: 6.3 }] }
    })
    writer.answers.push(new Error("Stop here"))
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "make-video")).toMatchObject({ status: "waiting", output: null })
    expect(stepByNode(run, "script").status).not.toBe("done")
  })

  it("does nothing more once stopped", async () => {
    const runId = await scriptMade()
    await stopFlowRun(user.id, runId, database)
    await flowTick()
    const run = await getFlowRun(user.id, runId, database)
    expect(run.status).toBe("stopped")
    expect(stepByNode(run, "script").status).toBe("queued")
    expect(writer.prompts).toEqual([])
  })
})

describe("the Runs table", () => {
  it("renames a run, keeping the old name for a blank one", async () => {
    const { runId } = await startFlowRun(user.id, { flowId: await starterFlowId() }, database)
    await renameFlowRun(user.id, { runId, name: "  Monday's video  " }, database)
    expect((await getFlowRun(user.id, runId, database)).flowName).toBe("Monday's video")
    await renameFlowRun(user.id, { runId, name: "   " }, database)
    expect((await getFlowRun(user.id, runId, database)).flowName).toBe("Monday's video")
  })

  it("deletes the person's runs, all or none, and never one being made", async () => {
    const flowId = await starterFlowId()
    const first = (await startFlowRun(user.id, { flowId }, database)).runId
    const second = (await startFlowRun(user.id, { flowId }, database)).runId
    const kept = (await startFlowRun(user.id, { flowId }, database)).runId
    const other = await insertUser(database, { email: "other@example.com" })
    await expect(deleteFlowRuns(other.id, { runIds: [first] }, database)).rejects.toThrow("Run not found")
    // One step being made holds back the whole batch.
    await database.update(videoFlowRunSteps).set({ status: "working" }).where(eq(videoFlowRunSteps.runId, second))
    await expect(deleteFlowRuns(user.id, { runIds: [first, second] }, database)).rejects.toThrow(FLOW_RUN_BUSY_MESSAGE)
    expect(await listFlowRuns(user.id, database)).toHaveLength(3)
    await database.update(videoFlowRunSteps).set({ status: "queued" }).where(eq(videoFlowRunSteps.runId, second))
    expect(await deleteFlowRuns(user.id, { runIds: [first, second] }, database)).toEqual({ deleted: 2 })
    expect((await listFlowRuns(user.id, database)).map((run) => run.id)).toEqual([kept])
    expect(await database.select().from(videoFlowRunSteps).where(eq(videoFlowRunSteps.runId, first))).toEqual([])
  })
})

describe("the AI editor", () => {
  /** A flow of one AI editor that asks OK first. */
  async function editorRun() {
    const flow = await createFlow(user.id, { name: "Study" }, database)
    const node = createFlowNode("ai-video", { id: "editor", x: 0, y: 0 })
    node.settings = { ...node.settings, title: "Make the study video", prompt: "Two rounds of lofi.", waitForOk: true }
    await saveFlowGraph(user.id, { flowId: flow.id, graph: { ...flow.graph, nodes: [node] }, version: flow.version }, database)
    const { runId } = await startFlowRun(user.id, { flowId: flow.id }, database)
    const run = await getFlowRun(user.id, runId, database)
    await startFlowStep(user.id, { stepId: stepByNode(run, "editor").id, inputs: {} }, database, checks)
    return runId
  }

  const plan = {
    title: "Study",
    frame: "16:9",
    actions: [
      {
        do: "repeat",
        times: 2,
        every: 180,
        actions: [
          { do: "make_music", id: "M{n}", mood: "lofi round {n}", seconds: 60 },
          { do: "place", file: "M{n}", from: 0, to: 120, role: "music", crossfade: 3 },
          { do: "timer", from: 0, to: 120, above: "FOCUS", below: "Round {n}/2" },
        ],
      },
    ],
  }

  it("shows its plan and price first and pays for nothing until OK", async () => {
    const runId = await editorRun()
    writer.answers.push(plan)
    await flowTick()
    let run = await getFlowRun(user.id, runId, database)
    const step = stepByNode(run, "editor")
    expect(step).toMatchObject({ status: "needs_ok", planned: true })
    expect(step.output?.text).toContain("M1: 1:00 of music")
    expect(makers.music).toEqual([])

    run = await approveFlowStep(user.id, { stepId: step.id }, database)
    expect(stepByNode(run, "editor").status).toBe("queued")
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "editor").status).toBe("done")
    expect(makers.music.map((call) => call.mood)).toEqual(["lofi round 1", "lofi round 2"])
    expect(makers.music[0].spend).toMatchObject({ flowRunId: runId, flowStepId: step.id })
    // Laid on the run, wide, with its timers and music, nothing ducked.
    const [saved] = await database.select().from(videoFlowRuns).where(eq(videoFlowRuns.id, runId))
    expect(saved.timeline?.aspect).toBe("16:9")
    const clips = saved.timeline!.tracks.flatMap((track) => track.clips)
    expect(clips.filter((clip) => clip.shape === "timer")).toHaveLength(2)
    expect(clips.filter((clip) => clip.mediaId === "music-1").length).toBeGreaterThan(1)
    expect(saved.timeline!.tracks.every((track) => !track.duck)).toBe(true)
  })

  it("never pays twice: Try again keeps what was made, Make it again starts over", async () => {
    const runId = await editorRun()
    writer.answers.push(plan)
    await flowTick()
    let run = await getFlowRun(user.id, runId, database)
    await approveFlowStep(user.id, { stepId: stepByNode(run, "editor").id }, database)
    makers.failMusicCall = 2
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "editor")).toMatchObject({ status: "failed", error: "ElevenLabs said no." })

    run = await retryFlowStep(user.id, { stepId: stepByNode(run, "editor").id }, database)
    await flowTick()
    run = await getFlowRun(user.id, runId, database)
    expect(stepByNode(run, "editor").status).toBe("done")
    // Round 1's music once, round 2's twice (the refused try and the made one).
    expect(makers.music.map((call) => call.mood)).toEqual(["lofi round 1", "lofi round 2", "lofi round 2"])

    run = await redoFlowStep(user.id, { stepId: stepByNode(run, "editor").id }, database)
    const [step] = await database.select().from(videoFlowRunSteps).where(eq(videoFlowRunSteps.id, stepByNode(run, "editor").id))
    expect(step.state).toBeNull()
  })
})
