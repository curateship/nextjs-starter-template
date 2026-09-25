import { randomUUID } from "node:crypto"

import { and, count, desc, eq, inArray, ne, or, isNotNull, sql } from "drizzle-orm"

import { protocolLabel } from "@/lib/protocols/contracts"
import {
  builderFeePercent,
  builderFeeTenthsBps,
  copyPauseWords,
  copySettingsProblem,
  HYPERLIQUID_MAX_BUILDER_FEE,
  OWN_PROFILE,
  REAL_MONEY_COPY_PROTOCOLS,
  type CopyNote,
  type CopyPauseReason,
  type CopyRow,
  type CopySettings,
  type FollowingRow,
  type MyCopiers,
  type ViewerRelation,
} from "@/lib/trade/copy/copy-rules"
import { normalizeHandle, shortAddress } from "@/lib/trade/public-profile/profile"
import type { TradeWallet } from "@/lib/trade/wallets"
import { customShellUsers } from "@/server/schema"
import { getProtocol, ordersOf } from "@/server/protocols/registry"
import type { BuilderFeeApproval } from "@/server/protocols/hyperliquid/builder-fee"
import {
  builderAddress,
  forgetCopyConfig,
  loadCopyConfig,
  type CopyConfig,
} from "@/server/trade/copy-ledger"
import {
  closeCopiedPositions,
  copyMadeUsd,
  pauseCopiesOfTrader,
  whyCopierCannotTrade,
  whyTraderCannotBeCopied,
} from "@/server/trade/copy-engine"
import { db } from "@/server/trade/db"
import {
  forgetPublicProfileViews,
  loadPublicProfileView,
} from "@/server/trade/public-profiles"
import {
  tradeCopies,
  tradeCopyConfig,
  tradeCopyConsents,
  tradeCopyFeeApprovals,
  tradeCopyFills,
  tradeCopyLegs,
  tradeCopyNotes,
  tradeCopyPayouts,
  tradeFollows,
  tradePublicProfiles,
  tradeWallets,
} from "@/server/trade/schema"
import { findWallet, listWallets } from "@/server/trade/wallets"

/**
 * Following and copying, as a member and an admin ask for them: the buttons on
 * a profile, the Following page, the trader's own Copiers section, and Admin
 * → Copy trading. What happens when a copied trader trades is
 * `copy-engine.ts`.
 */

type ProfileRow = typeof tradePublicProfiles.$inferSelect
type CopyRecord = typeof tradeCopies.$inferSelect

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
/** A signed approval older than this is refused, so an old one cannot be replayed. */
const APPROVAL_FRESH_MS = 10 * 60_000

async function publicProfileByHandle(handle: string): Promise<ProfileRow> {
  const [row] = await db
    .select()
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.handle, normalizeHandle(handle)))
  if (!row || !row.enabled || row.hiddenAt !== null) {
    throw new Error("PROFILE_NOT_FOUND")
  }
  return row
}

// ----- Following ------------------------------------------------------------

export async function followTrader(userId: string, handle: string): Promise<void> {
  const profile = await publicProfileByHandle(handle)
  if (profile.userId === userId) throw new Error("COPY_OWN_PROFILE")
  await db
    .insert(tradeFollows)
    .values({ followerUserId: userId, traderUserId: profile.userId })
    .onConflictDoNothing()
  forgetPublicProfileViews()
}

/**
 * Unfollows these handles in one go and says which went. One still being
 * copied stays: the copy is how its copier hears about it, so the copy has to
 * stop first.
 */
