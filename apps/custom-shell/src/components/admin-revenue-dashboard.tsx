import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import type { RevenueSummary } from "@/lib/api/admin-users"
import { formatMoney } from "@/lib/money"

export function AdminRevenueDashboard({
  summary,
}: {
  summary: RevenueSummary
}) {
  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <div className="grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          value={formatMoney(summary.monthlyRecurringCents, summary.currency)}
          help="Yearly plans counted as a twelfth of their price."
        />
        <StatCard
          label="Paying subscribers"
          value={summary.paidSubscribers.toLocaleString()}
          help={`${summary.trialing} on a trial`}
        />
        <StatCard
          label="Cancelling"
          value={summary.cancelling.toLocaleString()}
          help="Still paid until their period ends."
        />
        <StatCard
          label="Accounts"
          value={summary.totalUsers.toLocaleString()}
          help={`${summary.verifiedUsers} verified`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by plan</CardTitle>
          <CardDescription>
            Only subscriptions that are live right now are counted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.planBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paid subscriptions yet.
            </p>
          ) : (
            <TableSurface>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Subscribers</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.planBreakdown.map((row) => (
                    <TableRow key={row.planId}>
                      <TableCell>{row.planName}</TableCell>
                      <TableCell>{row.subscribers}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.monthlyCents, summary.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableSurface>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  help,
}: {
  label: string
  value: string
  help?: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {/* Same variant as the size=sm title default so it overrides, not loses to, that rule. */}
        <CardTitle className="group-data-[size=sm]/card:text-2xl">{value}</CardTitle>
      </CardHeader>
      {help ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{help}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}
