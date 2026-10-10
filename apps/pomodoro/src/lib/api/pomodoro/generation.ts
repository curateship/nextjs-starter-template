import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { billingEnabled } from "@/server/billing/stripe"
import { userGet, userPost } from "@/server/guards"
import { loadAccountStorage } from "@/server/media/library"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { generationKeysConfigured } from "@/server/pomodoro/generation-providers"
import {
  listGenerations,
  loadGenerationAllowance,
  requestGenerations,
  type GenerationRow,
} from "@/server/pomodoro/generation"
import {
  listStartingPictures,
  loadOwnPicture,
  type StartingPictureOption,
} from "@/server/pomodoro/generation-pictures"
import {
  GENERATION_STYLE_KEYS,
  PROMPT_MAX_LENGTH,
  PROMPT_MIN_LENGTH,
  type GenerationKind,
  type GenerationStyleKey,
} from "@/lib/pomodoro/generation"

export type { GenerationRow }

/** What the generator panel needs to draw itself. */
export type GenerationPanel = {
  generations: GenerationRow[]
  /** How many of this kind the plan allows each month; 0 means not allowed. */
  limit: number
  left: number
  /** The provider has a key. Without one the panel says so before you type. */
  providerReady: boolean
  /**
   * "Background and sound" can be offered: the other kind's provider has a
   * key and a credit of it is left (task 06, part 7).
   */
  lookReady: boolean
  /** The member's own pictures a background can start from (part 3). */
  pictures: StartingPictureOption[]
  /** Bought credits of this kind still to spend (task 07). */
  packLeft: number
  /** Packs can be bought: payments are switched on. */
  canBuy: boolean
}

export const getGenerationErrorMessage = createErrorMessage(
  {
    GENERATION_NOT_ALLOWED:
      "AI generation is a Pro perk. Upgrade to make your own.",
    GENERATION_LIMIT_REACHED:
      "You have used this month's AI generations and any you bought. You get a fresh batch on the first.",
    PROVIDER_NOT_CONFIGURED:
      "AI generation is not switched on yet.",
    STORAGE_QUOTA_EXCEEDED:
      "Your storage is full, and a generated file needs somewhere to go. Delete something you no longer use and try again.",
    RATE_LIMITED:
      "That is a lot of requests at once. Please wait a few minutes and try again.",
    PICTURE_NOT_YOURS:
      "That picture is not one of your ready pictures any more. Pick another.",
  },
  "That request did not go through. Please try again."
)

const kindSchema = z.enum(["background", "soundscape"])

const otherKind = (kind: GenerationKind): GenerationKind =>
  kind === "background" ? "soundscape" : "background"

const panelFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ kind: kindSchema }))
  .handler(async ({ data, context }): Promise<GenerationPanel> => {
    const [generations, allowance, other, keys, pictures] = await Promise.all([
      listGenerations(context.user.id, data.kind),
      loadGenerationAllowance(context.user.id, data.kind),
      loadGenerationAllowance(context.user.id, otherKind(data.kind)),
      generationKeysConfigured(),
      data.kind === "background"
        ? listStartingPictures(context.user.id)
        : Promise.resolve([]),
    ])
    return {
      generations,
      limit: allowance.limit,
      left: allowance.left,
      providerReady: keys[data.kind],
      lookReady: keys[otherKind(data.kind)] && other.left + other.packLeft > 0,
      pictures,
      packLeft: allowance.packLeft,
      canBuy: billingEnabled(),
    }
  })

const requestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      kind: kindSchema,
      prompt: z.string().trim().min(PROMPT_MIN_LENGTH).max(PROMPT_MAX_LENGTH),
      style: z.enum(GENERATION_STYLE_KEYS).nullable().default(null),
      pictureMediaId: z.string().uuid().nullable().default(null),
      /** "Background and sound": one of each kind from this prompt (part 7). */
      look: z.boolean().default(false),
    })
  )
  .handler(async ({ data, context }) => {
    const kinds: GenerationKind[] = data.look
      ? [data.kind, otherKind(data.kind)]
      : [data.kind]

    // The key first, so a server with nothing configured says so plainly
    // instead of taking a credit and failing a minute later.
    const keys = await generationKeysConfigured()
    if (kinds.some((kind) => !keys[kind]))
      throw new Error("PROVIDER_NOT_CONFIGURED")

    const allowances = await Promise.all(
      kinds.map((kind) => loadGenerationAllowance(context.user.id, kind))
    )
    if (allowances.some(({ limit }) => limit <= 0))
      throw new Error("GENERATION_NOT_ALLOWED")

    // The finished file lands in the same bucket an upload does, so the same
    // 2 GB cap applies. Checked here rather than in the worker, because a
    // member who is full should be told now and not charged a credit for a
    // file that has nowhere to go.
    const [entitlements, storage] = await Promise.all([
      loadPomodoroEntitlements(context.user.id),
      loadAccountStorage(context.user.id),
    ])
    if (storage.bytes >= entitlements.storageLimitBytes) {
      throw new Error("STORAGE_QUOTA_EXCEEDED")
    }

    // After the plan check, so somebody who may not generate at all cannot
    // spend a paying member's share of the limiter.
    await enforceRateLimit(`pomodoro-generate:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 10 * 60,
    })

    // A starting picture must be the member's own ready picture. Checked
    // here so a stranger's id is refused before a credit is taken, and again
    // by the worker in case it was deleted while the request waited.
    const pictureMediaId =
      data.kind === "background" ? data.pictureMediaId : null
    if (
      pictureMediaId &&
      !(await loadOwnPicture(context.user.id, pictureMediaId))
    )
      throw new Error("PICTURE_NOT_YOURS")

    const limits = {
      background: 0,
      soundscape: 0,
    } satisfies Record<GenerationKind, number>
    kinds.forEach((kind, index) => {
      limits[kind] = allowances[index].limit
    })

    const { rows, left } = await requestGenerations(
      context.user.id,
      kinds.map((kind) => ({
        kind,
        prompt: data.prompt,
        style: kind === "background" ? data.style : null,
        pictureMediaId: kind === "background" ? pictureMediaId : null,
      })),
      limits
    )

    return { ids: rows.map((row) => row.id), left: left[data.kind] ?? 0 }
  })

export const loadGenerationPanel = (kind: GenerationKind) =>
  panelFn({ data: { kind } })

export type GenerationAsk = {
  kind: GenerationKind
  prompt: string
  style?: GenerationStyleKey | null
  pictureMediaId?: string | null
  look?: boolean
}

export const requestGeneration = (ask: GenerationAsk) =>
  requestFn({
    data: {
      kind: ask.kind,
      prompt: ask.prompt,
      style: ask.style ?? null,
      pictureMediaId: ask.pictureMediaId ?? null,
      look: ask.look ?? false,
    },
  })