export async function unfollowTraders(
  userId: string,
  handles: readonly string[]
): Promise<{ done: string[]; kept: string[] }> {
  const wanted = [...new Set(handles.map(normalizeHandle))]
  if (wanted.length === 0) return { done: [], kept: [] }
  const profiles = await db
    .select({
      userId: tradePublicProfiles.userId,
      handle: tradePublicProfiles.handle,
    })
    .from(tradePublicProfiles)
    .where(inArray(tradePublicProfiles.handle, wanted))
  const copied = new Set(
    (
      await db
        .select({ traderUserId: tradeCopies.traderUserId })
        .from(tradeCopies)
        .where(
          and(
            eq(tradeCopies.copierUserId, userId),
            ne(tradeCopies.status, "stopped")
          )
        )
    ).map((row) => row.traderUserId)
  )
  const going = profiles.filter((profile) => !copied.has(profile.userId))
  if (going.length > 0) {
    await db.delete(tradeFollows).where(
      and(
        eq(tradeFollows.followerUserId, userId),
        inArray(
          tradeFollows.traderUserId,
          going.map((profile) => profile.userId)
        )
      )
    )
    forgetPublicProfileViews()
  }
  const done = new Set(going.map((profile) => profile.handle))
  return {
    done: [...done],
    kept: wanted.filter((handle) => !done.has(handle)),
  }
}

/** Unfollowing one, from the profile's own button. */
export async function unfollowTrader(userId: string, handle: string): Promise<void> {
  const { kept } = await unfollowTraders(userId, [handle])
  if (kept.length > 0) throw new Error("COPY_STILL_COPYING")
}

// ----- What the buttons on a profile need -----------------------------------

function walletVenue(wallet: Pick<TradeWallet, "protocol" | "address">): string {
  const label = protocolLabel(wallet.protocol)
  return wallet.address ? `${label} ${shortAddress(wallet.address)}` : label
}

/** The trader's wallets a copy can follow: live, on the main network, switched on. */
async function copyableTraderWallets(traderUserId: string) {
  return await db
    .select({
      id: tradeWallets.id,
      protocol: tradeWallets.protocol,
      address: tradeWallets.address,
    })
    .from(tradeWallets)
    .where(
      and(
        eq(tradeWallets.userId, traderUserId),
        eq(tradeWallets.kind, "live"),
        eq(tradeWallets.network, "mainnet"),
        eq(tradeWallets.status, "active")
      )
    )
}

/**
 * Why this wallet cannot take a copy right now, or null. The exchange must
 * match the trader's, which the window checks against the wallet it picked.
 */
function walletRefusal(
  wallet: TradeWallet,
  config: CopyConfig
): string | null {
  if (wallet.status !== "active") return "This wallet is switched off."
  if (wallet.network !== "mainnet") {
    return "A copy needs a wallet on the main network, whose prices are the trader's."
  }
  if (wallet.kind === "paper") return null
  if (!config.realMoney) {
    return "Copying with real money is not switched on yet. Copy with a practice wallet."
  }
  if (!REAL_MONEY_COPY_PROTOCOLS.includes(wallet.protocol)) {
    return `Real money can only copy on ${REAL_MONEY_COPY_PROTOCOLS.map(protocolLabel).join(", ")} for now. Copy with a practice wallet.`
  }
  if (!wallet.hasKey) return "Save this wallet's trading key first."
  if (!builderAddress()) {
    return "Trade's fee address is not set on the server yet, so real money cannot copy."
  }
  return null
}

async function feeApproved(
  userId: string,
  wallet: TradeWallet,
  config: CopyConfig
): Promise<boolean> {
  if (wallet.kind !== "live" || !ordersOf(getProtocol(wallet.protocol)).builderFee) {
    return true
  }
  const [row] = await db
    .select()
    .from(tradeCopyFeeApprovals)
    .where(
      and(
        eq(tradeCopyFeeApprovals.userId, userId),
        eq(tradeCopyFeeApprovals.walletId, wallet.id)
      )
    )
  return (
    row !== undefined &&
    row.builder === builderAddress() &&
    row.feeRate + 1e-12 >= Math.min(config.feeRate, HYPERLIQUID_MAX_BUILDER_FEE)
  )
}

