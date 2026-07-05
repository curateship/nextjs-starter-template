import { formatNotional } from "@/components/scanner/format"
import { cn } from "@/lib/utils"

/**
 * A USD amount coloured green on gains / red on losses, with a leading "+" on
 * gains and an em dash for null. `className` styles the text (font/size); the
 * colour is applied on top.
 */
export function SignedUsd({
  value,
  className,
}: {
  value: string | number | null
  className?: string
}) {
  const num = value === null ? null : Number(value)
  return (
    <span
      className={cn(
        className,
        num !== null && num > 0 && "text-emerald-600",
        num !== null && num < 0 && "text-red-500"
      )}
    >
      {num === null ? "—" : `${num > 0 ? "+" : ""}${formatNotional(num)}`}
    </span>
  )
}
