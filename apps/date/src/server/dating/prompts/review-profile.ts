import { z } from "zod"

import type { ProfilePrompt, ProfileSection } from "@/server/tinder/schema"

/**
 * The AI's suggestions for the member's own Tinder profile: an order for the
 * photos with a line on each, a rewritten bio, a new answer for each prompt,
 * and a few notes. Nothing on the phone changes until the member presses
 * Apply on one of them.
 *
 * Prompt answers are written from About me only (Tyler, 18 Oct 2026), the
 * member's own words in the Dating settings, so the AI never makes up a fact
 * about them. When About me is too thin to answer from, or the old answer is
 * better, the answer is "keep".
 */

/** The most Tinder takes in a bio. */
export const TINDER_BIO_MAX = 500

export const reviewAnswer = z.object({
  photoOrder: z.array(z.object({ photo: z.number().int().min(1).max(9), why: z.string().max(300) })).max(9),
  bio: z.string().max(1_000),
  prompts: z.array(z.object({ prompt: z.number().int().min(1).max(10), keep: z.boolean(), answer: z.string().max(500) })).max(10),
  notes: z.array(z.string().max(300)).max(5),
})

export const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["photoOrder", "bio", "prompts", "notes"],
  properties: {
    photoOrder: {
      type: "array",
      description: "Every photo, in the order to show them. photo is its number in the current order, starting at 1.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["photo", "why"],
        properties: { photo: { type: "integer" }, why: { type: "string" } },
      },
    },
    bio: { type: "string", description: `A rewritten bio in the member's own voice, built only from what their profile says, at most ${TINDER_BIO_MAX} characters.` },
    prompts: {
      type: "array",
      description: "One entry per prompt, by its number. keep is true when the old answer is better or About me does not say enough to answer; answer is then empty.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "keep", "answer"],
        properties: { prompt: { type: "integer" }, keep: { type: "boolean" }, answer: { type: "string" } },
      },
    },
    notes: { type: "array", description: "Up to five short suggestions in plain words.", items: { type: "string" } },
  },
}

export const REVIEW_SYSTEM = [
  "You review a member's own Tinder profile and suggest how to make it work better.",
  "- Put the photos in the order that makes the best first impression: a clear, smiling face first, then variety. Say why in one line each.",
  `- Rewrite the bio in their own voice, using only what the profile already says, in at most ${TINDER_BIO_MAX} characters. Never invent a fact about them.`,
  "- Write a new answer for each prompt using only what About me says. Every fact in an answer must be in About me. If About me does not say enough to answer it, or the old answer is better, set keep to true.",
  "- Add up to five short notes on anything else worth changing.",
].join("\n")

export function reviewText(profile: { name: string; bio: string; sections: ProfileSection[]; photos: number; prompts: ProfilePrompt[]; aboutMe: string }): string {
  return [
    `The ${profile.photos} picture${profile.photos === 1 ? " above is" : "s above are"} ${profile.name || "the member"}'s photos, in their current order.`,
    `Bio: ${profile.bio || "(none)"}`,
    ...profile.sections.filter((section) => section.heading !== "Prompts").map((section) => `${section.heading}: ${section.items.join("; ")}`),
    profile.prompts.length ? "Prompts:" : "Prompts: (none)",
    ...profile.prompts.map((prompt, index) => `${index + 1}. ${prompt.question} Answer now: ${prompt.answer || "(empty)"}`),
    `About me, the only facts a prompt answer may use: ${profile.aboutMe.trim() || "(empty)"}`,
  ].join("\n")
}