async function toCopyRow(
  copy: CopyRecord,
  traderHandle: string
): Promise<CopyRow> {
  const [[wallet], [traderWallet], madeUsd] = await Promise.all([
    db
      .select({ label: tradeWallets.label, kind: tradeWallets.kind })
      .from(tradeWallets)
      .where(
        and(
          eq(tradeWallets.userId, copy.copierUserId),
          eq(tradeWallets.id, copy.copierWalletId)
        )
      ),
    db
      .select({ protocol: tradeWallets.protocol, address: tradeWallets.address })
      .from(tradeWallets)
      .where(
        and(
          eq(tradeWallets.userId, copy.traderUserId),
          eq(tradeWallets.id, copy.traderWalletId)
        )
      ),
    copyMadeUsd(copy.id),
  ])
  return {
    id: copy.id,
    status: copy.status,
    pausedWords:
      copy.status === "paused" && copy.pausedReason
        ? copyPauseWords(copy.pausedReason, `@${traderHandle}`)
        : null,
    settings: {
      walletId: copy.copierWalletId,
      dollarsPerTrade: copy.dollarsPerTrade,
      maxOpenUsd: copy.maxOpenUsd,
      maxLeverage: copy.maxLeverage,
      coins: copy.coins,
      priceAllowance: copy.priceAllowance,
      lossLimitUsd: copy.lossLimitUsd,
    },
    walletLabel: wallet?.label ?? "Removed wallet",
    walletKind: wallet?.kind ?? "paper",
    traderVenue: traderWallet
      ? walletVenue(traderWallet)
      : protocolLabel(copy.protocol),
    madeUsd,
  }
}

async function liveCopyOf(
  copierUserId: string,
  traderUserId: string
): Promise<CopyRecord | null> {
  const [row] = await db
    .select()
    .from(tradeCopies)
    .where(
      and(
        eq(tradeCopies.copierUserId, copierUserId),
        eq(tradeCopies.traderUserId, traderUserId),
        ne(tradeCopies.status, "stopped")
      )
    )
  return row ?? null
}

export async function loadViewerRelation(
  userId: string,
  handle: string
): Promise<ViewerRelation> {
  const profile = await publicProfileByHandle(handle)
  const config = await loadCopyConfig()
  const [[follow], copy, [consent], traderWallets, myWallets] =
    await Promise.all([
      db
        .select({ at: tradeFollows.createdAt })
        .from(tradeFollows)
        .where(
          and(
            eq(tradeFollows.followerUserId, userId),
            eq(tradeFollows.traderUserId, profile.userId)
          )
        ),
      liveCopyOf(userId, profile.userId),
      db
        .select({ at: tradeCopyConsents.acceptedAt })
        .from(tradeCopyConsents)
        .where(eq(tradeCopyConsents.userId, userId)),
      copyableTraderWallets(profile.userId),
      listWallets(userId),
    ])
  const stopped =
    profile.userId === userId
      ? OWN_PROFILE
      : await whyTraderCannotBeCopied(profile).then((reason) =>
          reason ? traderStopWords(reason, profile.handle) : null
        )
  return {
    signedIn: true,
    following: follow !== undefined,
    copy: copy ? await toCopyRow(copy, profile.handle) : null,
    consented: consent !== undefined,
    notCopyable:
      stopped ??
      (traderWallets.length === 0
        ? `@${profile.handle} has no real-money wallet to copy.`
        : null),
    traderWallets: traderWallets.map((wallet) => ({
      id: wallet.id,
      venue: walletVenue(wallet),
      protocol: wallet.protocol,
    })),
    myWallets: await Promise.all(
      myWallets.map(async (wallet) => ({
        id: wallet.id,
        label: wallet.label,
        kind: wallet.kind,
        protocol: wallet.protocol,
        refusal: walletRefusal(wallet, config),
        needsFeeApproval: !(await feeApproved(userId, wallet, config)),
        address: wallet.address,
      }))
    ),
    feeRate: config.feeRate,
    builderAddress: builderAddress(),
  }
}

