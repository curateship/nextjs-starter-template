import { useNavigate, useRouter } from "@tanstack/react-router"
import { BotIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { signedUsd, toneClass } from "@/components/backtest/backtest-format"
import { BotStatusBadge } from "@/components/bots/bot-status-badge"
import { DashboardTable } from "@/components/dashboard-table"
import { IconButton } from "@/components/icon-button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteBot,
  getBotErrorMessage,
  loadBots,
  type BotListItem,
  type BotListResponse,
} from "@/lib/api/bots"
import { PREVIOUS_RUN_NAME_PREFIX } from "@/lib/backtest/types"
import { cn } from "@/lib/utils"
import { useIntervalLoader } from "@/lib/use-interval-loader"

/**
 * The bot run history — one row per run (like the backtest history). Bots are
 * deployed and named from the automation editor's Bot mode; this list only
 * opens, and deletes stopped, runs. The current unnamed "Previous run" shows
 * here too until the next deploy replaces it.
 */
export function BotRunsDashboard({ initial }: { initial: BotListResponse }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { data } = useIntervalLoader(() => loadBots(), initial)
  const runs = data.bots

  async function remove(bot: BotListItem) {
    try {
      await deleteBot(bot.id)
      await router.invalidate()
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    }
  }

  return (
    <DashboardTable
      title="Bot runs"
      icon={<BotIcon className="size-4" />}
      count={runs.length}
      footer={{ type: "summary", count: runs.length, label: "runs" }}
      content={
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead column="main">Run</TableHead>
            <TableHead column="meta">Status</TableHead>
            <TableHead column="meta">Mode</TableHead>
            <TableHead column="meta">Markets</TableHead>
            <TableHead column="meta" className="text-right">
              Realized P&L
            </TableHead>
            <TableHead column="meta" className="text-right">
              Fills
            </TableHead>
            <TableHead column="actions">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-32 text-center text-sm text-muted-foreground"
              >
                No bot runs yet. Open an automation and use its Bot tab to
                deploy one.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((bot) => {
              const replaceable = bot.name.startsWith(PREVIOUS_RUN_NAME_PREFIX)
              const deletable = ["stopped", "killed", "error"].includes(
                bot.status
              )
              return (
                <TableRow
                  key={bot.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void navigate({
                      to: "/bots/$botId",
                      params: { botId: bot.id },
                    })
                  }
                >
                  <TableCell column="main">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{bot.name}</span>
                      {replaceable ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px]"
                          title="Unnamed — the next deploy replaces it"
                        >
                          current
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell column="meta">
                    <BotStatusBadge bot={bot} />
                  </TableCell>
                  <TableCell column="meta">
                    <Badge
                      variant={bot.mode === "live" ? "default" : "secondary"}
                    >
                      {bot.mode}
                    </Badge>
                  </TableCell>
                  <TableCell column="meta" className="font-mono text-xs">
                    <span title={bot.markets.join(", ")}>
                      {bot.markets.slice(0, 3).join(", ")}
                      {bot.markets.length > 3
                        ? ` +${bot.markets.length - 3}`
                        : ""}
                    </span>
                  </TableCell>
                  <TableCell
                    column="meta"
                    className={cn(
                      "text-right font-mono tabular-nums",
                      toneClass(bot.realized_pnl)
                    )}
                  >
                    {signedUsd(bot.realized_pnl)}
                  </TableCell>
                  <TableCell
                    column="meta"
                    className="text-right font-mono tabular-nums"
                  >
                    {bot.trade_count}
                  </TableCell>
                  <TableCell
                    column="actions"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconButton
                      label={
                        deletable
                          ? "Delete run"
                          : "Stop the run before deleting it"
                      }
                      disabled={!deletable}
                      onClick={() => void remove(bot)}
                    >
                      <Trash2Icon className="size-4" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })
          )}
          </TableBody>
        </Table>
      }
    />
  )
}
