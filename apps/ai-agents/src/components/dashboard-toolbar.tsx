import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
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

const dashboardToolbarSegmentedGroupClassName =
  "flex items-center gap-1 rounded-lg bg-muted p-1"
const dashboardToolbarSegmentedButtonClassName =
  "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-all"
const dashboardToolbarSegmentedButtonActiveClassName =
  "bg-card text-foreground shadow-sm"
const dashboardToolbarSegmentedButtonInactiveClassName =
  "text-muted-foreground hover:text-foreground"
const dashboardToolbarButtonGroupClassName =
  "flex h-8 overflow-hidden rounded-lg border"
const dashboardToolbarButtonGroupItemClassName =
  "h-full border-0 first:rounded-r-none last:rounded-l-none"
const dashboardToolbarButtonActiveClassName =
  "border-primary bg-primary bg-clip-border text-primary-foreground hover:bg-primary hover:text-primary-foreground"
const dashboardToolbarButtonActiveFilterClassName = "border-primary"
const dashboardToolbarMutedButtonClassName =
  "text-muted-foreground hover:text-foreground"
const dashboardToolbarFilterChipClassName =
  "inline-flex h-5 cursor-pointer items-center gap-1 rounded-md bg-gray-50 px-2 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 sm:h-6 sm:text-xs dark:bg-gray-800/50 dark:text-gray-400 dark:ring-gray-400/20"
const dashboardToolbarClearButtonClassName =
  "text-[10px] text-destructive hover:underline sm:text-xs"

function DashboardToolbarSearch({
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof Input> & { inputClassName?: string }) {
  const hasValue = props.value != null && String(props.value).length > 0

  return (
    <div className={cn("relative flex-1 sm:flex-none", className)}>
      <SearchIcon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground sm:size-5"
        aria-hidden="true"
      />
      <Input
        type="text"
        inputMode="search"
        autoComplete="off"
        className={cn(
          "h-8 w-full pr-8 pl-9 text-sm sm:w-[180px] sm:pl-10 lg:w-[240px]",
          inputClassName
        )}
        {...props}
      />
      {hasValue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() =>
            props.onChange?.({
              target: { value: "" },
              currentTarget: { value: "" },
            } as React.ChangeEvent<HTMLInputElement>)
          }
          aria-label="Clear search"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

function DashboardToolbarSelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn("h-8 w-fit text-sm", className)}
      {...props}
    />
  )
}

function DashboardToolbarButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className={cn("h-8 w-fit gap-2", className)}
      {...props}
    />
  )
}

export {
  DashboardToolbarButton,
  DashboardToolbar,
  DashboardToolbarControls,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonActiveFilterClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  dashboardToolbarClearButtonClassName,
  dashboardToolbarFilterChipClassName,
  dashboardToolbarMutedButtonClassName,
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedGroupClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
}