/** Why nobody can start copying this trader, in the words a visitor reads. */
function traderStopWords(reason: CopyPauseReason, handle: string): string {
  if (reason === "trader-private") {
    return `@${handle} can be copied once the record is 30 days long with 20 closed trades.`
  }
  if (reason === "trader-stopped-copying") {
    return `@${handle} has not switched copying on.`
  }
  return copyPauseWords(reason, `@${handle}`)
}

export async function acceptCopyConsent(userId: string): Promise<void> {
  await db
    .insert(tradeCopyConsents)
    .values({ userId })
    .onConflictDoNothing()
}

// ----- Starting, changing and stopping a copy -------------------------------

function checkSettings(settings: CopySettings): CopySettings {
  const problem = copySettingsProblem(settings)
  if (problem) throw new Error(`COPY_INPUT:${problem.message}`)
  return {
    ...settings,
    coins: settings.coins === null ? null : [...new Set(settings.coins)],
  }
}

async function copierWalletFor(
  userId: string,
  walletId: string,
  traderProtocol: string,
  config: CopyConfig
): Promise<TradeWallet> {
  const wallet = await findWallet(userId, walletId)
  if (!wallet) throw new Error("COPY_WALLET_NOT_FOUND")
  if (wallet.protocol !== traderProtocol) {
    throw new Error("COPY_INPUT:Pick a wallet on the same exchange as the trader's.")
  }
  const refusal = walletRefusal(wallet, config)
  if (refusal) throw new Error(`COPY_INPUT:${refusal}`)
  if (!(await feeApproved(userId, wallet, config))) {
    throw new Error("COPY_FEE_NOT_APPROVED")
  }
  return wallet
}

