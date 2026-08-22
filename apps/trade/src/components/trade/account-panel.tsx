import * as React from "react"
import {
  ArchiveIcon,
  CreditCardIcon,
  InfoIcon,
  LayersIcon,
  PlusIcon,
} from "lucide-react"

import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { useTradeAccount } from "@/components/trade/use-trade-account"
import { Button } from "@/components/ui/button"
import { WorkspacePanelTab } from "@/components/shared/workspace-panel-header"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { keyExpiryWarning } from "@/lib/trade/live"
import { moneyTone } from "@/lib/trade/money-tone"
import {
  venueLabel,
  type TradeWallet,
  type WalletAccountSummary,
} from "@/lib/trade/wallets"
import { cn } from "@/lib/utils"

/**
 * The right panel's top card: the active wallet's figures, and the All tab
 * that lists every wallet. Purely a view — the state comes in from the one
 * `useTradeAccount` the workspace owns, and the two dialogs (add, edit) are
 * the workspace's too, so the narrow-screen sheet and the desktop column can
 * never hold two copies of either.
 */

export function KindBadge({ kind }: { kind: TradeWallet["kind"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        kind === "paper"
          ? "bg-muted text-muted-foreground"
          : "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
      )}
    >
      {kind === "paper" ? "Paper" : "Live"}
    </span>
  )
}

