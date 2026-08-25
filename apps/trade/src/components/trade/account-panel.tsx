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
import {
  walletMarginHealth,
  type WalletMarginHealth,
} from "@/lib/trade/margin-health"
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
  "flex min-h-10 items-center gap-2 px-3 transition-colors"

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

export function AccountPanel({
  account,
  positions,
  fallbackMarks,
  cacheScope,
  onAddWallet,
  onOpenWallet,
  onFlattenWallet,
  onContentHeightChange,
}: {
  account: ReturnType<typeof useTradeAccount>
  positions: readonly TradePosition[]
  fallbackMarks: ReadonlyMap<string, number>
  cacheScope: string
  onAddWallet: () => void
  onOpenWallet: (wallet: TradeWallet) => void
  /** Ask before emptying a wallet — the workspace owns the question. */
  onFlattenWallet: (wallet: TradeWallet) => void
  /** Lets the desktop split follow the rows instead of reserving half a column. */
  onContentHeightChange?: (height: number) => void
}) {
  const root = React.useRef<HTMLDivElement | null>(null)
  const [tab, setTab] = React.useState<"active" | "all" | "inactive">("active")
  const { wallets, activeWallet, summaryOf, loading, failed, refresh } = account
  const marks = useLiveMarks(positions.map((position) => position.marketKey))
  const healthOf = (walletId: string) =>
    walletMarginHealth(positions, marks, fallbackMarks, walletId)
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

  useEffectBeforePaint(() => {
    if (!onContentHeightChange) return
    let observer: ResizeObserver | null = null
    // Radix swaps the active tab panel after the parent's layout effect. One
    // frame later the new viewport exists, still before the browser paints it.
    const frame = window.requestAnimationFrame(() => {
      const panel = root.current
      const viewport = panel?.querySelector<HTMLElement>(
        '[data-slot="tabs-content"][data-state="active"] [data-slot="scroll-area-viewport"]'
      )
      const header = panel?.firstElementChild
      // Radix's viewport owns one direct content wrapper. Measuring the
      // viewport itself only returns the old clipped panel height.
      const content = viewport?.querySelector<HTMLElement>(":scope > div")
      if (
        !(header instanceof HTMLElement) ||
        !(content instanceof HTMLElement)
      ) {
        return
      }

      const report = () =>
        onContentHeightChange(header.offsetHeight + content.scrollHeight + 2)
      report()
      observer = new ResizeObserver(report)
      observer.observe(header)
      observer.observe(content)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [onContentHeightChange, tab, loading, failed, shownWallets.length])

  return (
    <Tabs
      ref={root}
      value={tab}
      onValueChange={(value) => setTab(value as "active" | "all" | "inactive")}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      {/* The shared tabs header, same as the activity panel's — the add
          button rides in its `action` slot at the row's right-hand end. */}
      <WorkspacePanelTabsHeader
        action={
          <Button
            data-slot="account-add-wallet"
            variant="ghost"
            size="icon-sm"
            aria-label="Add a wallet"
            onClick={onAddWallet}
          >
            <PlusIcon className="size-5" />
          </Button>
        }
      >
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
        <ScrollArea className="h-full">
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
              onFlattenWallet={usingCache ? () => {} : onFlattenWallet}
              onRetry={() => void refresh()}
              healthOf={healthOf}
            />
          ) : (
            <NoActiveWallets hasWallets={shownWallets.length > 0} />
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="inactive" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
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
        <ScrollArea className="h-full">
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
