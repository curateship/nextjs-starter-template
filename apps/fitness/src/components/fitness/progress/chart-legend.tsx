import { cn } from "@/lib/utils"

/**
 * The names of the series on a chart, each beside the mark it is drawn with,
 * so a series is never told apart by colour alone.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: { key: string; label: string; color: string; mark: "line" | "dashed" | "dot" }[]
  className?: string
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          {item.mark === "dot" ? (
            <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          ) : (
            <span
              className="w-4 border-t-2"
              style={{ borderColor: item.color, borderStyle: item.mark === "dashed" ? "dashed" : "solid" }}
              aria-hidden
            />
          )}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
