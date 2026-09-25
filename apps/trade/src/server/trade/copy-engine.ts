import { randomUUID } from "node:crypto"

import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm"

import {
  marketKey as marketKeyOf,
  marketSymbol,
  parseMarketKey,
  type WalletOrderFill,
} from "@/lib/protocols/contracts"
import {
  COPY_MAX_LATE_MS,
  COPY_MAX_SHARE_OF_DAILY_VOLUME,
  COPY_MIN_DAILY_VOLUME_USD,
  copyPauseWords,
  copySkipWords,
  decideCopy,
  REAL_MONEY_COPY_PROTOCOLS,
  type CopyPauseReason,
  type CopySkip,
  type TraderMove,
} from "@/lib/trade/copy/copy-rules"
import { floorSize } from "@/lib/trade/dca"
import { formatSignedUsd } from "@/lib/trade/format"
import { checkOrderMinimum, orderMinimumRefusal } from "@/lib/trade/market-info"
import type { TradeSide } from "@/lib/trade/paper"
import type { WatchPlan } from "@/lib/trade/watch-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { getProtocol } from "@/server/protocols/registry"
import { db, hasWalletPlanWrite, withWalletPlanWrite } from "@/server/trade/db"
import {
  loadCopyConfig,
  recordCopiedFills,
  writeCopyNote,
} from "@/server/trade/copy-ledger"
import { recordEngineError } from "@/server/trade/engine-errors"
import { userMarketRules } from "@/server/trade/leverage-ceilings"
import { liveHeldPositions } from "@/server/trade/live-orders"
import { writeTradeNotice } from "@/server/trade/notices"
import { settleWallet } from "@/server/trade/paper"
import { openPartClose } from "@/server/trade/part-close"
import { loadPublicProfileView } from "@/server/trade/public-profiles"
import {
  tradeCopies,
  tradeCopyFills,
  tradeCopyLegs,
  tradeFollows,
  tradePublicProfiles,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import { findWallet } from "@/server/trade/wallets"

/**
 * Copying, as it happens: a trader's trade is heard, and every copy of that
 * trader's wallet acts on it.
 *
 * ## How a trade is heard
 *
 * Every real fill Trade records goes through `recordLiveFills`, and the fills
 * that were new come here. Only the process whose insert went in sees them,
 * so a fill pushed to both the website and the engine is copied once. The
 * engine keeps a copied trader's wallets heard while the trader's own app is
 * closed; see `hearCopiedTraders`.
 *
 * ## What a copy does with it
 *
 * `decideCopy` says what the trade means for the copy: open, add, take a
 * share off, or nothing. Opening puts the copier's dollars per trade in with
 * a limit order that follows the price the way a part close does, and gives
 * up past the copier's price allowance. Taking a share off is a part close of
 * the same share. Nothing here sends anything to an exchange: it writes the
 * same smart-order row a press does, and the engine places it.
 *
 * ## What it never does
 *
 * It never uses a market order, never touches a stop the copier set, and a
 * pause never closes anything.
 */

type CopyRow = typeof tradeCopies.$inferSelect

const DUST = 1e-9
const DAY_MS = 86_400_000
/** A fill older than this gets no follower notice, the same line the bell uses. */
const NOTICE_IF_NEWER_MS = 15 * 60_000

/**
 * One trader wallet's trades are worked one batch at a time in this process,
 * so two pushes arriving together cannot both read a copy's leg and both act
 * on it.
 */
const queues = new Map<string, Promise<void>>()

function queued(key: string, work: () => Promise<void>): Promise<void> {
  const before = queues.get(key) ?? Promise.resolve()
  const next = before.then(work, work).finally(() => {
    if (queues.get(key) === next) queues.delete(key)
  })
  queues.set(key, next)
  return next
}

/**
 * Fresh real fills of one wallet. The copier side gets fee rows; the trader
 * side is copied and told to followers. Never throws.
 */
export async function copyFreshLiveFills(
  userId: string,
  wallet: TradeWallet,
  fresh: readonly WalletOrderFill[]
): Promise<void> {
  try {
    const fills = fresh.map((fill) => ({
      ...fill,
      marketKey: marketKeyOf({
        protocol: wallet.protocol,
        network: wallet.network,
        marketId: fill.marketId,
      }),
    }))
    await recordCopiedFills(db, userId, wallet, fills)
    if (wallet.kind !== "live" || wallet.network !== "mainnet") return
    await queued(wallet.id, () => shareTraderFills(userId, wallet, fills))
  } catch (error) {
    recordEngineError("copy-engine", "Copying a trader's fills failed", error)
  }
}

type TraderFill = WalletOrderFill & { marketKey: string }

async function shareTraderFills(
  traderUserId: string,
  traderWallet: TradeWallet,
  fills: readonly TraderFill[]
): Promise<void> {
  const [profile] = await db
    .select()
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.userId, traderUserId))
  // Nobody can follow or copy a member without a profile.
  if (!profile) return

  await tellFollowers(
    traderUserId,
    profile.handle,
    profile.enabled && profile.hiddenAt === null,
    fills
  )

  const copies = await db
    .select()
    .from(tradeCopies)
    .where(
      and(
        eq(tradeCopies.traderWalletId, traderWallet.id),
        eq(tradeCopies.traderUserId, traderUserId),
        eq(tradeCopies.status, "active")
      )
    )
  if (copies.length === 0) return

  const stopped = await whyTraderCannotBeCopied(profile)
  if (stopped) {
    await pauseCopies(copies, stopped, profile.handle)
    return
  }

  // What the trader holds now, once for every copy. A failed read leaves the
  // copies to their own memory of the position; see `decideCopy`.
  const held = await liveHeldPositions(traderUserId, traderWallet.id).catch(
    (error) => {
      recordEngineError(
        "copy-engine",
        `Reading trader wallet ${traderWallet.id} failed`,
        error
      )
      return null
    }
  )
  const heldBy = new Map(held?.map((one) => [one.marketKey, one.held]) ?? [])

  const byMarket = new Map<string, TraderFill[]>()
  for (const fill of [...fills].sort((a, b) => a.at - b.at)) {
    const list = byMarket.get(fill.marketKey)
    if (list) list.push(fill)
    else byMarket.set(fill.marketKey, [fill])
  }

  for (const [marketKey, marketFills] of byMarket) {
    let delta = 0
    let cost = 0
    for (const fill of marketFills) {
      const signed = fill.side === "buy" ? fill.sz : -fill.sz
      delta += signed
      cost += fill.px * fill.sz
    }
    const sz = marketFills.reduce((sum, fill) => sum + fill.sz, 0)
    const position = heldBy.get(marketKey)
    const move: TraderMove & { at: number } = {
      delta,
      px: sz > 0 ? cost / sz : marketFills[0].px,
      heldAfter: held === null ? null : (position?.szi ?? 0),
      dir: marketFills[0].dir,
      at: marketFills[marketFills.length - 1].at,
    }
    const leverage = position?.leverage ?? null
    for (const copy of copies) {
      if (move.at < copy.createdAt.getTime()) continue
      try {
        await actOnMove(copy, profile.handle, marketKey, move, leverage)
      } catch (error) {
        recordEngineError(
          "copy-engine",
          `Copy ${copy.id} failed on ${marketKey}`,
          error
        )
        await writeCopyNote({
          copyId: copy.id,
          marketKey: copierMarketKey(marketKey, copy),
          note: copySkipWords(
            { kind: "failed", detail: plainError(error) },
            `@${profile.handle}`,
            marketSymbol(marketKey)
          ),
        })
      }
    }
  }
}

