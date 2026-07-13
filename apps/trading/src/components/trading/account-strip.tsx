import type { ReactNode } from "react"
import { WalletIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
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
  const testnetOptions = options.filter((option) => option.kind === "sandbox")
  const mainnetOptions = options.filter((option) => option.kind === "mainnet")
  const paperOptions = options.filter((option) => option.kind === "paper")
  const selectedOption = options.find(
    (option) => option.value === selectedValue
  )

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-card px-4 py-2">
      {left}
      {options.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Create a wallet on the Wallets page — paper for practice, or connect
          your Hyperliquid wallet.
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Select
          value={selectedValue ?? ""}
          onValueChange={onWalletChange}
          disabled={options.length === 0}
        >
          <SelectTrigger
            id="active-wallet"
            className="min-w-44 rounded-lg border-none bg-muted shadow-none"
          >
            <SelectValue
              placeholder={options.length === 0 ? "No wallets" : "Select wallet"}
            >
              {selectedOption ? (
                <>
                  <WalletOptionIcon kind={selectedOption.kind} />
                  <span>{selectedOption.label}</span>
                </>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            position="popper"
            side="bottom"
            align="end"
            avoidCollisions={false}
          >
            {[...paperOptions, ...testnetOptions, ...mainnetOptions].map(
              (option) => (
                <SelectItem key={option.value} value={option.value}>
                  <WalletOptionIcon kind={option.kind} />
                  <span>{option.label}</span>
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        {actions}
      </div>
    </div>
  )
}

function WalletOptionIcon({ kind }: { kind: WalletOption["kind"] }) {
  if (kind === "paper") {
    return <WalletIcon aria-hidden="true" className="size-4" />
  }

  return (
    <svg
      aria-hidden="true"
      className="size-4 text-[#50e3c2]"
      viewBox="0 0 144 144"
      fill="none"
    >
      <path
        d="M144 71.6991C144 119.306 114.866 134.582 99.5156 120.98C86.8804 109.889 83.1211 86.4521 64.116 84.0456C39.9942 81.0113 37.9057 113.133 22.0334 113.133C3.5504 113.133 0 86.2428 0 72.4315C0 58.3063 3.96809 39.0542 19.736 39.0542C38.1146 39.0542 39.1588 66.5722 62.132 65.1073C85.0007 63.5379 85.4184 34.8689 100.247 22.6271C113.195 12.0593 144 23.4641 144 71.6991Z"
        fill="currentColor"
      />
    </svg>
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
