import * as React from "react"
import { ChevronDownIcon, Loader2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { MarketPicker } from "@/components/trading/market-watchlist"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getBotErrorMessage, updateBotMarkets } from "@/lib/api/bots"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { useMarketFavorites } from "@/lib/trading/use-market-favorites"

// Mirrors the deploy form's cap: a DCA basket runs one shared wallet with a
// real history ceiling; other strategies run one runner per market, uncapped.
const MAX_SHARED_WALLET_MARKETS = 200
const EMPTY_MARKETS: ReadonlySet<string> = new Set()

/**
 * Edit which markets a run trades. Adding a market spawns a fresh runner;
 * removing one makes the worker close that market's position at market and
 * stop its runner — so removals with an open position get a loud warning.
 * The server validates like a deploy and reuses the update_params path.
 */
export function BotMarketsDialog({
  botId,
  open,
  onOpenChange,
  markets,
  network,
  isDca,
  openPositionMarkets,
  onSaved,
}: {
  botId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The run's current market list. */
  markets: string[]
  network: TradingNetwork
  isDca: boolean
  /** Markets whose state currently shows an open position. */
  openPositionMarkets: string[]
  onSaved: () => Promise<unknown> | void
}) {
  // Seeded once at mount — the caller mounts this dialog fresh on every
  // open, and re-syncing from the polled props here would wipe in-progress
  // edits every refresh.
  const [draft, setDraft] = React.useState<string[]>(markets)
  const [saving, setSaving] = React.useState(false)

  const marketRows = useMarketRows(network)
  const { favorites, toggleFavorite } = useMarketFavorites()
  const draftSet = React.useMemo(() => new Set(draft), [draft])
  const availableMarkets = React.useMemo(
    () => marketRows.filter((row) => !draftSet.has(row.coin)),
    [marketRows, draftSet]
  )
  const maxMarkets = isDca ? MAX_SHARED_WALLET_MARKETS : Infinity

  const removedWithPosition = markets.filter(
    (market) => !draftSet.has(market) && openPositionMarkets.includes(market)
  )
  const dirty =
    draft.length !== markets.length ||
    draft.some((market) => !markets.includes(market))

  async function save() {
    if (saving || draft.length === 0) return
    setSaving(true)
    try {
      await updateBotMarkets(botId, draft)
      await onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit markets</DialogTitle>
          <DialogDescription>
            Added markets start trading with the run's current settings.
            Removed markets stop trading.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.map((coin) => (
              <Badge key={coin} variant="secondary" className="gap-1 font-mono">
                {coin}
                <button
                  type="button"
                  aria-label={`Remove ${coin}`}
                  onClick={() => setDraft(draft.filter((c) => c !== coin))}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            {draft.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Pick at least one market.
              </span>
            ) : null}
          </div>
          {availableMarkets.length > 0 && draft.length < maxMarkets ? (
            <MarketPicker
              rows={availableMarkets}
              selected=""
              protectedMarkets={EMPTY_MARKETS}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              multiple
              maxSelectable={maxMarkets - draft.length}
              onSelectMany={(coins) =>
                setDraft(
                  [...new Set([...draft, ...coins])].slice(0, maxMarkets)
                )
              }
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal text-muted-foreground"
                >
                  Add market
                  <ChevronDownIcon className="size-4" />
                </Button>
              }
            />
          ) : null}
          {removedWithPosition.length > 0 ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {removedWithPosition.join(", ")}{" "}
              {removedWithPosition.length === 1 ? "has" : "have"} an open
              position — removing {removedWithPosition.length === 1 ? "it" : "them"}{" "}
              closes the position at market.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={removedWithPosition.length > 0 ? "destructive" : "default"}
            disabled={saving || !dirty || draft.length === 0}
            onClick={() => void save()}
          >
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {removedWithPosition.length > 0
              ? "Close positions & save"
              : "Save markets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
