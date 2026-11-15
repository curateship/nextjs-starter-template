import type { AutomationGraph } from "@/lib/automations/graph"

import { createFlowBox, createFlowNode, readFlowNodeSettings, storedFlowSettings } from "./node-kinds"

/** The starter's name, also what a new flow from it is called. */
const STARTER_FLOW_NAME = "Transcript to video"

const STARTER_FLOW_DESCRIPTION =
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
    prompt:
      "Use the frame where the speaker looks most surprised. Change it into a YouTube thumbnail photo: the main person big and sharp with a strong expression, a simple bright background, no words in the picture. Put the video's main promise on it in up to five words, white Anton capitals with a black outline, lower on the left.",
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

export const POMODORO_FLOW_NAME = "Pomodoro study video"

export const POMODORO_FLOW_DESCRIPTION =
  "A three-hour study video: a cosy rainy café that moves on a loop, a timer for six 25-minute rounds with 5-minute breaks, lofi, rain and a chime, and a thumbnail."

/**
 * Tyler's Pomodoro video (14 Nov 2026, workspace/tasks/flow/02-pomodoro-flow.md),
 * like Study Pomodoro's "25/5 Pomodoro Timer | Cozy Coffee Shop with lofi".
 * There is nothing Pomodoro in the app: it is these three nodes and their
 * prompts ("We shouldnt be building a node for every video type. The
 * parameters, data or instructions should just be a prompt Ai can use on
 * existing video editors tools"). His answers are in the prompts: a ring
 * timer with FOCUS or BREAK and the round, a new lofi track each round, rain
 * only in breaks, rain all the way, a chime at each change, the loop on
 * Seedance at 1080p, nothing on the video but the timer, and the thumbnail
 * like the reference with Fredoka. The AI editor shows its plan and price
 * and waits for his OK before it pays for anything.
 */
export function pomodoroFlowGraph(): AutomationGraph {
  const cafe = createFlowNode("ai-picture", { id: "cafe", x: 0, y: 0 })
  cafe.settings = storedFlowSettings({
    ...readFlowNodeSettings(cafe.settings),
    title: "Café window",
    prompt:
      "A wide 16:9 photograph: a photoreal, cosy café at night seen from inside. A large window streaked with rain fills most of the frame, soft blurred lights outside. Inside, warm lamp light, a steaming cup of coffee, a few books and plants on the wooden sill. Calm and quiet. No people, no words, no logos. Keep the middle of the frame calm and darkish so a white timer reads well over it.",
    heading: "The scene",
    line: "A cosy café in the rain, painted by AI",
    button: "Paint the scene",
  })
  const study = createFlowNode("ai-video", { id: "study", x: 340, y: 0 })
  study.settings = storedFlowSettings({
    ...readFlowNodeSettings(study.settings),
    title: "Make the study video",
    waitForOk: true,
    asks: [{ ...createFlowBox("media", "scene"), label: "Your scene", optional: true }],
    prompt: [
      "Make a 3-hour Pomodoro study video, frame 16:9, no captions. Nothing is written on the video except the timer.",
      "Scene: use the picture in Your scene if there is one, otherwise the café picture. Animate it with Seedance, quality 1080p, no sound, into one 8-second loop that ends on the picture it starts on. The camera stays completely still; only the rain on the glass, the steam from the cup and the lights outside move, gently. Call it L1.",
      "Then repeat 6 times, every 1800 seconds:",
      "- place L1 as the background from 0 to 1800, looping, filling the frame.",
      '- a timer from 0 to 1500, centred (x 0.5, y 0.5, size 0.42), white, font fredoka, ring width 5, above "FOCUS", below "Round {n}/6".',
      '- a timer from 1500 to 1800, the same, with above "BREAK".',
      '- make music M{n}, 300 seconds: "warm lofi hip hop for studying, soft dusty drums, mellow electric piano, vinyl crackle, slow and calm", a little different each round. Place M{n} as music from 0 to 1500, volume 0.6, crossfade 3, fade out 3.',
      "- no music in the break.",
      '- starter sound "chime" at 1500.',
      'Also a starter sound "chime" at the start of rounds 2 to 6 (repeat 5 times every 1800 from 1800).',
      'Make one sound RAIN, 30 seconds, looping: "steady gentle rain on a café window, no thunder". Place it as ambience from 0 to 10800, looping, volume 0.35, fade in 3, fade out 3.',
    ].join("\n"),
    heading: "The study video",
    line: "Three hours: the scene on a loop, the timer, lofi, rain and chimes",
    explanation:
      "Pick a picture of your own in Your scene, or leave it empty for the AI café. Press the button and the AI shows its plan and what it costs; nothing is paid for until you press OK.",
    tip: "Making it takes a few minutes: the moving scene is made by a video model, and each music track by ElevenLabs.",
    button: "Plan the video",
  })
  const thumbnail = createFlowNode("ai-thumbnail", { id: "thumbnail", x: 680, y: 0 })
  thumbnail.settings = storedFlowSettings({
    ...readFlowNodeSettings(thumbnail.settings),
    title: "Thumbnail",
    prompt:
      'Use the scene picture (P1) as it is, as the whole background, with a dark shade at the top. Put "STUDY POMODORO" in white fredoka, size 96, centred at the top (y 0.09). Draw a thin white ring centred at x 0.5, y 0.56, size 0.56, width 8. Inside it, "25/05" in white fredoka, size 200, centred at x 0.5, y 0.56. No other words.',
    heading: "Thumbnail",
    line: "The scene, the title and the ring",
    button: "Make the thumbnail",
  })
  return {
    nodes: [cafe, study, thumbnail],
    edges: [
      { id: "cafe-study", from: "cafe", sourcePort: "out", to: "study" },
      { id: "study-thumbnail", from: "study", sourcePort: "out", to: "thumbnail" },
    ],
    viewport: { x: 60, y: 160, zoom: 0.8 },
  }
}

/**
 * The starter flows, each put in a person's Flows table once (drizzle/0179).
 * They are ordinary flows from then on: changed, duplicated or deleted.
 */
export const FLOW_STARTERS = [
  { key: "transcript", name: STARTER_FLOW_NAME, description: STARTER_FLOW_DESCRIPTION, graph: starterFlowGraph },
  { key: "pomodoro", name: POMODORO_FLOW_NAME, description: POMODORO_FLOW_DESCRIPTION, graph: pomodoroFlowGraph },
] as const
