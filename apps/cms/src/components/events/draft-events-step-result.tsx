import { Link } from "@tanstack/react-router"

import type { AutomationNodeRunResultProps } from "@/lib/automations/node-descriptor"
import { formatEventShortDay } from "@/lib/events/event-time"

type Drafted = { id: string; title: string; startDate: string }
type Skipped = { title: string; reason: string }

/**
 * What one Draft events run did, inside the run history: each draft with a
 * link to its window in Admin → Events, and each event it left out with why.
 * The shape is `DraftEventsOutput` in `server/events/ai-drafts.ts`, read
 * defensively because a stored run outlives the code that wrote it.
 */
export default function DraftEventsRunResult({
  output,
}: AutomationNodeRunResultProps) {
  const record = isRecord(output) ? output : {}
  const drafted = (Array.isArray(record.drafted) ? record.drafted : []).filter(
    (item): item is Drafted =>
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.startDate === "string"
  )
  const skipped = (Array.isArray(record.skipped) ? record.skipped : []).filter(
    (item): item is Skipped =>
      isRecord(item) &&
      typeof item.title === "string" &&
      typeof item.reason === "string"
  )
  const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl : ""

  return (
    <div className="grid min-w-0 gap-2 text-xs">
      {sourceUrl ? (
        <p className="min-w-0 truncate text-muted-foreground">
          Read{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {sourceUrl}
          </a>
        </p>
      ) : null}
      {drafted.length ? (
        <ul className="grid gap-1">
          {drafted.map((item) => (
            <li key={item.id} className="flex min-w-0 gap-2">
              <span className="shrink-0 text-muted-foreground">
                {formatEventShortDay(item.startDate)}
              </span>
              <Link
                to="/admin/events"
                search={{ status: "draft", open: item.id }}
                className="min-w-0 truncate underline underline-offset-2"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {skipped.length ? (
        <div className="grid gap-1">
          <p className="font-medium">Left out</p>
          <ul className="grid gap-1 text-muted-foreground">
            {skipped.map((item, index) => (
              <li key={`${index}-${item.title}`} className="min-w-0 break-words">
                <span className="text-foreground">{item.title}</span>:{" "}
                {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