export async function startCopy(
  userId: string,
  input: { handle: string; traderWalletId: string; settings: CopySettings }
): Promise<void> {
  const settings = checkSettings(input.settings)
  const profile = await publicProfileByHandle(input.handle)
  if (profile.userId === userId) throw new Error("COPY_OWN_PROFILE")
  const stopped = await whyTraderCannotBeCopied(profile)
  if (stopped) {
    throw new Error(`COPY_NOT_COPYABLE:${traderStopWords(stopped, profile.handle)}`)
  }
  const [consent] = await db
    .select({ at: tradeCopyConsents.acceptedAt })
    .from(tradeCopyConsents)
    .where(eq(tradeCopyConsents.userId, userId))
  if (!consent) throw new Error("COPY_CONSENT_NEEDED")
  const traderWallet = (await copyableTraderWallets(profile.userId)).find(
    (wallet) => wallet.id === input.traderWalletId
  )
  if (!traderWallet) throw new Error("COPY_TRADER_WALLET")
  const config = await loadCopyConfig()
  await copierWalletFor(userId, settings.walletId, traderWallet.protocol, config)

  const now = new Date()
  try {
    await db.transaction(async (tx) => {
      await tx.insert(tradeCopies).values({
        id: randomUUID(),
        copierUserId: userId,
        copierWalletId: settings.walletId,
        traderUserId: profile.userId,
        traderWalletId: traderWallet.id,
        protocol: traderWallet.protocol,
        dollarsPerTrade: settings.dollarsPerTrade,
        maxOpenUsd: settings.maxOpenUsd,
        maxLeverage: settings.maxLeverage,
        coins: settings.coins,
        priceAllowance: settings.priceAllowance,
        lossLimitUsd: settings.lossLimitUsd,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      // Copying someone follows them too, so the Following page is the one
      // list of everybody the member watches or copies.
      await tx
        .insert(tradeFollows)
        .values({ followerUserId: userId, traderUserId: profile.userId })
        .onConflictDoNothing()
    })
  } catch (error) {
    const code =
      error && typeof error === "object" && "cause" in error
        ? (error.cause as { code?: string } | undefined)?.code
        : undefined
    if (code === "23505") throw new Error("COPY_ALREADY")
    throw error
  }
  forgetPublicProfileViews()
}

async function ownCopy(userId: string, copyId: string): Promise<CopyRecord> {
  const [copy] = await db
    .select()
    .from(tradeCopies)
    .where(and(eq(tradeCopies.id, copyId), eq(tradeCopies.copierUserId, userId)))
  if (!copy || copy.status === "stopped") throw new Error("COPY_NOT_FOUND")
  return copy
}

/**
 * Changes a running copy's limits. The wallet stays: a copy's positions live
 * in it, and moving the copy would leave them followed by nothing.
 */
export async function updateCopy(
  userId: string,
  copyId: string,
  input: CopySettings
): Promise<void> {
  const copy = await ownCopy(userId, copyId)
  const settings = checkSettings(input)
  if (settings.walletId !== copy.copierWalletId) {
    throw new Error(
      "COPY_INPUT:A copy keeps its wallet. Stop it and start a new one to use another wallet."
    )
  }
  await db
    .update(tradeCopies)
    .set({
      dollarsPerTrade: settings.dollarsPerTrade,
      maxOpenUsd: settings.maxOpenUsd,
      maxLeverage: settings.maxLeverage,
      coins: settings.coins,
      priceAllowance: settings.priceAllowance,
      lossLimitUsd: settings.lossLimitUsd,
      updatedAt: new Date(),
    })
    .where(eq(tradeCopies.id, copy.id))
}

/**
 * Stops a copy. The one question it asks is whether its positions close now,
 * with the same chased limit order a part close uses, or stay open for the
 * member to close when they choose.
 */
export async function stopCopy(
  userId: string,
  copyId: string,
  closePositions: boolean
): Promise<{ closing: number }> {
  const copy = await ownCopy(userId, copyId)
  const now = new Date()
  // Stopped first, so a trade heard while the closes are being written cannot
  // open something new behind them.
  await db
    .update(tradeCopies)
    .set({ status: "stopped", stoppedAt: now, updatedAt: now })
    .where(eq(tradeCopies.id, copy.id))
  const closing = closePositions ? await closeCopiedPositions(copy) : 0
  await db.delete(tradeCopyLegs).where(eq(tradeCopyLegs.copyId, copy.id))
  forgetPublicProfileViews()
  return { closing }
}

/** Starts a paused copy again, once whatever paused it has cleared. */
export async function resumeCopy(userId: string, copyId: string): Promise<void> {
  const copy = await ownCopy(userId, copyId)
  if (copy.status !== "paused") return
  const [profile] = await db
    .select()
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.userId, copy.traderUserId))
  if (!profile) throw new Error("PROFILE_NOT_FOUND")
  const traderStop = await whyTraderCannotBeCopied(profile)
  if (traderStop) {
    throw new Error(`COPY_NOT_COPYABLE:${traderStopWords(traderStop, profile.handle)}`)
  }
  const wallet = await findWallet(userId, copy.copierWalletId)
  const copierStop = await whyCopierCannotTrade(copy, wallet, Date.now())
  if (copierStop) {
    throw new Error(`COPY_NOT_COPYABLE:${copyPauseWords(copierStop, `@${profile.handle}`)}`)
  }
  await db
    .update(tradeCopies)
    .set({
      status: "active",
      pausedReason: null,
      pausedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(tradeCopies.id, copy.id), eq(tradeCopies.status, "paused")))
}

// ----- The Following page ---------------------------------------------------

export async function loadFollowing(userId: string): Promise<FollowingRow[]> {
  const follows = await db
    .select({
      traderUserId: tradeFollows.traderUserId,
      followedAt: tradeFollows.createdAt,
      handle: tradePublicProfiles.handle,
      displayName: tradePublicProfiles.displayName,
      picture: tradePublicProfiles.picture,
    })
    .from(tradeFollows)
    .innerJoin(
      tradePublicProfiles,
      eq(tradePublicProfiles.userId, tradeFollows.traderUserId)
    )
    .where(eq(tradeFollows.followerUserId, userId))
    .orderBy(desc(tradeFollows.createdAt))
  const copies = await db
    .select()
    .from(tradeCopies)
    .where(
      and(eq(tradeCopies.copierUserId, userId), ne(tradeCopies.status, "stopped"))
    )
  const copyBy = new Map(copies.map((copy) => [copy.traderUserId, copy]))
  return await Promise.all(
    follows.map(async (follow) => {
      const view = await loadPublicProfileView(follow.handle)
      const copy = copyBy.get(follow.traderUserId)
      return {
        handle: follow.handle,
        displayName: follow.displayName,
        picture: follow.picture,
        made30d: view ? view.figures.made["30d"].money : null,
        followedAt: follow.followedAt.getTime(),
        copy: copy ? await toCopyRow(copy, follow.handle) : null,
      }
    })
  )
}

