import * as React from "react"
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  CreditCardIcon,
  EllipsisVerticalIcon,
  InfoIcon,
  LayersIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { TradeBadge } from "@/components/trade/trade-badge"
import type { useTradeAccount } from "@/components/trade/use-trade-account"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { marketSymbol } from "@/lib/protocols/contracts"
import { readWalletPanelCache } from "@/lib/trade/dashboard-cache"
import { formatAway, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { keyExpiryNotice } from "@/lib/trade/live"
import { useLiveMarks } from "@/lib/trade/live-market"
import { walletMarginHealth } from "@/lib/trade/margin-health"
import {
  ALARM_SURFACE,
  WARNING_SURFACE,
  moneyTone,
} from "@/lib/trade/money-tone"
import type { TradePosition } from "@/lib/trade/paper"
import {
  type TradeWallet,
  type WalletAccountSummary,
} from "@/lib/trade/wallets"
import { cn } from "@/lib/utils"

/**
 * The chart header's wallet picker and its management popover. Purely a view:
 * the state comes from the one `useTradeAccount` the workspace owns, and the
 * add, details and edit windows belong to the workspace too.
 */

export function KindBadge({ wallet }: { wallet: TradeWallet }) {
  const testnet = wallet.kind === "live" && wallet.network === "testnet"
  if (wallet.kind === "live" && !testnet) return null
  return (
    <TradeBadge
      className="shrink-0"
      tone={wallet.kind === "paper" ? "neutral" : "testnet"}
    >
      {wallet.kind === "paper" ? "Practice" : "Testnet"}
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
  // One clock per wallet row, and only for a row that has a key to run out:
  // a wallet with no expiry has nothing for the minute to change.
  React.useEffect(() => {
    if (keyValidUntil === null) return
    const timer = window.setInterval(() => setReadAt(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [keyValidUntil])
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
        notice.tone === "warning" && WARNING_SURFACE,
        notice.tone === "expired" && ALARM_SURFACE
      )}
    >
      {notice.message}
    </p>
  )
}

const walletRowGridClassName =
  "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_5rem_3.75rem] items-center gap-2 self-stretch"
const walletRowFrameClassName =
  "flex min-h-12 items-center gap-2 px-3 transition-colors"

function walletRowState(summary: WalletAccountSummary | null) {
  const figures = summary?.state === "ok" ? summary : null
  const ok = figures !== null
  const inactive = summary?.state === "inactive"
  const stale = summary?.state === "ok" && summary.stale === true
  const refusal = summary?.state === "unreachable" ? summary.reason : undefined
  const status = inactive
    ? "Not switched on"
    : ok
      ? stale
        ? "Figures a moment old"
        : "Connected"
      : refusal
        ? "Two-sided. Change to one-way mode"
        : "Can't reach it"
  return { figures, inactive, ok, refusal, stale, status }
}

/** The one name, state and money grid shared by every wallet tab. */
function WalletRowCells({
  wallet,
  profit,
  selector,
  state,
  showKindBadge = false,
}: {
  wallet: TradeWallet
  profit: number | null
  selector: React.ReactNode
  state: ReturnType<typeof walletRowState>
  showKindBadge?: boolean
}) {
  const { figures, inactive, ok, stale, status } = state
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {selector}
        <span className="truncate text-sm font-medium">{wallet.label}</span>
        <WalletStatusDot state={state} />
        {inactive ? (
          <span className="sr-only">Not switched on</span>
        ) : !ok || stale ? (
          <span className="truncate text-xs text-muted-foreground">
            {status}
          </span>
        ) : (
          <span className="sr-only">Connected</span>
        )}
        {showKindBadge ? <KindBadge wallet={wallet} /> : null}
      </span>
      <span className="text-right font-mono text-sm font-medium tabular-nums">
        {figures ? formatUsd(figures.equity) : "—"}
      </span>
      {ok && profit !== null ? (
        <SignedUsd value={profit} className="text-right font-mono text-xs" />
      ) : (
        <span />
      )}
    </>
  )
}

function WalletStatusDot({
  state,
}: {
  state: ReturnType<typeof walletRowState>
}) {
  const { inactive, ok, stale } = state
  return (
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
  )
}

function ActiveWalletRow({
  wallet,
  summary,
  selected,
  onSelect,
  onOpenDetails,
}: {
  wallet: TradeWallet
  summary: WalletAccountSummary | null
  selected: boolean
  onSelect: () => void
  onOpenDetails: () => void
}) {
  const state = walletRowState(summary)
  const { figures } = state

  return (
    <div
      className={cn(
        walletRowFrameClassName,
        selected ? "bg-muted/60 hover:bg-muted/60" : "hover:bg-muted/40"
      )}
    >
      <label className={cn(walletRowGridClassName, "cursor-pointer")}>
        <WalletRowCells
          wallet={wallet}
          profit={figures?.madeOrLost ?? null}
          state={state}
          showKindBadge
          selector={
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
          }
        />
      </label>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Open ${wallet.label} wallet details`}
        onClick={onOpenDetails}
      >
        <EllipsisVerticalIcon className="size-4" />
      </Button>
    </div>
  )
}

function WalletCard({
  wallet,
  summary,
  active,
  onOpenDetails,
}: {
  wallet: TradeWallet
  summary: WalletAccountSummary | null
  /** This is the wallet being traded with — the card says so. */
  active: boolean
  onOpenDetails: () => void
}) {
  const state = walletRowState(summary)
  const { figures } = state
  return (
    <div
      className={cn(
        walletRowFrameClassName,
        active ? "bg-muted/60 hover:bg-muted/60" : "hover:bg-muted/40"
      )}
    >
      <div className={walletRowGridClassName}>
        <WalletRowCells
          wallet={wallet}
          profit={figures?.openProfit ?? null}
          state={state}
          selector={
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                active && "border-primary bg-primary text-primary-foreground"
              )}
              aria-hidden
            >
              {active ? <CheckIcon className="size-3" /> : null}
            </span>
          }
        />
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Open ${wallet.label} wallet details`}
        onClick={onOpenDetails}
      >
        <EllipsisVerticalIcon className="size-4" />
      </Button>
    </div>
  )
}

