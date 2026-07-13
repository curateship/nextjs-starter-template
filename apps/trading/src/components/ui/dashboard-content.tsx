import * as React from "react"

import { cn } from "@/lib/utils"

export function DashboardContent({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="dashboard-content"
      className={cn(
        "min-w-0 w-full flex-1 space-y-2 overflow-auto bg-muted/40 p-2 md:space-y-3 md:p-3",
        className
      )}
      {...props}
    />
  )
}
