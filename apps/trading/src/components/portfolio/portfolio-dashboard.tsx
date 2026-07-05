import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadPortfolio, type PortfolioResponse } from "@/lib/api/portfolio"
import type { WalletItem } from "@/lib/api/wallets"
import { cn } from "@/lib/utils"

// Trading polarity pair, consistent with the price chart.
const UP = "#089981"
const DOWN = "#f23645"

export function PortfolioDashboard({
  wallets,
  initial,
}: {
  wallets: WalletItem[]
  initial: PortfolioResponse
}) {
  const [data, setData] = React.useState(initial)
  const [loading, setLoading] = React.useState(false)

  async function selectWallet(walletId: string) {
    setLoading(true)
    try {
      setData(await loadPortfolio(walletId))
    } finally {
      setLoading(false)
    }
  }

  const winRate =
    data.stats.wins + data.stats.losses > 0
      ? (data.stats.wins / (data.stats.wins + data.stats.losses)) * 100
      : null

  return (
    <div className="flex w-full flex-col gap-4 pb-12">
      <div className="flex items-center gap-2">
        <Label htmlFor="portfolio-wallet" className="text-xs text-muted-foreground">
          Wallet
        </Label>
        <Select
          value={data.walletId ?? ""}
          disabled={loading || wallets.length === 0}
          onValueChange={(value) => void selectWallet(value)}
        >
          <SelectTrigger id="portfolio-wallet" className="min-w-44">
            <SelectValue
              placeholder={wallets.length === 0 ? "No wallets" : "Select wallet"}
            />
          </SelectTrigger>
          <SelectContent>
            {wallets.map((wallet) => (
              <SelectItem key={wallet.id} value={wallet.id}>
                {wallet.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Realized PnL (90d)"
          value={`${data.stats.totalPnl >= 0 ? "+" : ""}$${data.stats.totalPnl.toFixed(2)}`}
          tone={
            data.stats.totalPnl > 0
              ? "up"
              : data.stats.totalPnl < 0
                ? "down"
                : undefined
          }
        />
        <StatTile label="Fees paid (90d)" value={`$${data.stats.fees.toFixed(2)}`} />
        <StatTile
          label="Win rate"
          value={
            winRate !== null
              ? `${winRate.toFixed(0)}% (${data.stats.wins}W/${data.stats.losses}L)`
              : "—"
          }
        />
        <StatTile label="Fills (90d)" value={String(data.stats.fills)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Equity curve</CardTitle>
          </CardHeader>
          <CardContent>
            {data.equity.length < 2 ? (
              <EmptyChart text="Equity snapshots appear once the worker has been running for a few minutes." />
            ) : (
              <ChartContainer
                config={{ equity: { label: "Equity", color: "var(--chart-1)" } }}
                className="h-56 w-full"
              >
                <LineChart data={data.equity} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.35} />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) =>
                      new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <YAxis
                    width={64}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                    tickFormatter={(value: number) => `$${value.toFixed(0)}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) =>
                          payload?.[0]
                            ? new Date(
                                payload[0].payload.t as number
                              ).toLocaleString("en-US", { hour12: false })
                            : ""
                        }
                      />
                    }
                  />
                  <Line
                    dataKey="equity"
                    type="monotone"
                    stroke="var(--color-equity)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily realized PnL</CardTitle>
          </CardHeader>
          <CardContent>
            {data.dailyPnl.length === 0 ? (
              <EmptyChart text="No realized PnL yet." />
            ) : (
              <ChartContainer
                config={{ pnl: { label: "PnL" } }}
                className="h-56 w-full"
              >
                <BarChart data={data.dailyPnl} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.35} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: string) => value.slice(5)}
                  />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `$${value.toFixed(0)}`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {data.dailyPnl.map((entry) => (
                      <Cell
                        key={entry.date}
                        fill={entry.pnl >= 0 ? UP : DOWN}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Per-market breakdown (90d)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Fills</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Realized PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.markets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-20 text-center text-xs text-muted-foreground"
                    >
                      No fills in the last 90 days.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.markets.map((market) => (
                    <TableRow key={market.coin}>
                      <TableCell className="font-medium">{market.coin}</TableCell>
                      <TableCell>{market.fills}</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        ${market.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono tabular-nums",
                          market.pnl > 0
                            ? "text-emerald-600"
                            : market.pnl < 0
                              ? "text-red-500"
                              : undefined
                        )}
                      >
                        {market.pnl >= 0 ? "+" : ""}
                        {market.pnl.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funding (30d)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Paid / received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.funding.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-20 text-center text-xs text-muted-foreground"
                    >
                      No funding events (funding accrues while holding positions).
                    </TableCell>
                  </TableRow>
                ) : (
                  [...data.funding].reverse().map((entry) => (
                    <TableRow key={`${entry.time}-${entry.coin}`}>
                      <TableCell className="font-mono text-[11px] tabular-nums">
                        {new Date(entry.time).toLocaleString("en-US", {
                          hour12: false,
                        })}
                      </TableCell>
                      <TableCell>{entry.coin}</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {(entry.rate * 100).toFixed(4)}%
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono tabular-nums",
                          entry.usdc > 0
                            ? "text-emerald-600"
                            : entry.usdc < 0
                              ? "text-red-500"
                              : undefined
                        )}
                      >
                        {entry.usdc >= 0 ? "+" : ""}
                        {entry.usdc.toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
        <div
          className={cn(
            "mt-1 font-mono text-sm tabular-nums",
            tone === "up" && "text-emerald-600",
            tone === "down" && "text-red-500"
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-56 items-center justify-center text-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}