/**
 * The trader's market as the copier's wallet names it. Always the same
 * exchange, and always the main network: a copy is refused a wallet on a test
 * network, whose prices are not the trader's.
 */
function copierMarketKey(traderMarketKey: string, copy: CopyRow): string {
  return traderMarketKey.replace(/^[^:]+:[^:]+:/, `${copy.protocol}:mainnet:`)
}

function plainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const detail = /^[A-Z_]+:(.+)$/s.exec(message)?.[1]
  return detail ?? "the exchange or the engine refused it."
}

/**
 * The sentence behind a stop on new copies, or null when this trader can be
 * copied: a public profile past the leaderboard minimums, "Allow copying" on,
 * and no admin stop.
 */
export async function whyTraderCannotBeCopied(
  profile: typeof tradePublicProfiles.$inferSelect
): Promise<CopyPauseReason | null> {
  if (!profile.enabled || profile.hiddenAt !== null) return "trader-private"
  if (!profile.allowCopying) return "trader-stopped-copying"
  if (profile.copyBlockedAt !== null) return "admin-stopped"
  // The leaderboard minimums, read off the same worked-out page the public
  // sees, which is kept for a minute.
  const view = await loadPublicProfileView(profile.handle)
  return view?.onLeaderboard ? null : "trader-private"
}

