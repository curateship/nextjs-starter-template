import { z } from "zod"

import type { ProfileSection } from "@/server/tinder/schema"

/**
 * The AI's suggestions for the member's own Tinder profile: an order for the
 * photos with a line on each, a rewritten bio, and a few notes. Suggestions
 * only; nothing on the phone is ever changed.
 */

export const reviewAnswer = z.object({
  photoOrder: z.array(z.object({ photo: z.number().int().min(1).max(9), why: z.string().max(300) })).max(9),
  bio: z.string().max(1_000),
  notes: z.array(z.string().max(300)).max(5),
})

export const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["photoOrder", "bio", "notes"],
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
    bio: { type: "string", description: "A rewritten bio in the member's own voice, built only from what their profile says." },
    notes: { type: "array", description: "Up to five short suggestions in plain words.", items: { type: "string" } },
  },
}

export const REVIEW_SYSTEM = [
  "You review a member's own Tinder profile and suggest how to make it work better.",
  "- Put the photos in the order that makes the best first impression: a clear, smiling face first, then variety. Say why in one line each.",
  "- Rewrite the bio in their own voice, using only what the profile already says. Never invent a fact about them.",
  "- Add up to five short notes on anything else worth changing.",
].join("\n")

export function reviewText(profile: { name: string; bio: string; sections: ProfileSection[]; photos: number }): string {
  return [
    `The ${profile.photos} picture${profile.photos === 1 ? " above is" : "s above are"} ${profile.name || "the member"}'s photos, in their current order.`,
    `Bio: ${profile.bio || "(none)"}`,
    ...profile.sections.map((section) => `${section.heading}: ${section.items.join("; ")}`),
  ].join("\n")
}
