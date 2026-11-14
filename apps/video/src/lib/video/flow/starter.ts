import type { AutomationGraph } from "@/lib/automations/graph"

import { createFlowBox, createFlowNode, readFlowNodeSettings, storedFlowSettings } from "./node-kinds"

/** The starter's name, also what a new flow from it is called. */
export const STARTER_FLOW_NAME = "Transcript to video"

export const STARTER_FLOW_DESCRIPTION =
  "Paste a transcript and the AI plans a script, upload the raw video and the AI cuts it to the script, then it makes a thumbnail."

/**
 * Tyler's example (14 Nov 2026): "first node is paste a transcript, second
 * node is an Ai node that plan a script based on that transcript, 3rd node
 * is the raw video upload node, 4th node is the ai video node where ai create
 * the video based on the script and video and 5th node is the thumbnail
 * creator node". The transcript and the raw video are boxes on the nodes that
 * use them, not nodes of their own ("paste a transcript is not a step.
 * Generate a script is."), so it is three nodes. The script waits for his OK,
 * so he can read and change it before the video is cut. The prompts are a
 * start he is meant to rewrite.
 */
export function starterFlowGraph(): AutomationGraph {
  const script = createFlowNode("ai-text", { id: "script", x: 0, y: 0 })
  script.settings = storedFlowSettings({
    ...readFlowNodeSettings(script.settings),
    title: "Generate a script",
    prompt:
      "Plan a short video script from this transcript. Keep the speaker's own words where they are strongest, open on the best line, and cut everything that repeats.",
    waitForOk: true,
    asks: [{ ...createFlowBox("text", "transcript"), label: "Transcript" }],
    button: "Generate script",
    heading: "Script",
    line: "How the AI reads your transcript",
    explanation: "Paste the transcript of your talk or interview. The AI reads it and plans a script for the video.",
    tip: "Speaker names and timestamps help the AI keep the order right.",
  })
  const video = createFlowNode("ai-video", { id: "make-video", x: 340, y: 0 })
  video.settings = storedFlowSettings({
    ...readFlowNodeSettings(video.settings),
    title: "Make the video",
    prompt:
      "Cut the raw video so it follows the script, in the script's order. Keep only the stretches where the speaker says the script's lines, and add captions.",
    asks: [{ ...createFlowBox("video", "raw-video"), label: "Raw video" }],
    heading: "Video",
    line: "Your raw video, cut to the script",
    explanation: "Upload the raw video. The AI keeps the stretches where you say the script's lines, in the script's order, and adds captions.",
  })
  const thumbnail = createFlowNode("ai-thumbnail", { id: "thumbnail", x: 680, y: 0 })
  thumbnail.settings = storedFlowSettings({
    ...readFlowNodeSettings(thumbnail.settings),
    title: "Make a thumbnail",
    prompt: "Pick the frame where the speaker looks most surprised and put the video's main promise on it in three words.",
  })
  return {
    nodes: [script, video, thumbnail],
    edges: [
      { id: "script-video", from: "script", sourcePort: "out", to: "make-video" },
      { id: "video-thumbnail", from: "make-video", sourcePort: "out", to: "thumbnail" },
    ],
    viewport: { x: 60, y: 160, zoom: 0.8 },
  }
}
