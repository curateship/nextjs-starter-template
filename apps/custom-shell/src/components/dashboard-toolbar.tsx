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
          "h-8 w-full pr-8 pl-9 text-sm sm:h-9 sm:w-[180px] sm:pl-10 lg:w-[240px]",
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

function DashboardToolbarButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className={cn("h-8 w-fit gap-2 sm:h-9", className)}
      {...props}
    />
  )
}

export {
  DashboardToolbarButton,
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
}
