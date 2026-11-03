import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ACCOUNT_SOURCES } from "@/lib/bans/options"
import { passReaderWritten } from "@/lib/social/refusal-words"
import { adminGet, adminPost } from "@/server/guards"
import { answerAppeal, markAppealed } from "@/server/bans/appeals"
import { cleanUpBan, type CleanUpAnswer } from "@/server/bans/clean-up"
import { banDetail, loadBans, unknownScreenPicture, type BanDetail, type BanRow, type BansPage, type SellerLine } from "@/server/bans/dashboard"
import { accountHistory, phoneTenancies, type AccountEventView, type TenancyView } from "@/server/bans/history"
import { answerScreen } from "@/server/bans/phrases"
import { releaseBrake } from "@/server/bans/record"
import { brakedApps } from "@/server/bans/rules"
import { setAccountSource } from "@/server/social/account-list"

import { createErrorMessage } from "./error-message"

export type { AccountEventView, BanDetail, BanRow, BansPage, CleanUpAnswer, SellerLine, TenancyView }

/**
 * The Bans task's endpoints (workspace/tasks/Bans/01-ban-features.md): the
 * Bans dashboard, one ban's picture and actions, Clean up, the appeal, an
 * unknown screen's answer, releasing the brake, an account's own history, a
 * phone's accounts over time, and where an account came from. Admin only,
 * scoped to the signed-in person, like every Promo endpoint.
 */

export const getBansErrorMessage = passReaderWritten(
  createErrorMessage(
    {
      "not there any more": "That is not there any more. Refresh the list.",
      "won or lost": "An appeal is won or lost.",
    },
    "That did not work. Please try again."
  )
)

const id = z.string().min(1).max(36)

const pageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<BansPage> => loadBans(context.user.id))

export function loadBansPage() {
  return pageFn()
}

const detailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ banId: id }))
  .handler(async ({ context, data }): Promise<BanDetail> => banDetail(context.user.id, data.banId))

/** One ban's kept picture and the phone's last 20 actions before it. */
export function loadBanDetail(banId: string) {
  return detailFn({ data: { banId } })
}

const screenPictureFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ phraseId: id }))
  .handler(async ({ context, data }): Promise<string | null> => unknownScreenPicture(context.user.id, data.phraseId))

/** The picture kept with a screen Promo is asking about. */
export function loadUnknownScreenPicture(phraseId: string) {
  return screenPictureFn({ data: { phraseId } })
}

const cleanUpFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }): Promise<CleanUpAnswer> => cleanUpBan(context.user.id, data.accountId))

/** Retires a banned account as Banned, takes it off its phone or profile and queues the phone's wipe. */
export function cleanUpBannedAccount(accountId: string) {
  return cleanUpFn({ data: { accountId } })
}

const appealFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("step", [
      z.object({ step: z.literal("sent"), banId: id, note: z.string().max(1_000) }),
      z.object({ step: z.literal("answer"), banId: id, answer: z.enum(["won", "lost"]) }),
    ])
  )
  .handler(async ({ context, data }): Promise<void> =>
    data.step === "sent" ? markAppealed(context.user.id, data.banId, data.note) : answerAppeal(context.user.id, data.banId, data.answer)
  )

/** Records that an appeal went in today, with an optional note. */
export function recordAppeal(banId: string, note: string) {
  return appealFn({ data: { step: "sent", banId, note } })
}

/** Records the app's answer to the appeal. */
export function recordAppealAnswer(banId: string, answer: "won" | "lost") {
  return appealFn({ data: { step: "answer", banId, answer } })
}

const screenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ phraseId: id, verdict: z.enum(["ban", "harmless"]) }))
  .handler(async ({ context, data }): Promise<void> => answerScreen(context.user.id, data.phraseId, data.verdict))

/** "It's a ban" or "Not a ban" for a screen Promo did not know. */
export function answerUnknownScreen(phraseId: string, verdict: "ban" | "harmless") {
  return screenFn({ data: { phraseId, verdict } })
}

const releaseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ app: z.string().min(1).max(20) }))
  .handler(async ({ context, data }): Promise<void> => releaseBrake(context.user.id, data.app))

/** Lets every account on an app run again after the app-wide brake. */
export function releaseAppBrake(app: string) {
  return releaseFn({ data: { app } })
}

const brakesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<Array<{ app: string; at: Date }>> =>
    [...(await brakedApps(context.user.id))].map(([app, at]) => ({ app, at }))
  )

/** The apps the brake holds now, with when it went on, for Settings → Phones. */
export function loadAppBrakes() {
  return brakesFn()
}

const historyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ accountId: id }))
  .handler(async ({ context, data }): Promise<AccountEventView[]> => accountHistory(context.user.id, data.accountId))

/** An account's own history, newest first. */
export function loadAccountHistory(accountId: string) {
  return historyFn({ data: { accountId } })
}

const tenanciesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ phoneId: id }))
  .handler(async ({ context, data }): Promise<TenancyView[]> => phoneTenancies(context.user.id, data.phoneId))

/** Every account a phone has held, newest first. */
export function loadPhoneTenancies(phoneId: string) {
  return tenanciesFn({ data: { phoneId } })
}

const sourceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      accountId: id,
      source: z.enum(["", ...ACCOUNT_SOURCES]),
      seller: z.string().max(120),
      priceCents: z.number().int().min(0).max(100_000_000).nullable(),
    })
  )
  .handler(async ({ context, data }): Promise<void> => setAccountSource(context.user.id, data.accountId, data))

/** Saves where an account came from: made or bought, the seller and the price. */
export function saveAccountSource(accountId: string, input: { source: "" | "made" | "bought"; seller: string; priceCents: number | null }) {
  return sourceFn({ data: { accountId, ...input } })
}
