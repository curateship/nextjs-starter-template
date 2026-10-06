import { Badge } from "@/components/ui/badge"
import type { ProxyTestResult } from "@/lib/social/options"
import { proxyTestWords } from "@/lib/browser/wording"

/**
 * A proxy's last test as a badge: its country and speed when it worked,
 * "Failed" with the reason beside it when it did not, "Untested" when nobody
 * has tested it. Drawn the same on both dashboards.
 */
export function ProxyTestBadge({
  result,
  compact = false,
}: {
  result: ProxyTestResult | null
  /** Just the badge, with a failure's reason on hover, for a narrow column. */
  compact?: boolean
}) {
  if (!result) {
    return <span className="text-xs text-muted-foreground">Untested</span>
  }
  if (!result.ok) {
    if (compact) {
      return (
        <Badge variant="destructive" className="w-fit" title={result.error}>
          Failed
        </Badge>
      )
    }
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Badge variant="destructive">Failed</Badge>
        <span
          className="max-w-56 truncate text-xs text-muted-foreground"
          title={result.error}
        >
          {result.error}
        </span>
      </span>
    )
  }
  const detail = [result.ip, result.isp, result.timezone].filter(Boolean).join(" · ")
  return (
    <Badge variant="outline" title={detail || undefined}>
      {proxyTestWords(result)}
    </Badge>
  )
}
