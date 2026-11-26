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
  "A three-hour study video: a calm scene that moves on a loop, a timer for six 25-minute rounds with 5-minute breaks, lofi, the scene's own ambience and a chime, and a thumbnail."

/**
 * Tyler's Pomodoro video (14 Nov 2026, workspace/tasks/flow/02-pomodoro-flow.md;
 * split into its own clip, music and ambience steps on 25 Nov 2026, task 04),
 * like Study Pomodoro's "25/5 Pomodoro Timer | Cozy Coffee Shop with lofi".
 * There is nothing Pomodoro in the app: it is these six nodes and their
 * prompts ("We shouldnt be building a node for every video type. The
 * parameters, data or instructions should just be a prompt Ai can use on
 * existing video editors tools"). His answers are in the prompts and
 * settings: a ring timer with FOCUS or BREAK and the round, a new lofi track
 * each round, the ambience all the way and no music in the breaks, a chime at
 * each change, the loop on Seedance at 1080p, nothing on the video but the
 * timer, and the thumbnail like the reference with Fredoka. The clip, the
 * music and the ambience each show their price first and wait for his OK once
 * made; the AI editor only puts them together and makes nothing.
 *
 * The prompts say only how every video of the channel is built, never a
 * scene (Tyler, 25 Nov 2026: "the flow's prompt is mainly for the structure
 * of the video. It should never discribes a scene"). Each run's scene, and
 * what moves in it, is the AI's idea in that run's Prompt cards, edited
 * before each step is made.
 */
