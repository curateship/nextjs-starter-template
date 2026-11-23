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

/**
 * A card the member swiped against the AI's score: its short read, its score,
 * and whether they liked or passed it. Text only, no photos, to keep the cost
 * down. Tyler's choice, 18 Oct 2026. They go with the card's own words rather
 * than in the instructions, because the reads were written from strangers'
 * cards.
 */
export type OverruledCard = { read: string[]; score: number; liked: boolean }

function overruledLines(overruled: OverruledCard[]): string[] {
  if (!overruled.length) return []
  return [
    "Earlier cards where the member went against your score, newest first. Move your scores toward their taste:",
    ...overruled.map((card) => `- Scored ${card.score}, the member ${card.liked ? "liked it" : "passed it"}. ${card.read.join(" ")}`),
    "",
    "The card to score now:",
    "",
  ]
}

export function readCardSystem(settings: Pick<DatingSettings, "lookingFor" | "dealbreakers" | "ageMin" | "ageMax">, appName = "Tinder"): string {
  return [
    `You read one ${appName} profile for a member of a dating app and judge how well the person fits what the member wants.`,
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
  /** Pictures from their Instagram that the card shows, after their photos (part 12 of "facebook/01"). */
  instagramPhotos?: number
  /** Facebook Dating's mutual friends and the groups both are in (part 11). */
  mutualFriends?: number | null
  sharedGroups?: string[]
}

export function readCardText(card: CardForAi, overruled: OverruledCard[] = []): string {
  const lines = [
    ...overruledLines(overruled),
    card.instagramPhotos
      ? `The first ${card.photos} picture${card.photos === 1 ? " above is" : "s above are"} this person's photos, in their order, and the last ${card.instagramPhotos} ${card.instagramPhotos === 1 ? "is" : "are"} from their Instagram.`
      : `The ${card.photos} picture${card.photos === 1 ? " above is" : "s above are"} this person's photos, in their order.`,
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
  if (card.mutualFriends) lines.push(`Mutual friends with the member: ${card.mutualFriends}`)
  if (card.sharedGroups?.length) lines.push(`Groups both are in: ${card.sharedGroups.join(", ")}`)
  lines.push("", "Every line read off the card, in order:", ...card.texts.map((text) => `- ${text}`))
  return lines.join("\n")
}
