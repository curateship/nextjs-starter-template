import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type WalletOption = {
  /** Select value: wallet id, or `paper:<id>` for in-house paper wallets. */
  value: string
  label: string
  kind: "sandbox" | "mainnet" | "paper"
}

export type AccountSummary = {
  equity: number
  unrealized: number
  marginUsed: number
  withdrawable: number
}

export function AccountStrip({
  options,
  selectedValue,
  onWalletChange,
  left,
  actions,
}: {
  options: WalletOption[]
  selectedValue: string | null
  onWalletChange: (value: string) => void
  /** Market/coin info rendered on the left of the bar. */
  left?: ReactNode
  /** Controls rendered next to the wallet select (e.g. panel settings). */
  actions?: ReactNode
}) {
  const exchangeOptions = options.filter((option) => option.kind !== "paper")
  const paperOptions = options.filter((option) => option.kind === "paper")

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/50 px-3 py-2">
      {left}
      {options.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Create a Paper Wallet or import a Sandbox wallet on the Wallets page.
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Select
          value={selectedValue ?? ""}
          onValueChange={onWalletChange}
          disabled={options.length === 0}
        >
          <SelectTrigger id="active-wallet" className="min-w-44">
            <SelectValue
              placeholder={options.length === 0 ? "No wallets" : "Select wallet"}
            />
          </SelectTrigger>
          <SelectContent>
            {paperOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Paper (in-house)</SelectLabel>
                {paperOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {exchangeOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Sandbox (Hyperliquid testnet)</SelectLabel>
                {exchangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {option.kind === "mainnet" ? " (mainnet)" : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
        {actions}
      </div>
    </div>
  )
}

/** Account KPIs shown beneath the order ticket. */
export function AccountSummaryPanel({
  summary,
  isPaper,
  workerOnline,
}: {
  summary: AccountSummary | null
  isPaper: boolean
  workerOnline?: boolean
}) {
  const equity = summary?.equity ?? 0
  const unrealized = summary?.unrealized ?? 0
  const marginUsed = summary?.marginUsed ?? 0
  const marginPct = equity > 0 ? (marginUsed / equity) * 100 : 0

  return (
    <div className="flex flex-col gap-2 border-t p-3">
      {workerOnline === false ? (
        <Badge variant="destructive" className="w-fit">
          bot worker offline
        </Badge>
      ) : null}
      <SummaryRow label="Equity" value={formatUsd(equity)} />
      <SummaryRow
        label="Unrealized PnL"
        value={formatUsd(unrealized)}
        tone={unrealized > 0 ? "up" : unrealized < 0 ? "down" : undefined}
      />
      <SummaryRow
        label={isPaper ? "Position value" : "Margin used"}
        value={`${formatUsd(marginUsed)}${isPaper ? "" : ` (${marginPct.toFixed(1)}%)`}`}
      />
      <SummaryRow
        label={isPaper ? "Cash" : "Withdrawable"}
        value={formatUsd(summary?.withdrawable ?? 0)}
      />
    </div>
  )
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "up" && "text-emerald-600",
          tone === "down" && "text-red-500"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  })
}