/**
 * Pauses copies and tells each copier why. A pause stops new copies and
 * following out alike, and closes nothing: every copied position stays as it
 * is until its copier decides.
 */
export async function pauseCopies(
  copies: readonly Pick<CopyRow, "id" | "copierUserId" | "status">[],
  reason: CopyPauseReason,
  traderHandle: string
): Promise<void> {
  const active = copies.filter((copy) => copy.status === "active")
  if (active.length === 0) return
  const now = new Date()
  await db
    .update(tradeCopies)
    .set({
      status: "paused",
      pausedReason: reason,
      pausedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(
          tradeCopies.id,
          active.map((copy) => copy.id)
        ),
        eq(tradeCopies.status, "active")
      )
    )
  for (const copy of active) {
    await writeTradeNotice({
      userId: copy.copierUserId,
      title: `Copying @${traderHandle} paused`,
      body: `${copyPauseWords(reason, `@${traderHandle}`)} Your copied positions stay open until you close them.`,
      level: "warning",
      href: "/following",
      noticeKey: `copy-paused:${copy.id}:${now.getTime()}`,
    }).catch((error) =>
      recordEngineError("copy-engine", "Copy pause notice failed", error)
    )
  }
}

/** Pauses every running copy of this trader, for a change on their profile. */
export async function pauseCopiesOfTrader(
  traderUserId: string,
  reason: CopyPauseReason
): Promise<void> {
  const [profile] = await db
    .select({ handle: tradePublicProfiles.handle })
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.userId, traderUserId))
  if (!profile) return
  const copies = await db
    .select()
    .from(tradeCopies)
    .where(
      and(
        eq(tradeCopies.traderUserId, traderUserId),
        eq(tradeCopies.status, "active")
      )
    )
  await pauseCopies(copies, reason, profile.handle)
}

/**
 * Why this copier's wallet may not trade the copy right now, or null. Checked
 * on every trade, because a key can stop working and an admin can switch
 * real-money copying off between two trades.
 */
export async function whyCopierCannotTrade(
  copy: CopyRow,
  wallet: TradeWallet | null,
  now: number
): Promise<CopyPauseReason | null> {
  if (!wallet || wallet.status !== "active") return "wallet-gone"
  if (wallet.kind === "live") {
    const config = await loadCopyConfig()
    if (
      !config.realMoney ||
      !REAL_MONEY_COPY_PROTOCOLS.includes(wallet.protocol)
    ) {
      return "real-money-off"
    }
    if (
      !wallet.hasKey ||
      (wallet.keyValidUntil !== null && wallet.keyValidUntil < now)
    ) {
      return "key-not-working"
    }
  }
  if (copy.lossLimitUsd !== null) {
    const made = await copyMadeUsd(copy.id)
    if (made <= -copy.lossLimitUsd) return "loss-limit"
  }
  return null
}

