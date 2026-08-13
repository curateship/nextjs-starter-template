import * as React from "react"
import { toast } from "sonner"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getWalletErrorMessage, loadWalletAccounts } from "@/lib/api/wallets"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import type { ProtocolId } from "@/lib/protocols/contracts"
import {
  DEFAULT_BACKTEST_PROTOCOL,
  tradeMarketsNode,
} from "@/lib/automations/nodes/trade-markets"
import {
  chosenWallet,
  MAX_POT_USD,
  tradeWalletNode,
  tradeWalletSettingsSchema,
  walletMoneyWords,
} from "@/lib/automations/nodes/trade-wallet"
import { plural } from "@/lib/format/plural"
import { formatUsd } from "@/lib/trade/format"
import { keyExpiryWarning } from "@/lib/trade/live"
import {
  venueLabel,
  type TradeWallet,
  type WalletAccountSummary,
} from "@/lib/trade/wallets"

/**
 * The wallet step's settings: which money, and how much of it.
 *
 * Read through the step's own schema, with the step's own defaults standing in
 * for anything unreadable, so a flow saved by an older build opens with sensible
 * numbers rather than empty boxes.
 *
 * The panel has two shapes and one switch between them. Pretend money is a pot
 * and what trading costs — the backtest it always was. A named wallet is one
 * number, the most of that wallet this flow may spend, and the fee boxes go:
 * a real exchange charges what it charges, and a box that appeared to change
 * that would be a lie in the one place lies cost money.
 */

/** The Select's value for "no wallet", since a Select cannot hold null. */
const PRETEND = "pretend"

/**
 * The wallet list, kept for the tab rather than fetched every time the step is
 * opened.
 *
 * Clicking the step, clicking away and clicking back asked the exchange for
 * every live account all over again, and the picker sat on "Reading your
 * wallets…" each time — a spinner where a list had been a second earlier reads
 * as the app losing its place.
 *
 * A minute, not the market list's ten: the figure under the cap is what a
 * wallet has free right now, and that one really does move. A minute is instant
 * to use and never meaningfully wrong for deciding a cap; "Try again" asks
 * afresh, and so does a reload.
 *
 * Module scope, not a hook, because it has to outlive the panel being
 * unmounted — which is the whole case it exists for.
 */
const WALLETS_CACHE_MS = 60_000
let walletCache: {
  at: number
  wallets: TradeWallet[]
  summaries: WalletAccountSummary[]
} | null = null

