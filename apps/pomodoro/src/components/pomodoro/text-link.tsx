import { Link, type LinkProps } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

/**
 * A page named inside a sentence, as a link to that page. Underlined as well
 * as coloured, so it reads as a link without relying on colour alone.
 *
 * `onClick` is for a link inside a popover, which closes the popover on the
 * way out.
 */
export function TextLink({
  className,
  children,
  onClick,
  ...link
}: LinkProps & {
  className?: string
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      {...link}
      onClick={onClick}
      className={cn(
        "font-semibold text-[var(--p-accent-2)] underline underline-offset-2 hover:no-underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
    >
      {children}
    </Link>
  )
}