/** What a copy's trades have made or lost so far, after every fee. */
export async function copyMadeUsd(copyId: string): Promise<number> {
  const [row] = await db
    .select({
      made: sql<number>`coalesce(sum(${tradeCopyFills.closedPnl} - ${tradeCopyFills.exchangeFee} - ${tradeCopyFills.feeUsd}), 0)`,
    })
    .from(tradeCopyFills)
    .where(eq(tradeCopyFills.copyId, copyId))
  return Number(row?.made ?? 0)
}

/** What the copier's wallet holds, market by market, signed coins. */
async function copierPositions(
  userId: string,
  wallet: TradeWallet
): Promise<Map<string, { szi: number; entryPx: number }>> {
  if (wallet.kind === "live") {
    const held = await liveHeldPositions(userId, wallet.id)
    return new Map(
      held.map((one) => [
        one.marketKey,
        { szi: one.held.szi, entryPx: one.held.entryPx },
      ])
    )
  }
  const book = await settleWallet(userId, wallet)
  return new Map(
    [...book.positions].map(([key, position]) => [
      key,
      { szi: position.szi, entryPx: position.entryPx },
    ])
  )
}

async function actOnMove(
  copy: CopyRow,
  traderHandle: string,
  traderMarketKey: string,
  move: TraderMove & { at: number },
  traderLeverage: number | null
): Promise<void> {
  const now = Date.now()
  const trader = `@${traderHandle}`
  const marketKey = copierMarketKey(traderMarketKey, copy)
  const coin = marketSymbol(marketKey)
  const note = (skip: CopySkip) =>
    writeCopyNote({
      copyId: copy.id,
      marketKey,
      note: copySkipWords(skip, trader, coin),
    })

  const wallet = await findWallet(copy.copierUserId, copy.copierWalletId)
  const stop = await whyCopierCannotTrade(copy, wallet, now)
  if (stop) {
    await pauseCopies([copy], stop, traderHandle)
    return
  }
  if (!wallet) return

  const [legRow] = await db
    .select()
    .from(tradeCopyLegs)
    .where(
      and(eq(tradeCopyLegs.copyId, copy.id), eq(tradeCopyLegs.marketKey, marketKey))
    )
  const leg = legRow ? { traderSz: legRow.traderSz } : null
  const decision = decideCopy(leg, move)
  if (decision.kind === "ignore") return
  if (decision.kind === "skip") {
    await note({ kind: decision.reason })
    return
  }

  const positions = await copierPositions(copy.copierUserId, wallet)
  const mine = positions.get(marketKey) ?? null
  const mineSz = Math.abs(mine?.szi ?? 0)

  if (decision.kind === "reduce") {
    await saveLeg(copy.id, marketKey, decision.leg?.traderSz ?? null)
    // Anything of this copy still trying to buy on the coin stops first, or
    // it would keep buying into a position the trader has left.
    await stopCopyEntries(copy, marketKey)
    if (decision.turned) await note({ kind: "turned" })
    if (mineSz <= DUST) return
    const whole = decision.share >= 1 - 1e-6
    try {
      await openPartClose(copy.copierUserId, wallet, {
        marketKey,
        size: whole
          ? { unit: "all" }
          : { unit: "coins", amount: mineSz * decision.share },
        how: "limit",
        copyId: copy.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message === "PART_CLOSE_POSITION_GONE") return
      const tooSmall = /^PART_CLOSE_TOO_SMALL:(.+)$/s.exec(message)?.[1]
      if (tooSmall) {
        await note({
          kind: "too-small",
          detail: `${trader} took ${Math.round(decision.share * 100)} out of every 100 coins off ${coin}, but the same share of yours is too small to sell. ${tooSmall} Your copy keeps it until ${trader} sells more.`,
        })
        return
      }
      throw error
    }
    return
  }

  // ----- Opening or adding ----------------------------------------------

  // The trader's position is followed from here whether or not this copy
  // buys, so a later sale is measured against the right size.
  const skipOpen = async (skip: CopySkip) => {
    if (decision.adding) await saveLeg(copy.id, marketKey, decision.leg.traderSz)
    await note(skip)
  }

  if (now - move.at > COPY_MAX_LATE_MS) {
    await skipOpen({
      kind: "late",
      minutes: Math.round((now - move.at) / 60_000),
    })
    return
  }
  if (decision.adding && mineSz <= DUST) {
    await skipOpen({ kind: "copier-closed" })
    return
  }
  // A copy never mixes with a position, or a working order, of the copier's
  // own. Its own rows carry its id; anything else on the coin is theirs.
  if (!decision.adding && (mineSz > DUST || (await ownOrdersOn(copy, marketKey)))) {
    await note({ kind: "own-position" })
    return
  }
  const ref = parseMarketKey(marketKey)
  if (!ref) return
  const marketId = ref.marketId
  if (
    copy.coins !== null &&
    !copy.coins.some((coin) => coin.toLowerCase() === marketId.toLowerCase())
  ) {
    await skipOpen({ kind: "not-on-list" })
    return
  }
  const rules = await userMarketRules(
    copy.copierUserId,
    wallet.protocol,
    wallet.network,
    marketId
  )
  const volumeUsd = rules?.volume24hUsd ?? 0
  if (volumeUsd < COPY_MIN_DAILY_VOLUME_USD) {
    await skipOpen({ kind: "thin-market", volumeUsd })
    return
  }
  const copiedUsd = await copiedTodayUsd(marketKey, now)
  if (
    copiedUsd + copy.dollarsPerTrade >
    volumeUsd * COPY_MAX_SHARE_OF_DAILY_VOLUME
  ) {
    await skipOpen({ kind: "market-share", copiedUsd, volumeUsd })
    return
  }
  const leverage = Math.max(1, Math.round(traderLeverage ?? 1))
  if (leverage > copy.maxLeverage) {
    await skipOpen({
      kind: "leverage",
      traderLeverage: leverage,
      maxLeverage: copy.maxLeverage,
    })
    return
  }
  const protocol = getProtocol(wallet.protocol)
  const mark = (await protocol.markets.prices(wallet.network, [marketId])).get(
    marketId
  )
  if (mark === undefined || !(mark > 0) || !rules) {
    await skipOpen({ kind: "no-price" })
    return
  }
  const moved =
    decision.side === "buy"
      ? mark > move.px * (1 + copy.priceAllowance)
      : mark < move.px * (1 - copy.priceAllowance)
  if (moved) {
    await skipOpen({
      kind: "price-moved",
      traderPx: move.px,
      nowPx: mark,
      allowance: copy.priceAllowance,
    })
    return
  }
  const openUsd = await copiedOpenUsd(copy, positions, mark, marketKey)
  if (openUsd + copy.dollarsPerTrade > copy.maxOpenUsd + 1e-9) {
    await skipOpen({
      kind: "cap",
      wouldBeUsd: openUsd + copy.dollarsPerTrade,
      maxOpenUsd: copy.maxOpenUsd,
    })
    return
  }
  const minimum = checkOrderMinimum(
    {
      sizeDecimals: rules.sizeDecimals,
      minOrderValueUsd: rules.minOrderValueUsd ?? null,
      minOrderSize: rules.minOrderSize ?? null,
    },
    mark,
    copy.dollarsPerTrade / mark
  )
  if (minimum.tooSmall) {
    await skipOpen({
      kind: "too-small",
      detail: orderMinimumRefusal(protocol.label, minimum),
    })
    return
  }

  await openCopyEntry(copy, wallet, {
    marketKey,
    side: decision.side,
    sz: minimum.size,
    leverage: Math.min(leverage, rules.maxLeverage ?? leverage),
    maxLeverage: rules.maxLeverage ?? 1,
    traderPx: move.px,
    heldAtStart: mineSz,
    rules,
  })
  await saveLeg(copy.id, marketKey, decision.leg.traderSz)
}

/**
 * Closes every position a copy is following, with the same chased limit order
 * a part close uses, and calls off anything of it still trying to buy. Says
 * how many closes it started. A coin that cannot be closed gets a Journal row.
 */
export async function closeCopiedPositions(copy: CopyRow): Promise<number> {
  const wallet = await findWallet(copy.copierUserId, copy.copierWalletId)
  if (!wallet) return 0
  const legs = await db
    .select({ marketKey: tradeCopyLegs.marketKey })
    .from(tradeCopyLegs)
    .where(eq(tradeCopyLegs.copyId, copy.id))
  if (legs.length === 0) return 0
  const positions = await copierPositions(copy.copierUserId, wallet)
  let closing = 0
  for (const { marketKey } of legs) {
    await stopCopyEntries(copy, marketKey)
    if (Math.abs(positions.get(marketKey)?.szi ?? 0) <= DUST) continue
    try {
      await openPartClose(copy.copierUserId, wallet, {
        marketKey,
        size: { unit: "all" },
        how: "limit",
        copyId: copy.id,
      })
      closing += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message === "PART_CLOSE_POSITION_GONE") continue
      await writeCopyNote({
        copyId: copy.id,
        marketKey,
        note: `Stopping the copy could not close ${marketSymbol(marketKey)}: ${plainError(error)} Close it from Positions.`,
      })
    }
  }
  return closing
}

