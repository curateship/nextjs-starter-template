import * as React from "react"

import { cn } from "@/lib/utils"

export function DashboardContent({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "min-w-0 w-full flex-1 space-y-2 overflow-auto bg-muted/60 p-2 md:space-y-3 md:p-3",
        className
      )}
      {...props}
    />
  )
}

export function DashboardRow({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("flex flex-col gap-2 md:gap-3 xl:flex-row", className)}
      {...props}
    />
  )
}
