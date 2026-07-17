import * as React from "react"

import { cn } from "@/lib/utils"

export function DashboardContent({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "min-w-0 w-full flex-1 overflow-auto bg-muted/60 p-3 space-y-4 sm:p-4 sm:space-y-6 md:p-6",
        className
      )}
      {...props}
    />
  )
}

