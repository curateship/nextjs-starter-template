import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TradingNetwork } from "@/lib/hl/network"

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
  network,
  options,
  selectedValue,
  onWalletChange,
  summary,
  isPaper,
  workerOnline,
}: {
  network: TradingNetwork
  options: WalletOption[]
  selectedValue: string | null
  onWalletChange: (value: string) => void
  summary: AccountSummary | null
  isPaper: boolean
  workerOnline?: boolean
}) {
  const equity = summary?.equity ?? 0
  const unrealized = summary?.unrealized ?? 0
  const marginUsed = summary?.marginUsed ?? 0
  const marginPct = equity > 0 ? (marginUsed / equity) * 100 : 0
  const exchangeOptions = options.filter((option) => option.kind !== "paper")
  const paperOptions = options.filter((option) => option.kind === "paper")

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="active-wallet" className="text-xs text-muted-foreground">
          Wallet
        </Label>
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
        {isPaper ? (
          <Badge variant="outline">paper</Badge>
        ) : (
          <Badge variant={network === "mainnet" ? "default" : "secondary"}>
            {network === "testnet" ? "sandbox" : network}
          </Badge>
        )}
        {workerOnline === false ? (
          <Badge variant="destructive">bot worker offline</Badge>
        ) : null}
      </div>

      <Stat label="Equity" value={formatUsd(equity)} />
      <Stat
        label="Unrealized PnL"
        value={formatUsd(unrealized)}
        tone={unrealized > 0 ? "up" : unrealized < 0 ? "down" : undefined}
      />
      <Stat
        label={isPaper ? "Position value" : "Margin used"}
        value={`${formatUsd(marginUsed)}${isPaper ? "" : ` (${marginPct.toFixed(1)}%)`}`}
      />
      <Stat
        label={isPaper ? "Cash" : "Withdrawable"}
        value={formatUsd(summary?.withdrawable ?? 0)}
      />
      {options.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Create a Paper Wallet or import a Sandbox wallet on the Wallets page.
        </span>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={
          tone === "up"
            ? "font-mono text-xs text-emerald-600 tabular-nums"
            : tone === "down"
              ? "font-mono text-xs text-red-500 tabular-nums"
              : "font-mono text-xs tabular-nums"
        }
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