export function pomodoroFlowGraph(): AutomationGraph {
  const scene = createFlowNode("ai-picture", { id: "scene", x: 0, y: 0 })
  scene.settings = storedFlowSettings({
    ...readFlowNodeSettings(scene.settings),
    title: "Scene picture",
    suggestPrompt: true,
    prompt:
      "A wide 16:9 photograph, photoreal: a calm, cosy place to study, the scene this video's prompt describes. Calm and quiet. No people, no words, no logos. Keep the middle of the frame calm and darkish so a white timer reads well over it. Put in a few small things that could move gently in a loop, such as rain, snow, steam, a flame, leaves or distant lights.",
    heading: "The scene",
    line: "This video's scene, painted by AI",
    explanation: "The Prompt card on the right holds an idea for this video's scene, different from your earlier videos. Change any of it, or press New idea, then paint it.",
    button: "Paint the scene",
  })
  // Tyler, 25 Nov 2026: "After scene picture should be "Generate video"".
  // His 14 Nov picks for the loop: Seedance at 1080p, 8 seconds ending on its
  // start, silent, the camera still.
  const clip = createFlowNode("ai-clip", { id: "clip", x: 340, y: 0 })
  clip.settings = storedFlowSettings({
    ...readFlowNodeSettings(clip.settings),
    title: "Generate video",
    waitForOk: true,
    suggestPrompt: true,
    clip: { company: "seedance", size: "1080p", seconds: 8, loops: true, sound: false },
    asks: [{ ...createFlowBox("media", "scene"), label: "Your scene", optional: true }],
    prompt:
      "Make the picture move gently in a seamless loop. The camera stays completely still: no pan, no zoom, no cut. Only the small things this video's prompt names move, slowly and calmly, so it can repeat for three hours without the join showing.",
    heading: "The moving scene",
    line: "This video's scene, moving on a loop",
    explanation:
      "The Prompt card says what moves in this video's scene. Pick a picture of your own in Your scene to make that move instead. Press the button to see the price; nothing is paid for until you press OK.",
    tip: "Making a clip takes a few minutes. This page looks again by itself, and the bell rings if you leave.",
    button: "Make the clip",
  })
  const music = createFlowNode("ai-music", { id: "music", x: 680, y: 0 })
  music.settings = storedFlowSettings({
    ...readFlowNodeSettings(music.settings),
    title: "Make the music",
    waitForOk: true,
    suggestPrompt: true,
    music: { service: "elevenlabs", tracks: 6, seconds: 300 },
    prompt: "Warm lofi hip hop for studying: soft dusty drums, mellow electric piano, vinyl crackle, slow and calm. Instrumental, no vocals.",
    heading: "The music",
    line: "Six lofi tracks, one for each focus round",
    explanation: "The Prompt card holds this video's mood, suggested from its scene. Press the button to see the price; listen to the tracks once they are made.",
    button: "Make the music",
  })
  const ambience = createFlowNode("ai-sound", { id: "ambience", x: 1020, y: 0 })
  ambience.settings = storedFlowSettings({
    ...readFlowNodeSettings(ambience.settings),
    title: "Make the ambience",
    waitForOk: true,
    suggestPrompt: true,
    sound: { seconds: 30, loops: true },
    prompt: "A steady, gentle background sound that fits this video's scene, such as rain, a crackling fire or wind. No sudden noises, no music, no voices. It loops.",
    heading: "The ambience",
    line: "The sound of the scene, under the whole video",
    explanation: "The Prompt card holds what this video's scene sounds like. Press the button to see the price; listen to it once it is made.",
    button: "Make the ambience",
  })
  const study = createFlowNode("ai-video", { id: "study", x: 1360, y: 0 })
  study.settings = storedFlowSettings({
    ...readFlowNodeSettings(study.settings),
    title: "Make the study video",
    waitForOk: true,
    prompt: [
      "Make a 3-hour Pomodoro study video, frame 16:9, no captions. Nothing is written on the video except the timer.",
      "Use only the files connected, and make nothing new: the moving clip C1 from Generate video, the six music tracks from Make the music (S1 to S6, in order) and the sound from Make the ambience (S7).",
      "Repeat 6 times, every 1800 seconds:",
      "- place C1 as the background from 0 to 1800, looping, filling the frame.",
      '- a timer from 0 to 1500, centred (x 0.5, y 0.5, size 0.42), white, font fredoka, ring width 5, above "FOCUS", below "Round {n}/6".',
      '- a timer from 1500 to 1800, the same, with above "BREAK".',
      "- place S{n} as music from 0 to 1500, volume 0.6, fade in 3, fade out 3.",
      "- no music in the break.",
      '- starter sound "chime" at 1500.',
      'Also a starter sound "chime" at the start of rounds 2 to 6 (repeat 5 times every 1800 from 1800).',
      "Place S7 as ambience from 0 to 10800, looping, volume 0.35, fade in 3, fade out 3.",
    ].join("\n"),
    heading: "The study video",
    line: "Three hours: the clip on a loop, the timer, the music, the ambience and chimes",
    explanation: "This step puts together what the steps before it made. Press the button and the AI shows its plan; nothing new is made or paid for here.",
    button: "Put it together",
  })
  const thumbnail = createFlowNode("ai-thumbnail", { id: "thumbnail", x: 1700, y: 0 })
  thumbnail.settings = storedFlowSettings({
    ...readFlowNodeSettings(thumbnail.settings),
    title: "Thumbnail",
    suggestPrompt: true,
    prompt:
      'Use the scene picture (P1) as it is, as the whole background, with a dark shade at the top. Put "STUDY POMODORO" in white fredoka, size 96, centred at the top (y 0.09). Draw a thin white ring centred at x 0.5, y 0.56, size 0.56, width 8. Inside it, "25/05" in white fredoka, size 200, centred at x 0.5, y 0.56. No other words.',
    heading: "Thumbnail",
    line: "The scene, the title and the ring",
    button: "Make the thumbnail",
  })
  // One after another, his pick. The music and the ambience also read the
  // scene, so their ideas fit it; the study video reads the clip and sounds.
  const line = (from: string, to: string) => ({ id: `${from}-${to}`, from, sourcePort: "out", to })
  return {
    nodes: [scene, clip, music, ambience, study, thumbnail],
    edges: [
      line("scene", "clip"),
      line("scene", "music"),
      line("clip", "music"),
      line("scene", "ambience"),
      line("music", "ambience"),
      line("clip", "study"),
      line("music", "study"),
      line("ambience", "study"),
      line("study", "thumbnail"),
    ],
    viewport: { x: 60, y: 160, zoom: 0.6 },
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
