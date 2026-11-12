import { cn } from "@/lib/utils"

/**
 * The one loading row for a panel that fetches its own contents: a modal's
 * card, a thread, a list inside a dialog.
 *
 * It draws nothing a person sees. No loading circle and no "Loading…" words
 * sit in a page's body (Tyler, 7 Nov 2026: "Unless the loading circle... is in
 * a button. Remove all loading circle... thats in a page body"; his 2 Nov 2026
 * rule on Video's panels already said the circle "causes a flicker"). The
 * space stays, so what loads does not jump the page, and the words stay for a
 * screen reader. A button that is working keeps its own small circle.
 *
 * A surface that is *refreshing* rather than loading keeps showing its previous
 * contents instead; this is only for a panel with nothing to show yet.
 */
export function LoadingRow({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid place-items-center py-8 text-sm text-muted-foreground",
        className
      )}
      role="status"
    >
      <span className="sr-only">{label}</span>
    </div>
  )
}