// ----- The trader's own side ------------------------------------------------

async function owedAndPaid(traderUserId: string) {
  const [[earned], [paid]] = await Promise.all([
    db
      .select({
        usd: sql<number>`coalesce(sum(${tradeCopyFills.traderShareUsd}), 0)`,
      })
      .from(tradeCopyFills)
      .where(
        and(
          eq(tradeCopyFills.traderUserId, traderUserId),
          eq(tradeCopyFills.real, true)
        )
      ),
    db
      .select({ usd: sql<number>`coalesce(sum(${tradeCopyPayouts.amountUsd}), 0)` })
      .from(tradeCopyPayouts)
      .where(eq(tradeCopyPayouts.traderUserId, traderUserId)),
  ])
  const earnedUsd = Number(earned?.usd ?? 0)
  const paidUsd = Number(paid?.usd ?? 0)
  return { earnedUsd, paidUsd, owedUsd: Math.max(0, earnedUsd - paidUsd) }
}

/** The Copiers section: counts and money, never who. */
export async function loadMyCopiers(userId: string): Promise<MyCopiers | null> {
  const [profile] = await db
    .select()
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.userId, userId))
  if (!profile) return null
  const [[followers], [copiers], money] = await Promise.all([
    db
      .select({ n: count() })
      .from(tradeFollows)
      .where(eq(tradeFollows.traderUserId, userId)),
    db
      .select({
        n: count(),
        usd: sql<number>`coalesce(sum(${tradeCopies.maxOpenUsd}), 0)`,
      })
      .from(tradeCopies)
      .where(
        and(eq(tradeCopies.traderUserId, userId), eq(tradeCopies.status, "active"))
      ),
    owedAndPaid(userId),
  ])
  return {
    allowCopying: profile.allowCopying,
    payoutAddress: profile.payoutAddress,
    followers: followers?.n ?? 0,
    copiers: copiers?.n ?? 0,
    copyingUsd: Number(copiers?.usd ?? 0),
    owedUsd: money.owedUsd,
    paidUsd: money.paidUsd,
  }
}

/**
 * "Allow copying" and the payout address. Switching copying off stops new
 * copies at once: every running copy pauses and says why, and nothing closes.
 */
export async function saveMyCopySettings(
  userId: string,
  input: { allowCopying: boolean; payoutAddress: string | null }
): Promise<void> {
  const payoutAddress = input.payoutAddress?.trim() || null
  if (payoutAddress && !EVM_ADDRESS.test(payoutAddress)) {
    throw new Error(
      "COPY_INPUT:A payout address starts with 0x and has 40 more letters and numbers."
    )
  }
  const updated = await db
    .update(tradePublicProfiles)
    .set({
      allowCopying: input.allowCopying,
      payoutAddress: payoutAddress?.toLowerCase() ?? null,
      updatedAt: new Date(),
    })
    .where(eq(tradePublicProfiles.userId, userId))
    .returning({ userId: tradePublicProfiles.userId })
  if (updated.length === 0) throw new Error("PROFILE_NOT_SAVED")
  forgetPublicProfileViews()
  if (!input.allowCopying) {
    await pauseCopiesOfTrader(userId, "trader-stopped-copying")
  }
}

// ----- The Journal ----------------------------------------------------------

