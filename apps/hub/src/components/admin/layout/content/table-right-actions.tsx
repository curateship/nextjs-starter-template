"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils/tailwind"

function TableRightActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

function TableRightActionsSearch({
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
          "h-8 w-full pr-8 pl-9 text-sm shadow-none sm:w-[180px] sm:pl-10 lg:w-[240px]",
          inputClassName
        )}
        {...props}
      />
      {hasValue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

function TableRightActionsSelectTrigger({
  className,
  size = "sm",
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      size={size}
      className={cn("h-8 w-fit text-xs shadow-none sm:text-sm", className)}
      {...props}
    />
  )
}

function TableRightActionsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className={cn("h-8 w-fit gap-2 sm:h-8", className)}
      {...props}
    />
  )
}

export {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
}
