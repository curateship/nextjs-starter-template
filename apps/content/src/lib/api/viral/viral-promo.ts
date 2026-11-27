import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  PROMO_POST_NETWORKS,
  type PromoPostNetwork,
  type PromoPostSend,
  type PromoRead,
  type SocialPost,
  type VaultPost,
} from "@/lib/viral/promo-link"
import { viralSays } from "@/lib/viral/viral"
import type { WriterPrice } from "@/lib/viral/writers"
import { adminGet, adminPost } from "@/server/guards"
import { listPromoProjects, type PromoProjectOption } from "@/server/viral/promo-link"
import { listPromoSends, listVaultPosts, promoPostPriceCents, sendPromoPost, writePromoPost } from "@/server/viral/promo-posts"
import { loadSocialPost, refreshPromoRead, requestThreadRead } from "@/server/viral/promo-reads"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * The reads Research asks Promo for, and Write a post for Promo
 * (`workspace/docs/promo-connection.md`). In Content the link between the two
 * sets itself up (`workspace/docs/content-app.md`). Admin only: the reads run
 * on Promo's own accounts.
 */

export type { PromoProjectOption }

const id = z.string().min(1).max(36)

/** A message thrown by the server, without its marker, for a refusal the screen shows as it is. */
const plain = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message.replace(/^VIRAL_SAYS: /, "") : fallback

const projectsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<PromoProjectOption[]> => {
    try {
      return await listPromoProjects()
    } catch (error) {
      throw viralSays(plain(error, "Promo couldn't be reached."))
    }
  })

/** The project picker in Write a post for Promo: the Promo key's admin's own projects. */
export function loadPromoProjects() {
  return projectsFn()
}

const refreshFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ readId: id }))
  .handler(async ({ data, context }): Promise<PromoRead> => refreshPromoRead(context.user.id, data.readId))

/** How a waiting read stands. Promo is asked at most every 20 seconds. */
export function refreshPromoReadFn(readId: string) {
  return refreshFn({ data: { readId } })
}

const postFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ postId: id }))
  .handler(async ({ data, context }): Promise<SocialPost> => loadSocialPost(context.user.id, data.postId))

/** One found post, for the thread view. */
export function loadSocialPostFn(postId: string) {
  return postFn({ data: { postId } })
}

const threadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ postId: id }))
  .handler(async ({ data, context }): Promise<PromoRead> => requestThreadRead(context.user.id, data.postId))

/** Asks Promo to read a found post again with its top replies. */
export function askPromoForThread(postId: string) {
  return threadFn({ data: { postId } })
}

const priceFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<WriterPrice> => {
    const writer = await writerForPrices()
    return { cents: promoPostPriceCents(writer), writer: writer.label }
  })

/** What writing one post costs, roughly, and who writes it, shown before Write runs. */
export function loadPromoPostPrice() {
  return priceFn()
}

const writeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id, network: z.enum(PROMO_POST_NETWORKS) }))
  .handler(async ({ data, context }): Promise<PromoPostSend> => writePromoPost(context.user.id, data.itemId, data.network))

/** The AI writes a post for one network from a vault idea. */
export function writePromoPostFn(itemId: string, network: PromoPostNetwork) {
  return writeFn({ data: { itemId, network } })
}

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      sendId: id,
      promoProjectId: id,
      title: z.string().max(400),
      pieces: z.array(z.string().max(12_000)).min(1).max(25),
    })
  )
  .handler(async ({ data, context }): Promise<PromoPostSend> => sendPromoPost(context.user.id, data))

/** Leaves a written post in a Promo project as a draft. Nothing is posted until somebody presses Post in Promo. */
export function sendPromoPostFn(input: { sendId: string; promoProjectId: string; title: string; pieces: string[] }) {
  return sendFn({ data: input })
}

const sendsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ data, context }): Promise<PromoPostSend[]> => listPromoSends(context.user.id, data.itemId))

/** The posts written for Promo from one idea, newest first. */
export function loadPromoSends(itemId: string) {
  return sendsFn({ data: { itemId } })
}

const vaultPostsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ data, context }): Promise<VaultPost[]> => listVaultPosts(context.user.id, data.itemId))

/** Your own posts of an idea, as Promo reported them, with their latest views. */
export function loadVaultPosts(itemId: string) {
  return vaultPostsFn({ data: { itemId } })
}
