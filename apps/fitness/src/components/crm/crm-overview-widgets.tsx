import * as React from "react"

import { Button } from "@/components/ui/button"
import { EmptyChart } from "@/components/shared/dashboard/chart-card"
import { DailyBarChart } from "@/components/shared/dashboard/daily-bar-chart"
import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import type { ChartConfig } from "@/components/ui/chart"
import type { CrmOverviewFigures } from "@/lib/api/crm/overview"
import { CRM_SHELL_WIDGETS, type CrmShellWidgetId } from "@/lib/admin-dashboard/overview-widgets"
import type { CrmInboxView } from "@/lib/crm/crm-search"

const CRM_WIDGET_BY_ID = new Map<string, (typeof CRM_SHELL_WIDGETS)[number]>(
  CRM_SHELL_WIDGETS.map((widget) => [widget.id, widget])
)

const mailConfig: ChartConfig = {
  mail: { label: "Mail in", color: "var(--primary)" },
}

/**
 * One of the CRM Overview's own widgets (CRM task 38, part 2), drawn for
 * `WidgetGrid`'s `drawWidget` when `isCrmShellWidgetId` says the id is one of
 * the shell's; any other id is the app's, which the grid draws itself.
 */
export function CrmOverviewWidget({
  id,
  figures,
  onOpenInbox,
}: {
  id: CrmShellWidgetId
  figures: CrmOverviewFigures
  onOpenInbox: (view: CrmInboxView) => void
}) {
  const widget = CRM_WIDGET_BY_ID.get(id)!
  const Icon = widget.icon
  const card = (body: React.ReactNode) => (
    <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
      {body}
    </WidgetCard>
  )

  switch (id) {
    case "unread":
      return card(
        <BigNumber
          value={figures.unread}
          line={figures.unread === 1 ? "conversation is unread" : "conversations are unread"}
          action={figures.unread > 0 ? "Open Unread" : null}
          onAction={() => onOpenInbox("unread")}
        />
      )
    case "waiting":
      return card(
        figures.waitingOn ? (
          <BigNumber
            value={figures.waiting}
            line={figures.waiting === 1 ? "person is waiting for an answer" : "people are waiting for an answer"}
            action={figures.waiting > 0 ? "Open Waiting" : null}
            onAction={() => onOpenInbox("waiting")}
          />
        ) : (
          <p className="p-3 text-sm text-muted-foreground">
            Unanswered mail is switched off in the CRM settings, so nobody counts as waiting.
          </p>
        )
      )
    case "mail-per-day":
      return card(
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {figures.mailPerDay.some((point) => point.mail > 0) ? (
            <DailyBarChart
              className="h-60 w-full min-w-0 @3xl:h-full @3xl:min-h-32"
              daily={figures.mailPerDay}
              config={mailConfig}
              bars={[{ key: "mail", value: (point) => point.mail }]}
              yAxisWidth={28}
            />
          ) : (
            <EmptyChart message="No mail has come in over the last 30 days." />
          )}
        </div>
      )
    case "first-answer":
      return card(
        figures.typicalFirstAnswerMs === null ? (
          <p className="p-3 text-sm text-muted-foreground">
            No answers yet. Conversations that started in the last 30 days show here once you reply to them.
          </p>
        ) : (
          <BigNumber
            value={answerTimeWords(figures.typicalFirstAnswerMs)}
            line={`is the typical wait for a first answer, over ${figures.answered.toLocaleString()} ${
              figures.answered === 1 ? "conversation" : "conversations"
            } in the last 30 days`}
          />
        )
      )
  }
}

/** One figure, large, with what it is under it and the press that opens it. */
function BigNumber({
  value,
  line,
  action = null,
  onAction,
}: {
  value: number | string
  line: string
  action?: string | null
  onAction?: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 p-4">
      <p className="text-3xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-sm text-muted-foreground">{line}</p>
      {action && onAction ? (
        <Button type="button" variant="link" size="sm" onClick={onAction} className="mt-1 h-auto w-fit px-0">
          {action}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * A wait in words a person says: "40 minutes", "3 hours", "2 days". Rounded to
 * the unit that carries it, because "3 hours 12 minutes" is more exact than a
 * middle of thirty conversations can honestly be.
 */
function answerTimeWords(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000))
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`
  const days = Math.round(hours / 24)
  return `${days} days`
}