async function saveLeg(
  copyId: string,
  marketKey: string,
  traderSz: number | null
): Promise<void> {
  if (traderSz === null || Math.abs(traderSz) <= DUST) {
    await db
      .delete(tradeCopyLegs)
      .where(
        and(eq(tradeCopyLegs.copyId, copyId), eq(tradeCopyLegs.marketKey, marketKey))
      )
    return
  }
  await db
    .insert(tradeCopyLegs)
    .values({ copyId, marketKey, traderSz, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tradeCopyLegs.copyId, tradeCopyLegs.marketKey],
      set: { traderSz, updatedAt: new Date() },
    })
}

/** Working smart orders on this coin that are not this copy's own. */
async function ownOrdersOn(copy: CopyRow, marketKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tradeSmartLadders.id })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, copy.copierUserId),
        eq(tradeSmartLadders.walletId, copy.copierWalletId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.status, "active"),
        sql`coalesce(${tradeSmartLadders.plan}->>'copyId', '') <> ${copy.id}`
      )
    )
    .limit(1)
  return row !== undefined
}

/** Copied dollars on this market in the last day, every copier together. */
async function copiedTodayUsd(marketKey: string, now: number): Promise<number> {
  const [row] = await db
    .select({
      usd: sql<number>`coalesce(sum(${tradeCopyFills.notionalUsd}), 0)`,
    })
    .from(tradeCopyFills)
    .where(
      and(
        eq(tradeCopyFills.marketKey, marketKey),
        gt(tradeCopyFills.at, now - DAY_MS)
      )
    )
  return Number(row?.usd ?? 0)
}