const NOTES_SHOWN = 200

/** Skipped copies on these wallets, newest first. */
export async function loadCopyNotes(
  userId: string,
  walletIds: readonly string[]
): Promise<CopyNote[]> {
  if (walletIds.length === 0) return []
  const rows = await db
    .select()
    .from(tradeCopyNotes)
    .where(
      and(
        eq(tradeCopyNotes.userId, userId),
        inArray(tradeCopyNotes.walletId, [...walletIds])
      )
    )
    .orderBy(desc(tradeCopyNotes.createdAt))
    .limit(NOTES_SHOWN)
  return rows.map((row) => ({
    id: row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    traderHandle: row.traderHandle,
    note: row.note,
    at: row.createdAt.getTime(),
  }))
}

/** Takes skipped-copy rows off the Journal. */
export async function hideCopyNotes(
  userId: string,
  ids: readonly string[]
): Promise<void> {
  if (ids.length === 0) return
  await db
    .delete(tradeCopyNotes)
    .where(and(eq(tradeCopyNotes.userId, userId), inArray(tradeCopyNotes.id, [...ids])))
}

// ----- The builder fee approval ---------------------------------------------

/**
 * Hands Hyperliquid the builder-fee approval the member's browser wallet
 * signed, then reads back what Hyperliquid now allows. Only the exact fee and
 * address Trade asks for are passed on.
 */
export async function approveCopyFee(
  userId: string,
  walletId: string,
  approval: BuilderFeeApproval
): Promise<void> {
  const wallet = await findWallet(userId, walletId)
  if (!wallet || wallet.kind !== "live" || !wallet.address) {
    throw new Error("COPY_WALLET_NOT_FOUND")
  }
  const builderFee = ordersOf(getProtocol(wallet.protocol)).builderFee
  const builder = builderAddress()
  if (!builderFee || !builder) throw new Error("COPY_FEE_UNSUPPORTED")
  const config = await loadCopyConfig()
  const rate = Math.min(config.feeRate, HYPERLIQUID_MAX_BUILDER_FEE)
  const { action } = approval
  if (
    action.type !== "approveBuilderFee" ||
    action.builder.toLowerCase() !== builder ||
    action.maxFeeRate !== builderFeePercent(rate) ||
    action.hyperliquidChain !== (wallet.network === "mainnet" ? "Mainnet" : "Testnet") ||
    Math.abs(Date.now() - action.nonce) > APPROVAL_FRESH_MS
  ) {
    throw new Error("COPY_FEE_WRONG")
  }
  await builderFee.submitApproval(wallet.network, approval)
  const allowed = await builderFee.approved(wallet.network, wallet.address, builder)
  if (allowed < builderFeeTenthsBps(rate)) throw new Error("COPY_FEE_NOT_APPROVED")
  await db
    .insert(tradeCopyFeeApprovals)
    .values({ userId, walletId, builder, feeRate: rate })
    .onConflictDoUpdate({
      target: [tradeCopyFeeApprovals.userId, tradeCopyFeeApprovals.walletId],
      set: { builder, feeRate: rate, approvedAt: new Date() },
    })
}

// ----- Admin ----------------------------------------------------------------

export type CopyAdminTrader = {
  userId: string
  handle: string
  email: string
  allowCopying: boolean
  blocked: boolean
  copiers: number
  earnedUsd: number
  paidUsd: number
  owedUsd: number
  payoutAddress: string | null
}

export type CopyAdmin = {
  config: CopyConfig
  builderAddress: string | null
  traders: CopyAdminTrader[]
}

