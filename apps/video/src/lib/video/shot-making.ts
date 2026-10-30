import type { VideoChoices } from "@/lib/api/video/generations"
import type { VideoQuality } from "@/lib/video/asset-factories"
import { sizeFor, type VideoCompany } from "@/lib/video/video-models"

/**
 * Who makes a shot and how: the model, the size, and on Seedance whether it
 * makes its own sound (`workspace/docs/wan-and-seedance.md`).
 */
export type ShotMakingPick = {
  company: VideoCompany
  quality: VideoQuality
  sound: boolean
}

/**
 * What a new shot starts on: the company from Settings → AI video, at that
 * company's starting size and sound. Google's size is the last one used.
 */
export function startingPick(choices: VideoChoices): ShotMakingPick {
  const start = choices.starts[choices.company]
  return { company: choices.company, quality: start.size, sound: start.sound }
}

/** Switching company starts on that company's own size and sound. */
export function pickCompany(choices: VideoChoices, company: VideoCompany): ShotMakingPick {
  const start = choices.starts[company]
  return { company, quality: sizeFor(company, start.size), sound: start.sound }
}