/**
 * Dollars in this copy's positions right now: every coin it follows, at the
 * price of today where it has one and at what it paid otherwise.
 */
async function copiedOpenUsd(
  copy: CopyRow,
  positions: ReadonlyMap<string, { szi: number; entryPx: number }>,
  markHere: number,
  marketHere: string
): Promise<number> {
  const legs = await db
    .select({ marketKey: tradeCopyLegs.marketKey })
    .from(tradeCopyLegs)
    .where(eq(tradeCopyLegs.copyId, copy.id))
  let total = 0
  for (const leg of legs) {
    const held = positions.get(leg.marketKey)
    if (!held) continue
    const px = leg.marketKey === marketHere ? markHere : held.entryPx
    total += Math.abs(held.szi) * px
  }
  return total
}

/**
 * Calls off this copy's unfinished buying on a coin. One not yet sent is
 * deleted; one that may have an order out is marked stopping, and the
 * engine's next pass takes the order back.
 */
async function stopCopyEntries(copy: CopyRow, marketKey: string): Promise<void> {
  await db
    .update(tradeSmartLadders)
    .set({
      // Unpaused as well: the engine skips a paused row, and a paused copy
      // order marked stopping would otherwise never be taken back. The same
      // rule `cancelWatchOrder` follows.
      plan: sql`${tradeSmartLadders.plan} || '{"phase":"stopping","paused":false,"pauseReason":null,"refusalStreak":0}'::jsonb`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradeSmartLadders.userId, copy.copierUserId),
        eq(tradeSmartLadders.walletId, copy.copierWalletId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.kind, "watch"),
        eq(tradeSmartLadders.status, "active"),
        sql`${tradeSmartLadders.plan}->>'copyId' = ${copy.id}`,
        sql`${tradeSmartLadders.plan}->>'reduceOnly' = 'false'`
      )
    )
}

