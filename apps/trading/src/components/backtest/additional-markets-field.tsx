import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MAX_EXTRA_MARKETS } from "@/lib/backtest/types"
import type { MarketRow } from "@/lib/hl/hooks"

/**
 * The "Additional markets" basket picker shared by the New Run and strategy
 * defaults dialogs: chips for the chosen markets plus a filtered "Add market"
 * select, bounded by {@link MAX_EXTRA_MARKETS}. Grid strategies stay
 * single-market, so they show an explanatory note instead.
 */
export function AdditionalMarketsField({
  market,
  extraMarkets,
  markets,
  disabled = false,
  isGrid,
  hint,
  onChange,
}: {
  /** The main market — excluded from the add options. */
  market: string
  extraMarkets: string[]
  markets: MarketRow[]
  disabled?: boolean
  isGrid: boolean
  /** Optional helper text shown under the chips (non-grid only). */
  hint?: string
  onChange: (next: string[]) => void
}) {
  const available = markets.filter(
    (row) => row.coin !== market && !extraMarkets.includes(row.coin)
  )

  return (
    <div className="grid gap-2">
      <Label>
        Additional markets{" "}
        {!isGrid && extraMarkets.length > 0 ? (
          <span className="font-normal text-muted-foreground">
            ({extraMarkets.length} selected){" "}
          </span>
        ) : null}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      {isGrid ? (
        <p className="text-xs text-muted-foreground">
          Grid bounds are absolute prices, so a grid run stays on one market.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {extraMarkets.map((coin) => (
            <Badge key={coin} variant="secondary" className="gap-1 font-mono">
              {coin}
              <button
                type="button"
                aria-label={`Remove ${coin}`}
                disabled={disabled}
                onClick={() =>
                  onChange(extraMarkets.filter((extra) => extra !== coin))
                }
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          {extraMarkets.length < MAX_EXTRA_MARKETS && available.length > 0 ? (
            <Select
              value=""
              disabled={disabled}
              onValueChange={(coin) =>
                onChange(
                  extraMarkets.includes(coin)
                    ? extraMarkets
                    : [...extraMarkets, coin]
                )
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Add market" />
              </SelectTrigger>
              <SelectContent>
                {available.map((row) => (
                  <SelectItem key={row.coin} value={row.coin}>
                    {row.coin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      )}
      {!isGrid && hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
