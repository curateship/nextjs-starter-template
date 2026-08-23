import * as React from "react"
import {
  ArchiveIcon,
  ChevronDownIcon,
  CreditCardIcon,
  InfoIcon,
  LayersIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"

import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { TradeBadge } from "@/components/trade/trade-badge"
import type { useTradeAccount } from "@/components/trade/use-trade-account"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { WorkspacePanelTab } from "@/components/shared/workspace-panel-header"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { readWalletPanelCache } from "@/lib/trade/dashboard-cache"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { keyExpiryNotice } from "@/lib/trade/live"
import { moneyTone } from "@/lib/trade/money-tone"
import {
  venueLabel,
  type TradeWallet,
  type WalletAccountSummary,
} from "@/lib/trade/wallets"
import { cn } from "@/lib/utils"

/**
 * The right panel's wallet picker, and the All tab that manages every wallet.
 * Purely a view — the state comes in from the one
 * `useTradeAccount` the workspace owns, and the two dialogs (add, edit) are
 * the workspace's too, so the narrow-screen sheet and the desktop column can
 * never hold two copies of either.
 */

export function KindBadge({ wallet }: { wallet: TradeWallet }) {
  const testnet = wallet.kind === "live" && wallet.network === "testnet"
  return (
    <TradeBadge
      className="shrink-0"
      tone={wallet.kind === "paper" ? "neutral" : testnet ? "testnet" : "real"}
    >
      {wallet.kind === "paper" ? "Practice" : testnet ? "Testnet" : "Real"}
    </TradeBadge>
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

function useKeyExpiryNotice(keyValidUntil: number | null) {
  const [readAt, setReadAt] = React.useState(Date.now)
  React.useEffect(() => {
    const timer = window.setInterval(() => setReadAt(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return keyExpiryNotice(keyValidUntil, readAt)
}

/**
 * The trading key is running out (or has). Said on the wallet itself, where
 * the fix is one click away, and only while it is worth saying.
 */
function KeyExpiryNotice({ wallet }: { wallet: TradeWallet }) {
  const notice = useKeyExpiryNotice(wallet.keyValidUntil)
  if (!notice) return null
  return (
    <p
      className={cn(
        "rounded-md px-2.5 py-1.5 text-xs",
        notice.tone === "quiet" && "bg-muted text-muted-foreground",
        notice.tone === "warning" &&
          "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        notice.tone === "expired" &&
          "bg-red-500/10 text-red-700 dark:text-red-400"
      )}
    >
      {notice.message}
    </p>
  )
}

function ActiveWalletRow({
  wallet,
  summary,
  selected,
  onSelect,
  onOpenWallet,
  onRetry,
}: {
  wallet: TradeWallet
  summary: WalletAccountSummary | null
  selected: boolean
  onSelect: () => void
  onOpenWallet: () => void
  onRetry: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const ok = summary !== null && summary.state === "ok"
  // Real figures, just not this second's — the exchange has missed a read or
  // two. Said quietly rather than shouted: nothing here is wrong, it is only
  // a moment behind.
  const stale = summary?.state === "ok" && summary.stale === true
  const refusal = summary?.state === "unreachable" ? summary.reason : undefined
  const status = ok
    ? stale
      ? "Figures a moment old"
      : "Connected"
    : refusal
      ? "Two-sided. Change to one-way mode"
      : "Can't reach it"

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "border-b transition-colors last:border-b-0",
        selected && "bg-muted/60"
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={() => {
              if (!selected) onSelect()
            }}
            aria-label={
              selected
                ? `${wallet.label} is the wallet in use`
                : `Trade with ${wallet.label}`
            }
            className="rounded-full"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {wallet.label}
              </span>
              <KindBadge wallet={wallet} />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">
                {venueLabel(wallet.protocol, wallet.network)} · {status}
              </span>
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  !ok
                    ? "bg-destructive"
                    : stale
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                )}
                aria-hidden
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-base font-semibold tabular-nums">
              {ok ? formatUsd(summary.equity) : "—"}
            </div>
            {ok ? (
              <SignedUsd value={summary.madeOrLost} className="text-xs" />
            ) : null}
          </div>
        </label>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={
              open
                ? `Hide ${wallet.label} figures`
                : `Show ${wallet.label} figures`
            }
          >
            <ChevronDownIcon
              className={cn(
                "size-4 transition-transform duration-200",
                !open && "-rotate-90"
              )}
            />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="px-4 pb-3 sm:px-5">
        <div className="grid gap-2 rounded-lg border bg-card p-3">
          <KeyExpiryNotice wallet={wallet} />
          {ok ? (
            <div className="flex flex-col gap-0.5 text-xs">
              <FigureRow label="Free">
                <span className="tabular-nums">{formatUsd(summary.free)}</span>
              </FigureRow>
              <FigureRow label="In trades">
                <span className="tabular-nums">
                  {formatUsd(summary.inTrades)}
                </span>
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
                          {summary.unpricedFills === 1 ? "trade" : "trades"}{" "}
                          whose profit the exchange has not stated.
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
          ) : refusal ? (
            <p className="text-sm text-muted-foreground">{refusal}</p>
          ) : (
            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
              <p>
                The exchange did not answer for this wallet, so there are no
                figures to show — showing zeros would be making them up.
              </p>
              <Button size="sm" variant="outline" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
          <div className="flex justify-center border-t pt-2">
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={onOpenWallet}
            >
              <SettingsIcon className="size-4" />
              Edit wallet
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  const inactive = summary?.state === "inactive"
  const refusal = summary?.state === "unreachable" ? summary.reason : undefined
  const stale = summary?.state === "ok" && summary.stale === true
  const expiryNotice = useKeyExpiryNotice(
    inactive ? null : wallet.keyValidUntil
  )
  const status = inactive
    ? "Not switched on"
    : ok
      ? stale
        ? "Figures a moment old"
        : "Connected"
      : refusal
        ? "Two-sided. Change to one-way mode"
        : "Can't reach it"
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40 sm:px-5",
        active && "bg-muted/60"
      )}
      aria-label={`${wallet.label}${active ? " — the wallet in use" : ""} — open wallet settings`}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          active && "border-primary bg-primary"
        )}
        aria-hidden
      >
        {active ? (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{wallet.label}</span>
          <KindBadge wallet={wallet} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            {venueLabel(wallet.protocol, wallet.network)} · {status}
          </span>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              inactive
                ? "bg-muted-foreground"
                : !ok
                  ? "bg-destructive"
                  : stale
                    ? "bg-amber-500"
                    : "bg-emerald-500"
            )}
            aria-hidden
          />
        </span>
        {expiryNotice ? (
          <span
            className={cn(
              "mt-1 block text-xs",
              expiryNotice.tone === "quiet" && "text-muted-foreground",
              expiryNotice.tone === "warning" &&
                "text-amber-700 dark:text-amber-400",
              expiryNotice.tone === "expired" &&
                "text-red-700 dark:text-red-400"
            )}
          >
            {expiryNotice.message}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-base font-semibold tabular-nums">
          {ok ? formatUsd(summary.equity) : "—"}
        </span>
        {ok ? (
          <SignedUsd value={summary.openProfit} className="block text-xs" />
        ) : null}
      </span>
    </button>
  )
}

export function ActiveWalletsView({
  wallets,
  summaryOf,
  activeWalletId,
  onUseWallet,
  onOpenWallet,
  onRetry,
}: {
  wallets: TradeWallet[]
  summaryOf: (walletId: string) => WalletAccountSummary | null
  activeWalletId: string | null
  onUseWallet: (walletId: string) => void
  onOpenWallet: (wallet: TradeWallet) => void
  onRetry: () => void
}) {
  return (
    <div>
      {wallets.map((wallet) => (
        <ActiveWalletRow
          key={wallet.id}
          wallet={wallet}
          summary={summaryOf(wallet.id)}
          selected={wallet.id === activeWalletId}
          onSelect={() => onUseWallet(wallet.id)}
          onOpenWallet={() => onOpenWallet(wallet)}
          onRetry={onRetry}
        />
      ))}
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
    } else if (summary?.state === "unreachable" || summary === null) {
      unreachable += 1
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-0.5 border-b px-4 py-3 sm:px-5">
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
        <p className="border-b px-4 py-2 text-xs text-muted-foreground sm:px-5">
          {unreachable === 1 ? "One wallet" : `${unreachable} wallets`} could
          not be reached, so the total is missing{" "}
          {unreachable === 1 ? "its" : "their"} value.
        </p>
      ) : null}
      <div>
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
  cacheScope,
  onAddWallet,
  onOpenWallet,
  onContentHeightChange,
}: {
  account: ReturnType<typeof useTradeAccount>
  cacheScope: string
  onAddWallet: () => void
  onOpenWallet: (wallet: TradeWallet) => void
  /** Lets the desktop split follow the rows instead of reserving half a column. */
  onContentHeightChange?: (height: number) => void
}) {
  const root = React.useRef<HTMLDivElement | null>(null)
  const [tab, setTab] = React.useState<"active" | "all" | "inactive">("active")
  const { wallets, activeWallet, summaryOf, loading, failed, refresh } = account
  const [cached, setCached] = React.useState(
    () => null as ReturnType<typeof readWalletPanelCache>
  )
  useEffectBeforePaint(() => {
    setCached(readWalletPanelCache(cacheScope))
  }, [cacheScope])
  // Cached wallets draw the panel only. They never enter `useTradeAccount`,
  // so they cannot select a wallet, fund an order, or open wallet settings.
  const shownCache = loading || failed ? cached : null
  const usingCache = shownCache !== null
  const shownWallets = shownCache?.wallets ?? wallets
  const shownActiveWalletId = shownCache
    ? shownCache.lastWalletId
    : (activeWallet?.id ?? null)
  const shownSummaryOf = shownCache
    ? (walletId: string) =>
        shownCache.summaries.find((summary) => summary.walletId === walletId) ??
        null
    : summaryOf
  const activeWallets = shownWallets.filter(
    (wallet) => wallet.status === "active"
  )
  const inactiveWallets = shownWallets.filter(
    (wallet) => wallet.status === "inactive"
  )

  React.useEffect(() => {
    if (!onContentHeightChange) return
    const panel = root.current
    const viewport = panel?.querySelector<HTMLElement>(
      '[data-slot="tabs-content"][data-state="active"] [data-slot="scroll-area-viewport"]'
    )
    const header = panel?.firstElementChild
    const content = viewport?.firstElementChild
    if (!(header instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      return
    }

    const report = () =>
      onContentHeightChange(header.offsetHeight + content.scrollHeight + 2)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(header)
    observer.observe(content)
    return () => observer.disconnect()
  }, [onContentHeightChange, tab, loading, failed, shownWallets.length])

  return (
    <Tabs
      ref={root}
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
          {loading && !usingCache ? (
            <PanelLoading />
          ) : failed && !usingCache ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : activeWallets.length > 0 ? (
            <ActiveWalletsView
              wallets={activeWallets}
              summaryOf={shownSummaryOf}
              activeWalletId={shownActiveWalletId}
              onUseWallet={usingCache ? () => {} : account.switchWallet}
              onOpenWallet={usingCache ? () => {} : onOpenWallet}
              onRetry={() => void refresh()}
            />
          ) : (
            <NoActiveWallets hasWallets={shownWallets.length > 0} />
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="inactive" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          {loading && !usingCache ? (
            <PanelLoading />
          ) : failed && !usingCache ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : inactiveWallets.length > 0 ? (
            <AllWalletsView
              wallets={inactiveWallets}
              summaryOf={shownSummaryOf}
              activeWalletId={null}
              onOpenWallet={usingCache ? () => {} : onOpenWallet}
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
          {loading && !usingCache ? (
            <PanelLoading />
          ) : failed && !usingCache ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : shownWallets.length > 0 ? (
            <AllWalletsView
              wallets={shownWallets}
              summaryOf={shownSummaryOf}
              activeWalletId={shownActiveWalletId}
              onOpenWallet={usingCache ? () => {} : onOpenWallet}
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