/**
 * Writes the copy's opening order: a limit that rests just off the price and
 * follows it, and gives up once the price has run past the copier's
 * allowance from the trader's price. The engine places it.
 */
async function openCopyEntry(
  copy: CopyRow,
  wallet: TradeWallet,
  input: {
    marketKey: string
    side: TradeSide
    sz: number
    leverage: number
    maxLeverage: number
    traderPx: number
    heldAtStart: number
    rules: NonNullable<Awaited<ReturnType<typeof userMarketRules>>>
  }
): Promise<void> {
  if (!hasWalletPlanWrite(copy.copierUserId, wallet.id)) {
    return await withWalletPlanWrite(copy.copierUserId, wallet.id, () =>
      openCopyEntry(copy, wallet, input)
    )
  }
  const now = new Date()
  const plan: WatchPlan = {
    triggerPx: input.traderPx,
    side: input.side,
    sz: floorSize(input.sz, input.rules.sizeDecimals),
    leverage: input.leverage,
    maxLeverage: input.maxLeverage,
    sizeDecimals: input.rules.sizeDecimals,
    minOrderSize: input.rules.minOrderSize ?? null,
    minOrderValueUsd: input.rules.minOrderValueUsd ?? null,
    priceTick: input.rules.priceTick,
    // A copy carries no stop of its own. The trader's stop reaches it as a
    // sale, and any stop the copier sets by hand stays theirs.
    tpPx: null,
    slPx: null,
    reduceOnly: false,
    riskSized: false,
    maker: true,
    heldAtStart: input.heldAtStart,
    chaseGiveUp: copy.priceAllowance,
    phase: "taking",
    sent: false,
    clientOrderId: null,
    orderId: null,
    orderPx: null,
    missingSince: 0,
    heldWhenPlaced: 0,
    ownSz: null,
    ownStop: null,
    chasedAt: 0,
    chases: 0,
    startedAt: now.getTime(),
    copyId: copy.id,
  }
  await db.transaction(async (tx) => {
    // The lock every placement takes, so a press and a copy on one wallet
    // cannot both size themselves against the same position.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(
          eq(tradeWallets.userId, copy.copierUserId),
          eq(tradeWallets.id, wallet.id)
        )
      )
      .for("update")
    await tx.insert(tradeSmartLadders).values({
      userId: copy.copierUserId,
      id: randomUUID(),
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "watch",
      status: "active",
      plan,
      createdAt: now,
      updatedAt: now,
    })
  })
}

/**
 * One notice per closed trade to everybody following the trader: the coin and
 * the dollars. Only for a public profile, and only for fills made just now,
 * so a wallet's first read of months of history tells nobody anything.
 */