export function ActiveWalletsView({
  wallets,
  summaryOf,
  activeWalletId,
  onUseWallet,
  onOpenWalletDetails,
}: {
  wallets: TradeWallet[]
  summaryOf: (walletId: string) => WalletAccountSummary | null
  activeWalletId: string | null
  onUseWallet: (walletId: string) => void
  onOpenWalletDetails: (wallet: TradeWallet) => void
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
          onOpenDetails={() => onOpenWalletDetails(wallet)}
        />
      ))}
    </div>
  )
}

export function AllWalletsView({
  wallets,
  summaryOf,
  activeWalletId,
  onOpenWalletDetails,
}: {
  wallets: TradeWallet[]
  summaryOf: (walletId: string) => WalletAccountSummary | null
  activeWalletId: string | null
  onOpenWalletDetails: (wallet: TradeWallet) => void
}) {
  return (
    <div>
      {/* The wallet in use sits at the top; the rest keep the order they were
          added in. Sorted on a copy because `wallets` belongs to the poll. */}
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
            onOpenDetails={() => onOpenWalletDetails(wallet)}
          />
        ))}
    </div>
  )
}

export function WalletDetailsDialog({
  wallet,
  summary,
  positions,
  fallbackMarks,
  onClose,
  onOpenWallet,
  onFlattenWallet,
  onRetry,
}: {
  wallet: TradeWallet | null
  summary: WalletAccountSummary | null
  positions: readonly TradePosition[]
  fallbackMarks: ReadonlyMap<string, number>
  onClose: () => void
  onOpenWallet: (wallet: TradeWallet) => void
  onFlattenWallet: (wallet: TradeWallet) => void
  onRetry: () => void
}) {
  const walletPositions = wallet
    ? positions.filter((position) => position.walletId === wallet.id)
    : []
  const marks = useLiveMarks(
    walletPositions.map((position) => position.marketKey)
  )
  const marginHealth = wallet
    ? walletMarginHealth(walletPositions, marks, fallbackMarks, wallet.id)
    : null
  if (!wallet) return null

  const state = walletRowState(summary)
  const { figures, inactive, refusal } = state

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{wallet.label}</span>
            <WalletStatusDot state={state} />
          </DialogTitle>
          <DialogDescription className="sr-only">
            {state.status}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-4">
              {wallet.status === "active" ? (
                <KeyExpiryNotice wallet={wallet} />
              ) : null}
              {figures ? (
                <div className="grid gap-2">
                  <FigureRow label="Free">
                    <span className="font-mono tabular-nums">
                      {formatUsd(figures.free)}
                    </span>
                  </FigureRow>
                  <FigureRow label="In trades">
                    <span className="font-mono tabular-nums">
                      {formatUsd(figures.inTrades)}
                    </span>
                  </FigureRow>
                  <FigureRow label="Margin used">
                    <span className="font-mono tabular-nums">
                      {marginHealth ? formatUsd(marginHealth.marginUsed) : "—"}
                    </span>
                  </FigureRow>
                  <FigureRow label="Nearest position">
                    <span className="text-right font-mono tabular-nums">
                      {marginHealth?.nearest
                        ? `${formatAway(marginHealth.nearest.away)} away on ${marketSymbol(marginHealth.nearest.marketKey)}`
                        : "—"}
                    </span>
                  </FigureRow>
                  <FigureRow label="Open profit">
                    <SignedUsd
                      value={figures.openProfit}
                      className="font-mono"
                    />
                  </FigureRow>
                  <FigureRow
                    label={
                      <span className="flex items-center gap-1">
                        Settled
                        {figures.unpricedFills ? (
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
                              {figures.unpricedFills.toLocaleString()}{" "}
                              {figures.unpricedFills === 1 ? "trade" : "trades"}{" "}
                              whose profit the exchange has not stated.
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </span>
                    }
                  >
                    <SignedUsd value={figures.settled} className="font-mono" />
                  </FigureRow>
                  <FigureRow label="Made or lost">
                    <SignedUsd
                      value={figures.madeOrLost}
                      className="font-mono"
                    />
                  </FigureRow>
                </div>
              ) : inactive ? (
                <p className="text-sm text-muted-foreground">
                  This wallet is not switched on. Edit the wallet to make it
                  active again.
                </p>
              ) : refusal ? (
                <p className="text-sm text-muted-foreground">{refusal}</p>
              ) : (
                <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                  <p>
                    The exchange did not answer for this wallet, so there are no
                    figures to show. Showing zeros would be making them up.
                  </p>
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    Try again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            onClick={() => {
              onClose()
              onFlattenWallet(wallet)
            }}
          >
            <Trash2Icon className="size-4" />
            Empty wallet
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose()
              onOpenWallet(wallet)
            }}
          >
            <SettingsIcon className="size-4" />
            Edit wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type WalletMenuContentProps = {
  account: ReturnType<typeof useTradeAccount>
  cacheScope: string
  onAddWallet: () => void
  onOpenWalletDetails: (wallet: TradeWallet) => void
}

type WalletManagementProps = WalletMenuContentProps & {
  detailsOpen: boolean
}

export function WalletManagement(props: WalletManagementProps) {
  const [open, setOpen] = React.useState(false)
  const { account } = props
  const activeWallet = account.activeWallet
  const activeSummary = activeWallet ? account.summaryOf(activeWallet.id) : null
  const activeState = walletRowState(activeSummary)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && props.detailsOpen) return
        setOpen(nextOpen)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label={
                activeWallet
                  ? `Manage wallets. ${activeWallet.label} is in use.`
                  : "Manage wallets"
              }
              className="max-w-72 min-w-0 bg-muted/60 dark:bg-muted/60"
            >
              <CreditCardIcon className="size-4" />
              <span className="max-w-24 truncate max-sm:sr-only">
                {activeWallet?.label ?? "Wallets"}
              </span>
              {activeState.figures ? (
                <>
                  <span className="hidden font-mono tabular-nums xl:inline">
                    {formatUsd(activeState.figures.equity)}
                  </span>
                  <SignedUsd
                    value={activeState.figures.madeOrLost}
                    className="hidden font-mono xl:inline"
                  />
                </>
              ) : null}
              <ChevronDownIcon
                className={cn(
                  "size-4 text-muted-foreground transition-transform max-sm:hidden",
                  open && "rotate-180"
                )}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Manage wallets</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-1rem)] max-w-sm gap-0 overflow-hidden p-0"
      >
        <WalletMenuContent
          {...props}
          onAddWallet={() => {
            setOpen(false)
            props.onAddWallet()
          }}
          onOpenWalletDetails={props.onOpenWalletDetails}
        />
      </PopoverContent>
    </Popover>
  )
}