export default function TradeWalletFields({
  node,
  graph,
  onChange,
}: AutomationNodeFieldsProps) {
  const parsed = tradeWalletSettingsSchema.safeParse(node.settings)
  const settings = parsed.success
    ? parsed.data
    : tradeWalletSettingsSchema.parse(tradeWalletNode.createSettings())

  const set = (patch: Partial<typeof settings>) =>
    onChange({ ...node, settings: { ...settings, ...patch } })

  // Read straight off the step rather than through the parse. A number
  // elsewhere on the step that will not parse drops every field back to its
  // default, and the one thing that must never be hidden that way is the fact
  // that this flow trades a wallet — the panel would quietly draw a backtest.
  const named = chosenWallet(node.settings)

  /**
   * What the last read came back with — the list, the figures, or the reason
   * there are none.
   *
   * One piece of state rather than three, and it carries the clock as it was
   * when the answer landed. A render may not read a clock, and the trading
   * key's expiry has to be measured against one; the moment the wallets were
   * read is the honest answer and it never shifts under a re-render.
   */
  const [answer, setAnswer] = React.useState<{
    wallets: TradeWallet[] | null
    summaries: WalletAccountSummary[]
    error: string | null
    readAt: number
  } | null>(null)
  /** Bumped by "Try again", which asks the server afresh. */
  const [attemptKey, setAttemptKey] = React.useState(0)

  React.useEffect(() => {
    let alive = true

    void (async () => {
      // What is already known is read while drawing, so re-opening the step is
      // already on screen by the time this runs. Whether that copy is stale is
      // asked here rather than up there, because a render may not read a clock.
      if (
        walletCache &&
        Date.now() - walletCache.at < WALLETS_CACHE_MS &&
        attemptKey === 0
      ) {
        return
      }
      try {
        const read = await loadWalletAccounts()
        walletCache = {
          at: Date.now(),
          wallets: read.wallets,
          summaries: read.summaries,
        }
        if (!alive) return
        setAnswer({
          wallets: read.wallets,
          summaries: read.summaries,
          error: null,
          readAt: Date.now(),
        })
      } catch (error: unknown) {
        if (!alive) return
        setAnswer({
          wallets: null,
          summaries: [],
          error: getWalletErrorMessage(error),
          readAt: Date.now(),
        })
      }
    })()

    return () => {
      alive = false
    }
  }, [attemptKey])

  // The fetch's answer if there is one, and whatever was already known
  // otherwise — so the second time this step is opened it draws filled in.
  const held = walletCache
  const wallets = answer?.wallets ?? held?.wallets ?? null
  /** When those figures were true. Zero means nothing has landed yet. */
  const readAt = answer?.readAt ?? held?.at ?? 0
  // A read that failed while a list is already in hand is not worth a banner
  // over the top of a list that still works. It only speaks when there is
  // nothing else to show.
  const loadError = wallets === null ? (answer?.error ?? null) : null
  // Only wallets that could actually be traded are offered. An inactive one is
  // switched off everywhere else in the app, and offering it here would be the
  // one place it could be picked back up by accident.
  const offered = wallets?.filter((one) => one.status === "active") ?? []
  const row = wallets?.find((one) => one.id === named?.id) ?? null
  const figures =
    (answer?.summaries ?? held?.summaries ?? []).find(
      (one) => one.walletId === named?.id
    ) ?? null
  const freeCash = figures && figures.state === "ok" ? figures.free : null

  // A wallet renamed in the account panel leaves the copy on this step behind,
  // and that copy is what the canvas card draws. Correcting it here means a
  // rename fixes itself the next time the step is opened. Only the name can
  // drift — a wallet's kind is fixed when it is made.
  //
  // It also fills in the exchange and network on a step saved before those
  // were carried, which is what lets the Markets step narrow itself without a
  // migration — opening this step once is the whole upgrade.
  React.useEffect(() => {
    if (!row) return
    const s = node.settings
    if (
      s.walletLabel === row.label &&
      s.walletProtocol === row.protocol &&
      s.walletNetwork === row.network
    ) {
      return
    }
    // Written onto the step's own settings rather than the parsed copy: this
    // is a correction to three remembered facts, and it must not quietly
    // repair — or reset — any number sitting beside them.
    onChange({
      ...node,
      settings: {
        ...node.settings,
        walletLabel: row.label,
        walletProtocol: row.protocol,
        walletNetwork: row.network,
      },
    })
  }, [row, node, onChange])

  /** Why this step cannot be run as it stands, in one sentence, or null. */
  const walletProblem = ((): string | null => {
    if (!named || wallets === null) return null
    if (!row) {
      return `${named.label} has been deleted, so this flow has nothing to trade. Pick another wallet.`
    }
    if (row.status !== "active") {
      return `${row.label} is switched off. Make it active in the account panel, or pick another wallet.`
    }
    if (row.kind === "live" && !row.hasKey) {
      return `${row.label} has no trading key saved, so it cannot place an order. Add one in the account panel.`
    }
    return null
  })()

  /** Worth saying about the wallet itself, but not a reason to stop. */
  const walletWarning = ((): string | null => {
    if (!row || walletProblem || readAt === 0) return null
    if (row.kind === "live") {
      const expiry = keyExpiryWarning(row.keyValidUntil, readAt)
      if (expiry) return expiry
    }
    if (figures?.state === "unreachable" && row.kind === "live") {
      return `${row.label} could not be reached just now, so what it holds is not shown. That is usually a hiccup at the exchange.`
    }
    return null
  })()

  /**
   * What the wallet holds, said once, under the box it is about.
   *
   * A cap bigger than the free cash is worth saying and is not worth
   * refusing — cash moves, and refusing on a figure that is already out of
   * date would refuse the wrong thing.
   */
  /**
   * Move the Markets step onto the new wallet's exchange, in the same click.
   *
   * **Why it happens here and not there.** A wallet can only trade its own
   * exchange, so the moment somebody picks a different wallet the coin list is
   * the wrong list — and leaving the Markets step to notice later means being
   * told about it on a screen you are not looking at. Doing it here makes it
   * the consequence of something you just did.
   *
   * The coins go with it, because a market name carries its exchange inside it
   * and none of them survive the move. That is a real loss, so it is said out
   * loud rather than discovered.
   *
   * The editor applies a changed step by its id, so a panel can hand it a step
   * other than its own. That is the only way one step can follow another; it is
   * used deliberately and nowhere else.
   */
  function followWithMarkets(protocol: ProtocolId, because: string) {
    const markets = graph?.nodes.find(
      (one) => one.kind === tradeMarketsNode.kind
    )
    if (!markets) return
    const was = markets.settings.protocol
    if (was === protocol) return

    const hadCoins = Array.isArray(markets.settings.marketKeys)
      ? markets.settings.marketKeys.length
      : 0
    onChange({
      ...markets,
      settings: { ...markets.settings, protocol, marketKeys: [] },
    })
    // The exchange's proper name, the way every other screen writes it. The
    // raw id is what is stored; "hyperliquid" in a sentence beside a dropdown
    // reading "Hyperliquid" reads as two different things.
    const name = venueLabel(protocol, "mainnet")
    toast.success(
      hadCoins > 0
        ? `Markets moved to ${name} ${because}. Its ${hadCoins} ${plural(hadCoins, "coin was", "coins were")} cleared — pick them again.`
        : `Markets moved to ${name} ${because}.`
    )
  }

  /** The cap as saved, falling back to the pot it stands in for. */
  const capUsd = named?.capUsd ?? settings.startingUsd
  const overCap = freeCash !== null && named !== null && capUsd > freeCash

  return (
    <>
      <InspectorCard title="Which wallet">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`wallet-${node.id}-which`}
            className="text-xs"
            hint="Pretend money means this flow is a backtest — it invents a wallet for the run and throws it away. Naming one of your wallets means the flow trades it forward, and nothing about the rest of the flow changes."
          >
            Money
          </FieldLabel>
          {/* Never a spinner here.
              The step already remembers which wallet it names and what it is
              called, so the box can be drawn correctly on the very first paint
              and the rest of the list can arrive behind it. A cache only ever
              fixed the second visit; this fixes the first one, and every
              reload. */}
          <Select
              value={named?.id ?? PRETEND}
              onValueChange={(next) => {
                if (next === PRETEND) {
                  // Back to a backtest, which reads price history and sends
                  // nothing anywhere — so it goes to whichever exchange has the
                  // most history to read, not to the one it was trading.
                  followWithMarkets(
                    DEFAULT_BACKTEST_PROTOCOL,
                    "— a backtest reads its price history"
                  )
                  set({
                    walletId: null,
                    walletLabel: null,
                    walletKind: null,
                    walletProtocol: null,
                    walletNetwork: null,
                    spendCapUsd: null,
                  })
                  return
                }
                const picked = offered.find((one) => one.id === next)
                if (!picked) return
                followWithMarkets(picked.protocol, `to match ${picked.label}`)
                set({
                  walletId: picked.id,
                  walletLabel: picked.label,
                  walletKind: picked.kind,
                  walletProtocol: picked.protocol,
                  walletNetwork: picked.network,
                  // The pot the strategy was tested with carries over as the
                  // amount somebody is willing to commit. It is a starting
                  // point they can see and change, not a guess hidden from
                  // them — and the line under the box says what the wallet
                  // actually holds.
                  spendCapUsd: named?.capUsd ?? settings.startingUsd,
                })
              }}
            >
              <SelectTrigger
                id={`wallet-${node.id}-which`}
                className="w-full sm:w-fit"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PRETEND}>
                  Pretend money — for backtests
                </SelectItem>
                {offered.map((one) => (
                  <SelectItem key={one.id} value={one.id}>
                    {one.label} — {walletMoneyWords(one.kind)} on{" "}
                    {venueLabel(one.protocol, one.network)}
                  </SelectItem>
                ))}
                {/* The wallet this step names, whenever it is not in the list
                    on offer — either because the list has not arrived yet, or
                    because the wallet is gone. Without it the box would sit
                    blank with no clue what it is set to. Which of the two it
                    is gets said underneath, and only once the list is in. */}
                {named && !offered.some((one) => one.id === named.id) ? (
                  <SelectItem value={named.id}>
                    {named.label}
                    {wallets === null ? "" : " — not available"}
                  </SelectItem>
                ) : null}
              </SelectContent>
          </Select>
        </div>

        {loadError ? (
          <ErrorBanner
            message={loadError}
            onRetry={() => setAttemptKey((n) => n + 1)}
          />
        ) : null}

        {walletProblem ? (
          <p className="text-xs text-destructive">{walletProblem}</p>
        ) : walletWarning ? (
          <p className="text-xs text-destructive">{walletWarning}</p>
        ) : null}
      </InspectorCard>

      {named ? (
        <InspectorCard title="Money this flow may use">
          <TradeNumberField
            id={`wallet-${node.id}-cap`}
            label="Most it may spend"
            hint="The pot this flow works with. Every coin shares it, and the ladder's 'most of the pot, per coin' is measured against this — so the sums are the same ones the backtest used, with this standing in for the starting money."
            value={capUsd}
            min={1}
            max={MAX_POT_USD}
            suffix="$"
            onChange={(spendCapUsd) => set({ spendCapUsd })}
          />
          {freeCash !== null ? (
            <p
              className={
                overCap ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {named.label} has {formatUsd(freeCash)} free right now
              {overCap
                ? ", which is less than this cap. A buy it cannot afford when its turn comes is refused, never shrunk."
                : "."}
            </p>
          ) : null}
        </InspectorCard>
      ) : (
        <>
          <InspectorCard title="The pot">
            <TradeNumberField
              id={`wallet-${node.id}-start`}
              label="Starting money"
              hint="What the whole test starts with. Every coin shares it, so this is the money the strategy has to work with in total — not per coin."
              value={settings.startingUsd}
              min={1}
              max={MAX_POT_USD}
              suffix="$"
              onChange={(startingUsd) => set({ startingUsd })}
            />
          </InspectorCard>

          <InspectorCard title="What trading costs">
            <TradeNumberField
              id={`wallet-${node.id}-taker`}
              label="Taker fee"
              hint="Charged when a buy or sell takes a price that is already on the book — market buys and stops. Prefilled with what the exchange really charges."
              value={settings.takerFeePct}
              min={0}
              max={5}
              suffix="%"
              onChange={(takerFeePct) => set({ takerFeePct })}
            />
            <TradeNumberField
              id={`wallet-${node.id}-maker`}
              label="Maker fee"
              hint="Charged when an order sat and waited to be filled — the ladder's rungs and its take-profit sells."
              value={settings.makerFeePct}
              min={0}
              max={5}
              suffix="%"
              onChange={(makerFeePct) => set({ makerFeePct })}
            />
            <TradeNumberField
              id={`wallet-${node.id}-slippage`}
              label="Slippage"
              hint="How much worse than the price on the line a market order really fills. Only stops and market buys pay it; orders that waited get the price they asked for."
              value={settings.slippagePct}
              min={0}
              max={5}
              suffix="%"
              onChange={(slippagePct) => set({ slippagePct })}
            />
          </InspectorCard>
        </>
      )}

      <InspectorNote>
        {named
          ? `This flow spends ${named.label} — ${walletMoneyWords(named.kind)}. Nothing is set aside: the rest of the wallet stays free, and so does this until a buy actually happens.`
          : "Pretend money only. A backtest never touches a real or a practice wallet, and nothing here can move a cent. Funding uses the exchange's historical rates at each funding time and is listed on the results page."}
      </InspectorNote>
    </>
  )
}