/** Every trader who allows copying, was stopped, or has earned anything. */
export async function loadCopyAdmin(): Promise<CopyAdmin> {
  const earners = db
    .selectDistinct({ userId: tradeCopyFills.traderUserId })
    .from(tradeCopyFills)
  const rows = await db
    .select({ profile: tradePublicProfiles, email: customShellUsers.email })
    .from(tradePublicProfiles)
    .innerJoin(customShellUsers, eq(customShellUsers.id, tradePublicProfiles.userId))
    .where(
      or(
        eq(tradePublicProfiles.allowCopying, true),
        isNotNull(tradePublicProfiles.copyBlockedAt),
        inArray(tradePublicProfiles.userId, earners)
      )
    )
  const traders = await Promise.all(
    rows.map(async ({ profile, email }) => {
      const [[copiers], money] = await Promise.all([
        db
          .select({ n: count() })
          .from(tradeCopies)
          .where(
            and(
              eq(tradeCopies.traderUserId, profile.userId),
              eq(tradeCopies.status, "active")
            )
          ),
        owedAndPaid(profile.userId),
      ])
      return {
        userId: profile.userId,
        handle: profile.handle,
        email,
        allowCopying: profile.allowCopying,
        blocked: profile.copyBlockedAt !== null,
        copiers: copiers?.n ?? 0,
        ...money,
        payoutAddress: profile.payoutAddress,
      }
    })
  )
  return { config: await loadCopyConfig(), builderAddress: builderAddress(), traders }
}

export async function saveCopyConfig(input: CopyConfig): Promise<void> {
  if (
    !Number.isFinite(input.feeRate) ||
    input.feeRate < 0 ||
    input.feeRate > HYPERLIQUID_MAX_BUILDER_FEE + 1e-12
  ) {
    throw new Error(
      "COPY_INPUT:The fee can be at most 0.1%, the most Hyperliquid lets an app add."
    )
  }
  if (
    !Number.isFinite(input.traderShare) ||
    input.traderShare < 0 ||
    input.traderShare > 1
  ) {
    throw new Error("COPY_INPUT:The trader's share must be between 0% and 100%.")
  }
  await db
    .insert(tradeCopyConfig)
    .values({ id: "default", ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradeCopyConfig.id,
      set: { ...input, updatedAt: new Date() },
    })
  forgetCopyConfig()
}

/**
 * Stops new copies of these traders, or allows them again, in one go. Their
 * running copies pause and say why. Closes nothing.
 */
export async function setTradersCopyBlocked(
  traderUserIds: readonly string[],
  blocked: boolean
): Promise<{ done: string[]; kept: string[] }> {
  const ids = [...new Set(traderUserIds)]
  if (ids.length === 0) return { done: [], kept: [] }
  const updated = await db
    .update(tradePublicProfiles)
    .set({ copyBlockedAt: blocked ? new Date() : null, updatedAt: new Date() })
    .where(inArray(tradePublicProfiles.userId, ids))
    .returning({ userId: tradePublicProfiles.userId })
  forgetPublicProfileViews()
  const done = updated.map((row) => row.userId)
  if (blocked) {
    for (const userId of done) {
      await pauseCopiesOfTrader(userId, "admin-stopped")
    }
  }
  return { done, kept: ids.filter((id) => !done.includes(id)) }
}

/** Records a payout an admin sent by hand, with the transaction's link. */
export async function markPayoutSent(
  adminUserId: string,
  input: { traderUserId: string; amountUsd: number; txLink: string }
): Promise<void> {
  let link: URL
  try {
    link = new URL(input.txLink.trim())
  } catch {
    throw new Error("COPY_INPUT:Paste the transaction's link, starting with https://.")
  }
  if (link.protocol !== "https:") {
    throw new Error("COPY_INPUT:Paste the transaction's link, starting with https://.")
  }
  const { owedUsd } = await owedAndPaid(input.traderUserId)
  if (!(input.amountUsd > 0) || input.amountUsd > owedUsd + 0.01) {
    throw new Error(
      `COPY_INPUT:The payout must be more than $0 and at most the $${owedUsd.toFixed(2)} owed.`
    )
  }
  await db.insert(tradeCopyPayouts).values({
    id: randomUUID(),
    traderUserId: input.traderUserId,
    amountUsd: input.amountUsd,
    txLink: link.toString(),
    createdBy: adminUserId,
  })
}