export function WalletMenuContent({
  account,
  cacheScope,
  onAddWallet,
  onOpenWalletDetails,
}: WalletMenuContentProps) {
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
  const totals = activeWallets.reduce(
    (sum, wallet) => {
      const summary = shownSummaryOf(wallet.id)
      if (summary?.state !== "ok") return sum
      sum.wallets += 1
      sum.equity += summary.equity
      sum.madeOrLost += summary.madeOrLost
      return sum
    },
    { wallets: 0, equity: 0, madeOrLost: 0 }
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "active" | "all" | "inactive")}
      className="min-w-0 gap-0 overflow-hidden bg-popover"
    >
      <WorkspacePanelTabsHeader>
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
      </WorkspacePanelTabsHeader>

      <TabsContent value="active" className="min-h-0 flex-1">
        <ScrollArea className="max-h-80" viewportClassName="max-h-80">
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
              onOpenWalletDetails={usingCache ? () => {} : onOpenWalletDetails}
            />
          ) : (
            <NoActiveWallets hasWallets={shownWallets.length > 0} />
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="inactive" className="min-h-0 flex-1">
        <ScrollArea className="max-h-80" viewportClassName="max-h-80">
          {loading && !usingCache ? (
            <PanelLoading />
          ) : failed && !usingCache ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : inactiveWallets.length > 0 ? (
            <AllWalletsView
              wallets={inactiveWallets}
              summaryOf={shownSummaryOf}
              activeWalletId={null}
              onOpenWalletDetails={usingCache ? () => {} : onOpenWalletDetails}
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
        <ScrollArea className="max-h-80" viewportClassName="max-h-80">
          {loading && !usingCache ? (
            <PanelLoading />
          ) : failed && !usingCache ? (
            <LoadFailed onRetry={() => void refresh()} />
          ) : shownWallets.length > 0 ? (
            <AllWalletsView
              wallets={shownWallets}
              summaryOf={shownSummaryOf}
              activeWalletId={shownActiveWalletId}
              onOpenWalletDetails={usingCache ? () => {} : onOpenWalletDetails}
            />
          ) : (
            <NoWalletsYet />
          )}
        </ScrollArea>
      </TabsContent>
      <div className="flex min-h-14 items-center gap-2 border-t px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-base font-semibold tabular-nums">
            {totals.wallets > 0 ? formatUsd(totals.equity) : "—"}
          </span>
          {totals.wallets > 0 ? (
            <SignedUsd
              value={totals.madeOrLost}
              className="font-mono text-sm"
            />
          ) : null}
        </div>
        <Button type="button" className="ml-auto" onClick={onAddWallet}>
          <PlusIcon className="size-4" />
          Add wallet
        </Button>
      </div>
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
      Add one below. It can use pretend cash or a live exchange account.
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
