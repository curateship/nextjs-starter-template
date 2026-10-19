import { z } from "zod"

import type { DatingSettings } from "@/lib/dating/settings"
import type { ProfileHandles, ProfileSection } from "@/server/tinder/schema"

/**
 * The AI's read of one Tinder card: a fit score out of 100 against what the
 * member wrote they want, three lines in plain words, the red flags only
 * photos and words can show, and which of the member's dealbreakers it hits.
 * The flags a card shows by itself (no bio, one photo, outside the age range)
 * are worked out without the AI, in `../ai.ts`.
 */

export const CARD_AI_FLAGS = ["photos_generated", "photos_filtered", "far_away"] as const

export const readCardAnswer = z.object({
  score: z.number().int().min(0).max(100),
  read: z.array(z.string().max(300)).min(1).max(3),
  flags: z.array(z.enum(CARD_AI_FLAGS)).max(3),
  dealbreakers: z.array(z.string().max(200)).max(10),
})

export const readCardJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "read", "flags", "dealbreakers"],
  properties: {
    score: { type: "integer", description: "How well this person fits what the member wants, 0 to 100." },
    read: {
      type: "array",
      description: "Exactly three short lines in plain words: who they seem to be, what fits, what does not.",
      items: { type: "string" },
    },
    flags: { type: "array", items: { type: "string", enum: [...CARD_AI_FLAGS] } },
    dealbreakers: {
      type: "array",
      description: "Each of the member's own dealbreakers this card clearly hits, in the member's words. Empty when none.",
      items: { type: "string" },
    },
  },
}

export function readCardSystem(settings: Pick<DatingSettings, "lookingFor" | "dealbreakers" | "ageMin" | "ageMax">): string {
  return [
    "You read one Tinder profile for a member of a dating app and judge how well the person fits what the member wants.",
    "",
    "What the member is looking for, in their words:",
    settings.lookingFor.trim() || "(They have not said. Judge on warmth, effort and clear photos.)",
    "",
    "The member's dealbreakers, in their words:",
    settings.dealbreakers.trim() || "(None given.)",
    "",
    `The member wants someone aged ${settings.ageMin} to ${settings.ageMax}.`,
    "",
    "How to answer:",
    "- score: 0 to 100 for fit with what the member wants. Someone outside the age range scores low.",
    "- read: three short lines a friend would say, in plain words. Only what the photos and words actually show; never invent a job, a hobby or anything else that is not on the card.",
    "- flags: photos_generated when the photos look made by AI; photos_filtered when they are heavily filtered or edited; far_away only when the member names a distance and this person is clearly further.",
    "- dealbreakers: each of the member's dealbreakers this card clearly hits, quoting the member's words. Leave it empty when you are not sure.",
  ].join("\n")
}

export type CardForAi = {
  name: string
  age: number | null
  distance: string
  verified: boolean
  bio: string
  job: string
  school: string
  livesIn: string
  sections: ProfileSection[]
  handles: ProfileHandles
  texts: string[]
  photos: number
}

export function readCardText(card: CardForAi): string {
  const lines = [
    `The ${card.photos} picture${card.photos === 1 ? " above is" : "s above are"} this person's photos, in their order.`,
    "",
    `Name: ${card.name}`,
    `Age: ${card.age ?? "not shown"}`,
    `Distance: ${card.distance || "not shown"}`,
    `Photo verified: ${card.verified ? "yes" : "no"}`,
    `Bio: ${card.bio || "(none)"}`,
    `Job: ${card.job || "(none)"}`,
    `School: ${card.school || "(none)"}`,
    `Lives in: ${card.livesIn || "(not shown)"}`,
  ]
  for (const section of card.sections) lines.push(`${section.heading}: ${section.items.join("; ")}`)
  if (card.handles.instagram) lines.push(`Instagram: ${card.handles.instagram}`)
  if (card.handles.spotifyArtists?.length) lines.push(`Top Spotify artists: ${card.handles.spotifyArtists.join(", ")}`)
  if (card.handles.anthem) lines.push(`Anthem: ${card.handles.anthem}`)
  lines.push("", "Every line read off the card, in order:", ...card.texts.map((text) => `- ${text}`))
  return lines.join("\n")
}
