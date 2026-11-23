import { Card, CardContent } from "@/components/ui/card"
import {
  signedPct,
  formatPrice,
  toneClass,
} from "@/lib/format"
import { cn } from "@/lib/utils"

/** Mark price + signed 24h change, toned by the day's direction. */
export function MarkPriceInline({
  markPrice,
  dayChangePct,
  className,
}: {
  markPrice: number
  dayChangePct: number | null
  className?: string
}) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span
        className={cn(
          "font-mono text-base font-semibold",
          dayChangePct !== null ? toneClass(dayChangePct) : undefined
        )}
      >
        {markPrice > 0 ? `$${formatPrice(markPrice)}` : "—"}
      </span>
      <span
        className={cn(
          "font-mono text-[11px]",
          dayChangePct !== null ? toneClass(dayChangePct) : "text-muted-foreground"
        )}
      >
        {dayChangePct !== null ? `${signedPct(dayChangePct)} 24h` : "—"}
      </span>
    </div>
  )
}

/** Small stat card: label, headline value, sub-line; tone colors by sign. */
export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: number
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-base font-semibold",
            tone !== undefined ? toneClass(tone) : undefined
          )}
        >
          {value}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  )
}

/** Compact label/value line in a stats list; tone colors by sign. */
export function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: number
}) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono",
          tone !== undefined ? toneClass(tone) : "text-foreground/80"
        )}
      >
        {value}
      </span>
    </div>
  )
}