async function tellFollowers(
  traderUserId: string,
  handle: string,
  isPublic: boolean,
  fills: readonly TraderFill[]
): Promise<void> {
  if (!isPublic) return
  const cutoff = Date.now() - NOTICE_IF_NEWER_MS
  const closes = new Map<string, { money: number; at: number }>()
  for (const fill of fills) {
    if (fill.at < cutoff || !fill.dir.startsWith("Close")) continue
    const entry = closes.get(fill.marketKey) ?? { money: 0, at: fill.at }
    entry.money += fill.closedPnl - fill.fee
    entry.at = Math.max(entry.at, fill.at)
    closes.set(fill.marketKey, entry)
  }
  if (closes.size === 0) return
  const followers = await db
    .select({ userId: tradeFollows.followerUserId })
    .from(tradeFollows)
    .where(
      and(
        eq(tradeFollows.traderUserId, traderUserId),
        ne(tradeFollows.followerUserId, traderUserId)
      )
    )
  for (const [marketKey, close] of closes) {
    const coin = marketSymbol(marketKey)
    const body =
      Math.abs(close.money) < 0.005
        ? `@${handle} closed ${coin} and broke even.`
        : `@${handle} closed ${coin} and ${close.money > 0 ? "made" : "lost"} ${formatSignedUsd(close.money).replace(/^[+-]/, "")}.`
    for (const follower of followers) {
      await writeTradeNotice({
        userId: follower.userId,
        title: `@${handle} closed a trade`,
        body,
        level: "info",
        href: `/t/${handle}`,
        noticeKey: `follow-close:${traderUserId}:${marketKey}:${close.at}`,
      }).catch((error) =>
        recordEngineError("copy-engine", "Follower notice failed", error)
      )
    }
  }
}

// ----- Keeping traders heard ------------------------------------------------

let hearingAt = 0
const HEAR_EVERY_MS = 5_000

/**
 * Keeps every copied or followed trader's wallets heard, from the engine.
 *
 * A trader's trades are only recorded while something reads their wallet, and
 * the trader's own app is not always open. On an exchange that pushes fills,
 * this keeps the push open, which costs nothing per trade. On one that has to
 * be asked, it asks every two minutes, and only for a trader somebody is
 * copying: a follower's notice is not worth a poll.
 */
export async function hearCopiedTraders(now = Date.now()): Promise<void> {
  if (now - hearingAt < HEAR_EVERY_MS) return
  hearingAt = now
  try {
    const copied = await db
      .selectDistinct({
        userId: tradeCopies.traderUserId,
        walletId: tradeCopies.traderWalletId,
      })
      .from(tradeCopies)
      .where(eq(tradeCopies.status, "active"))
    const followed = await db
      .select({ userId: tradeWallets.userId, walletId: tradeWallets.id })
      .from(tradeWallets)
      .innerJoin(
        tradeFollows,
        eq(tradeFollows.traderUserId, tradeWallets.userId)
      )
      .innerJoin(
        tradePublicProfiles,
        and(
          eq(tradePublicProfiles.userId, tradeWallets.userId),
          eq(tradePublicProfiles.enabled, true),
          isNull(tradePublicProfiles.hiddenAt)
        )
      )
      .where(
        and(
          eq(tradeWallets.kind, "live"),
          eq(tradeWallets.network, "mainnet"),
          eq(tradeWallets.status, "active")
        )
      )
    const copiedKeys = new Set(copied.map((one) => `${one.userId} ${one.walletId}`))
    const keys = new Map<string, { userId: string; walletId: string }>()
    for (const one of [...copied, ...followed]) {
      keys.set(`${one.userId} ${one.walletId}`, one)
    }
    if (keys.size === 0) return
    const [{ hearWalletFills }, { walletCredential }, { ordersOf }] =
      await Promise.all([
        import("@/server/trade/live-fills"),
        import("@/server/trade/wallet-auth"),
        import("@/server/protocols/registry"),
      ])
    for (const [key, one] of keys) {
      const wallet = await findWallet(one.userId, one.walletId)
      if (!wallet || wallet.kind !== "live" || wallet.status !== "active") {
        continue
      }
      const pushed = Boolean(ordersOf(getProtocol(wallet.protocol)).watchFills)
      if (!pushed && !copiedKeys.has(key)) continue
      const credential = await walletCredential(one.userId, one.walletId)
      // "Not watched": the two-minute clock for an exchange that has to be
      // asked. A pushed exchange asks nothing while its feed is healthy.
      await hearWalletFills(one.userId, wallet, credential, false)
    }
  } catch (error) {
    recordEngineError("copy-engine", "Hearing copied traders failed", error)
  }
}