/** A gain or loss, painted by the one helper every money figure uses. */
function SignedUsd({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return (
    <span className={cn("tabular-nums", moneyTone(value), className)}>
      {formatSignedUsd(value)}
    </span>
  )
}

function FigureRow({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function useKeyExpiryWarning(keyValidUntil: number | null) {
  const [readAt, setReadAt] = React.useState(Date.now)
  React.useEffect(() => {
    const timer = window.setInterval(() => setReadAt(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return keyExpiryWarning(keyValidUntil, readAt)
}

/**
 * The trading key is running out (or has). Said on the wallet itself, where
 * the fix is one click away, and only while it is worth saying.
 */
function KeyExpiryNotice({ wallet }: { wallet: TradeWallet }) {
  const warning = useKeyExpiryWarning(wallet.keyValidUntil)
  if (!warning) return null
  return (
    <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
      {warning}
    </p>
  )
}

function ActiveWalletView({
  wallet,
  summary,
  onRetry,
}: {
  wallet: TradeWallet
  summary: WalletAccountSummary | null
  onRetry: () => void
}) {
  const ok = summary !== null && summary.state === "ok"
  // Real figures, just not this second's — the exchange has missed a read or
  // two. Said quietly rather than shouted: nothing here is wrong, it is only
  // a moment behind.
  const stale = summary?.state === "ok" && summary.stale === true
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold">
              {wallet.label}
            </span>
            <KindBadge kind={wallet.kind} />
          </span>
          {ok ? (
            <span className="shrink-0 text-lg font-semibold tabular-nums">
              {formatUsd(summary.equity)}
            </span>
          ) : null}
        </div>
        {/* Its own full-width row, so the money above never squeezes it. */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            {venueLabel(wallet.protocol, wallet.network)}
            {" · "}
            {ok
              ? stale
                ? "Figures a moment old"
                : "Connected"
              : summary?.state === "inactive"
                ? "Not switched on"
                : "Can't reach it"}
          </span>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              !ok ? "bg-destructive" : stale ? "bg-amber-500" : "bg-emerald-500"
            )}
            aria-hidden
          />
        </div>
      </div>

      <KeyExpiryNotice wallet={wallet} />

      {ok ? (
        <div className="flex flex-col gap-0.5 text-xs">
          <FigureRow label="Free">
            <span className="tabular-nums">{formatUsd(summary.free)}</span>
          </FigureRow>
          <FigureRow label="In trades">
            <span className="tabular-nums">{formatUsd(summary.inTrades)}</span>
          </FigureRow>
          <FigureRow label="Open profit">
            <SignedUsd value={summary.openProfit} />
          </FigureRow>
          <FigureRow
            label={
              <span className="flex items-center gap-1">
                Settled
                {summary.unpricedFills ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="About settled profit"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <InfoIcon className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      Settled and Made or lost are short of{" "}
                      {summary.unpricedFills.toLocaleString()}{" "}
                      {summary.unpricedFills === 1 ? "trade" : "trades"} whose
                      profit the exchange has not stated.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            }
          >
            <SignedUsd value={summary.settled} />
          </FigureRow>
          <FigureRow label="Made or lost">
            <SignedUsd value={summary.madeOrLost} />
          </FigureRow>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          <p>
            The exchange did not answer for this wallet, so there are no figures
            to show — showing zeros would be making them up.
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

function WalletCard({
  wallet,
  summary,
  active,
  onOpen,
}: {
  wallet: TradeWallet
  summary: WalletAccountSummary | null
  /** This is the wallet being traded with — the card says so. */
  active: boolean
  onOpen: () => void
}) {
  const ok = summary !== null && summary.state === "ok"
  const expiryWarning = useKeyExpiryWarning(wallet.keyValidUntil)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
        active
          ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
          : "bg-muted/20 hover:bg-muted/40"
      )}
      aria-label={`${wallet.label}${active ? " — the wallet in use" : ""} — open wallet settings`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{wallet.label}</span>
          <KindBadge kind={wallet.kind} />
        </span>
        {ok ? (
          <SignedUsd value={summary.openProfit} className="shrink-0 text-sm" />
        ) : (
          <span className="shrink-0 text-sm text-destructive">
            Can't reach it
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold tabular-nums">
          {ok ? formatUsd(summary.equity) : "—"}
        </span>
        {active ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              aria-hidden
            />
            Live
          </span>
        ) : wallet.status === "inactive" ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Inactive
          </span>
        ) : null}
      </div>
      {expiryWarning ? (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
          {expiryWarning}
        </p>
      ) : null}
    </button>
  )
}

/**
 * What the Active tab shows when wallets exist but none has been picked —
 * after a first add elsewhere, or once the chosen wallet was deleted.
 *
 * It asks rather than choosing: an order goes to whichever wallet is active,
 * and landing on whichever happened to be created first is exactly the kind
 * of guess that trades the wrong money. Each row picks that wallet outright;
 * editing one still lives behind its card on the All tab.
 */
function ChooseWalletView({
  wallets,
  summaryOf,
  onUseWallet,
}: {
  wallets: TradeWallet[]
  summaryOf: (walletId: string) => WalletAccountSummary | null
  onUseWallet: (walletId: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <p className="text-sm font-medium">Which wallet are you trading with?</p>
      <p className="text-xs text-muted-foreground">
        Pick one and it stays picked. Orders go to this wallet, so nothing is
        chosen for you.
      </p>
      <div className="mt-1 flex flex-col gap-1.5">
        {wallets.map((wallet) => {
          const summary = summaryOf(wallet.id)
          const ok = summary !== null && summary.state === "ok"
          return (
            <button
              key={wallet.id}
              type="button"
              onClick={() => onUseWallet(wallet.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40"
              aria-label={`Trade with ${wallet.label}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {wallet.label}
                </span>
                <KindBadge kind={wallet.kind} />
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {ok
                  ? formatUsd(summary.equity)
                  : summary?.state === "inactive"
                    ? "Inactive"
                    : "Can't reach it"}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AllWalletsView({
  wallets,
  summaryOf,
  activeWalletId,
  onOpenWallet,
}: {
  wallets: TradeWallet[]
  summaryOf: (walletId: string) => WalletAccountSummary | null
  activeWalletId: string | null
  onOpenWallet: (wallet: TradeWallet) => void
}) {
  let total = 0
  let totalProfit = 0
  let unreachable = 0
  for (const wallet of wallets) {
    const summary = summaryOf(wallet.id)
    if (summary?.state === "ok") {
      total += summary.equity
      totalProfit += summary.openProfit
    } else {
      unreachable += 1
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">Total value</span>
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums">
              {formatUsd(total)}
            </span>
            <SignedUsd value={totalProfit} className="text-sm" />
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {wallets.length} {wallets.length === 1 ? "wallet" : "wallets"}
        </span>
      </div>
      {unreachable > 0 ? (
        <p className="text-xs text-muted-foreground">
          {unreachable === 1 ? "One wallet" : `${unreachable} wallets`} could
          not be reached, so the total is missing{" "}
          {unreachable === 1 ? "its" : "their"} value.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {/* The wallet in use sits at the top; the rest keep the order they
            were added in. Sorted on a copy — `wallets` belongs to the poll. */}
        {[...wallets]
          .sort((first, second) =>
            first.id === activeWalletId
              ? -1
              : second.id === activeWalletId
                ? 1
                : 0
          )
          .map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              summary={summaryOf(wallet.id)}
              active={wallet.id === activeWalletId}
              onOpen={() => onOpenWallet(wallet)}
            />
          ))}
      </div>
    </div>
  )
}

export function AccountPanel({
  account,
  onAddWallet,
  onOpenWallet,
}: {
  account: ReturnType<typeof useTradeAccount>
  onAddWallet: () => void
  onOpenWallet: (wallet: TradeWallet) => void
}) {
  const [tab, setTab] = React.useState<"active" | "all" | "inactive">("active")
  const { wallets, activeWallet, summaryOf, loading, failed, refresh } = account
  const activeWallets = wallets.filter((wallet) => wallet.status === "active")
  const inactiveWallets = wallets.filter(
    (wallet) => wallet.status === "inactive"
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "active" | "all" | "inactive")}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      {/* The tab row is the header — same anatomy as the activity panel's,
          with the add button sharing the row the way the mock draws it. */}
      <div className="flex shrink-0 items-center border-b px-3">
        <TabsList className="-mb-px h-[3.15rem] justify-start gap-4 rounded-none bg-transparent p-0">
          <WorkspacePanelTab
            value="active"
            icon={<CreditCardIcon className="size-4" />}
            label="Active"
          />
          <WorkspacePanelTab
            value="all"
            icon={<LayersIcon className="size-4" />}
            label="All"
          />
          <WorkspacePanelTab
            value="inactive"
            icon={<ArchiveIcon className="size-4" />}
            label="Inactive"
          />
        </TabsList>
        <Button
          data-slot="account-add-wallet"
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label="Add a wallet"
          onClick={onAddWallet}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <TabsContent value="active" className="min-h-0 flex-1">
        {/* The viewport's own wrapper is `display: table`, which sizes to its
            content and lets the dollar column run off the panel's right edge.
            Block makes it fill the panel instead. */}
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          {loading ? (
            <PanelLoading />
          ) : failed ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : activeWallet ? (
            <ActiveWalletView
              wallet={activeWallet}
              summary={summaryOf(activeWallet.id)}
              onRetry={() => void refresh()}
            />
          ) : activeWallets.length > 0 ? (
            <ChooseWalletView
              wallets={activeWallets}
              summaryOf={summaryOf}
              onUseWallet={account.switchWallet}
            />
          ) : (
            <NoActiveWallets hasWallets={wallets.length > 0} />
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="inactive" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          {loading ? (
            <PanelLoading />
          ) : failed ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : inactiveWallets.length > 0 ? (
            <AllWalletsView
              wallets={inactiveWallets}
              summaryOf={summaryOf}
              activeWalletId={null}
              onOpenWallet={onOpenWallet}
            />
          ) : (
            <PanelPlaceholder
              icon={<ArchiveIcon className="size-4" />}
              title="No inactive wallets"
            >
              Set a wallet to inactive from its settings and it will appear
              here.
            </PanelPlaceholder>
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="all" className="min-h-0 flex-1">
        {/* The viewport's own wrapper is `display: table`, which sizes to its
            content and lets the dollar column run off the panel's right edge.
            Block makes it fill the panel instead. */}
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          {loading ? (
            <PanelLoading />
          ) : failed ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : wallets.length > 0 ? (
            <AllWalletsView
              wallets={wallets}
              summaryOf={summaryOf}
              activeWalletId={activeWallet?.id ?? null}
              onOpenWallet={onOpenWallet}
            />
          ) : (
            <NoWalletsYet />
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

/**
 * Still reading the wallets.
 *
 * The shared spinner, not the grey bars this panel used to draw. Five fake
 * rows on a card that lists money read as figures arriving, and the rule is
 * written down next door in `loading-row.tsx`: a panel that fetches its own
 * contents gets "a compact centred spinner sitting in the surface's own frame,
 * never a skeleton".
 */
function PanelLoading() {
  return <LoadingRow label="Reading your wallets" />
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <PanelPlaceholder
      icon={<CreditCardIcon className="size-4" />}
      title="The wallets could not be loaded"
    >
      Nothing is wrong with the wallets themselves — the read failed.{" "}
      <button type="button" className="underline" onClick={onRetry}>
        Try again
      </button>
    </PanelPlaceholder>
  )
}

function NoWalletsYet() {
  return (
    <PanelPlaceholder
      icon={<CreditCardIcon className="size-4" />}
      title="No wallets yet"
    >
      Add one with the + above — a practice wallet with pretend cash, or a live
      exchange account.
    </PanelPlaceholder>
  )
}

function NoActiveWallets({ hasWallets }: { hasWallets: boolean }) {
  if (!hasWallets) return <NoWalletsYet />
  return (
    <PanelPlaceholder
      icon={<CreditCardIcon className="size-4" />}
      title="No active wallets"
    >
      Make a wallet active from the Inactive tab before choosing one to trade
      with.
    </PanelPlaceholder>
  )
}
