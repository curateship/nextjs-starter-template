import type { MarketPickerCapabilities, MarketRow } from "@/lib/protocols/contracts"
import { formatCompactUsd } from "@/lib/trade/format"
import { minimumOrderLabel } from "@/lib/trade/market-info"

/**
 * The market on the chart. Its facts open from the "i" after its name in the
 * chart tab, on a click (Tyler, 13 Nov 2026).
 */
export type MarketSelection = {
  kind: "market"
  row: MarketRow
  protocolLabel: string
  networkLabel: string
  picker: MarketPickerCapabilities
}

/**
 * The market's facts as name and value rows, in the popover on the chart
 * tab's "i" (Tyler, 7 Nov 2026: "move the market info into a tool top in the
 * header"). Drawn for the popover's dark ground: names at 70% strength,
 * values at full.
 */
export function MarketInfoFacts({
  selection,
}: {
  selection: Extract<MarketSelection, { kind: "market" }>
}) {
  const leverage =
    selection.row.maxLeverage === null
      ? "Not stated publicly"
      : `${selection.row.maxLeverage}×`
  const minimum = minimumOrderLabel(selection.row)
  const rows: [string, string][] = [
    ["Exchange", selection.protocolLabel],
    ["Network", selection.networkLabel],
    ["Price tick", String(selection.row.priceTick ?? "Exchange rounding rule")],
    ["List price", "Mark price"],
    ["Chart bars", "Traded prices"],
    ["Daily volume", formatCompactUsd(selection.row.volume24hUsd)],
    ...(selection.row.liquidityUsd != null
      ? ([["Pool liquidity", formatCompactUsd(selection.row.liquidityUsd)]] as [
          string,
          string,
        ][])
      : []),
    ...(minimum ? factRow(minimum) : []),
    ["Top leverage", leverage],
  ]
  return (
    // Fills the popover, so each value ends at its right edge with no empty
    // space after it (Tyler, 7 Nov 2026: "empty space").
    <dl className="grid w-full min-w-56 grid-cols-[minmax(0,1fr)] py-1 text-xs">
      {rows.map(([name, value]) => (
        <div key={name} className="flex items-baseline gap-3 px-3 py-1">
          <dt className="shrink-0 opacity-70">{name}</dt>
          <dd className="min-w-0 flex-1 truncate text-right">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** "Minimum order: $10" as a name and its value. */
function factRow(line: string): [string, string][] {
  const at = line.indexOf(": ")
  if (at < 0) return [["Minimum order", line]]
  return [[line.slice(0, at), line.slice(at + 2)]]
}
