import { GaugeIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import { describeCode } from "@/lib/format/code-label"
import { formatDateTime } from "@/lib/format/format-time"
import type { MemberUsageSummary } from "@/lib/api/billing/billing"

export function AccountMeteredUsageCard({
  usage,
}: {
  usage: MemberUsageSummary
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3" className="flex items-center gap-2">
          <GaugeIcon className="size-4 text-muted-foreground" />
          Metered usage
        </CardTitle>
        <CardDescription>
          What your account has used since the start of this month.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {usage.totalEvents === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your account has no metered usage this month.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <UsageFigure
                label="Units this month"
                value={usage.totalQuantity.toLocaleString()}
              />
              <UsageFigure
                label="Events this month"
                value={usage.totalEvents.toLocaleString()}
              />
            </div>
            <MeterTotals rows={usage.byMeter} />
            <RecentUsage rows={usage.recent} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function UsageFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function MeterTotals({ rows }: { rows: MemberUsageSummary["byMeter"] }) {
  return (
    <TableSurface>
      <ScrollArea className="w-full">
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              <TableHead column="main">Meter</TableHead>
              <TableHead column="meta" className="text-right">
                Units
              </TableHead>
              <TableHead column="meta" className="text-right">
                Events
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.meter}>
                <TableCell column="main">{describeCode(row.meter)}</TableCell>
                <TableCell column="meta" className="text-right tabular-nums">
                  {row.quantity.toLocaleString()}
                </TableCell>
                <TableCell column="meta" className="text-right tabular-nums">
                  {row.events.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TableSurface>
  )
}

function RecentUsage({ rows }: { rows: MemberUsageSummary["recent"] }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">Recent usage</h3>
      <TableSurface>
        <ScrollArea className="w-full">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead column="meta">When</TableHead>
                <TableHead column="main">Meter</TableHead>
                <TableHead column="meta" className="text-right">
                  Units
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell column="mutedMeta">
                    {formatDateTime(row.occurredAt)}
                  </TableCell>
                  <TableCell column="main">{describeCode(row.meter)}</TableCell>
                  <TableCell column="meta" className="text-right tabular-nums">
                    {row.quantity.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TableSurface>
    </div>
  )
}
