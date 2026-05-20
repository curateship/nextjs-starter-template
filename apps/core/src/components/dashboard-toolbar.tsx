import * as React from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"

function DashboardToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4",
        className
      )}
      {...props}
    />
  )
}

function DashboardToolbarTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-1 items-center gap-2 sm:gap-2.5", className)}
      {...props}
    />
  )
}

function DashboardToolbarControls({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
  )
}

function DashboardToolbarSearch({
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof Input> & { inputClassName?: string }) {
  return (
    <div className={cn("relative flex-1 sm:flex-none", className)}>
      <SearchIcon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground sm:size-5"
        aria-hidden="true"
      />
      <Input
        type="search"
        inputMode="search"
        autoComplete="off"
        className={cn(
          "h-8 w-full pl-9 text-sm sm:h-9 sm:w-[180px] sm:pl-10 lg:w-[240px]",
          inputClassName
        )}
        {...props}
      />
    </div>
  )
}

function DashboardToolbarSelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger> & {
  labels?: readonly string[]
}) {
  return (
    <SelectTrigger
      className={cn("h-8 w-fit text-xs sm:h-9 sm:text-sm", className)}
      {...props}
    />
  )
}

export {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
}
